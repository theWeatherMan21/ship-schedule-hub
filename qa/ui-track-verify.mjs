// 「提单/箱号」页签 · 无头视觉+功能验收（婉宜 10-10 · UI 卡的 DoD 证据）
//
// 做法（真数据 → 真界面，一步不省）：
//   ① 读取已保存的官方追踪结果缓存（不打船司网络）
//   ② 起本地静态服务载入真实 dist，注入 Tauri 运行时桩并回放 CLI 事件
//   ③ 点页签 → 输入单号 → 查询 → 断言摘要/完整时间线 → 截图
//
// 不开爹地的屏幕：全程 headless（外面用 qa/quiet-probe.sh 包一层还会核对屏幕窗口数）。
// 用法：SSH_PROFILE_DIR=<隔离档案> node qa/ui-track-verify.mjs [输出目录] [单号]
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeTracking } from '../engine/tracking/normalize.mjs';

const PROJ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(PROJ, 'dist');
const OUT = process.argv[2] || path.join(process.env.TMPDIR || PROJ, 'ssh-track-ui');
const NUMBER = process.argv[3] || '276759780';
const CONTAINER = 'MRKU8582679';
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const ok = (cond, label, extra = '') => { console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? '　' + extra : ''}`); if (!cond) failures++; };

// ---------- ① 读取已保存的官网结果（只读、不访问船司） ----------
const CACHE_DIR = path.join(process.env.HOME, 'Library', 'Application Support', 'ShipScheduleHub', 'evidence', 'cache');
function cachedResult(carrier, number) {
  for (const file of fs.readdirSync(CACHE_DIR).filter((name) => name.startsWith('track-') && name.endsWith('.json'))) {
    try {
      const envelope = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
      const saved = envelope.result;
      if (saved?.carrier !== carrier || saved?.number !== number || !saved.ok) continue;
      const normalized = normalizeTracking({ ...saved, raw: saved.raw || null });
      return { ...saved, ...normalized, carrier, number, cached: true, cachedAgoMin: Math.max(1, Math.round((Date.now() - envelope.at) / 60000)) };
    } catch { /* Ignore unrelated or malformed cache files. */ }
  }
  return null;
}
const fixtures = {
  maersk: cachedResult('maersk', '276759780'),
  msc: cachedResult('msc', 'MSCU7325344'),
  one: cachedResult('one', 'SZPG70884900'),
};
for (const [carrier, result] of Object.entries(fixtures)) {
  ok(!!result, `${carrier} saved official-result snapshot available`, result ? `${result.events.length} events` : 'missing');
}
const done = fixtures.maersk;
if (done) {
  ok(/departure/i.test(String(done.current?.activity || '')), 'Maersk snapshot current is ACTUAL departure', String(done.current?.activity));
  ok(!!done.eta?.time, 'Maersk ETA snapshot exists', `${done.eta.time} @ ${done.eta.city}`);
}
function eventPayloads(result) {
  const carrierLabel = { maersk: 'Maersk', msc: 'MSC', one: 'ONE' }[result.carrier] || result.carrier;
  return [
    { type: 'track-started', number: result.number, carrier: result.carrier, label: carrierLabel },
    { type: 'track-result', ...result, carrierLabel },
    { type: 'track-exit', ok: true, cached: true, ms: 0 },
  ];
}
const fixturePayloads = Object.fromEntries(Object.entries(fixtures).filter(([, result]) => !!result).map(([carrier, result]) => [carrier, eventPayloads(result)]));
const selectedFixture = { current: done, msc: fixtures.msc, one: fixtures.one };
console.log('     fixture provenance: previously saved official result cache; UI event replay is offline (no carrier requests).');



// ---------- 静态服务 ----------
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }   // 别让浏览器自动请求污染「无 JS 报错」判据
  const p = path.join(DIST, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  let body = null;
  try { body = fs.readFileSync(p); } catch { /* 读不到就 404（写头之前先读，避免 writeHead 两次） */ }
  if (!body) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
  res.end(body);
});
await new Promise((r) => srv.listen(18933, r));

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

await page.addInitScript(({ fixturePayloads }) => {
  window.__calls = [];
  window.__cbMap = {};
  window.__cbSeq = 1;
  window.__listenEvents = [];
  window.__fixturePayloads = fixturePayloads;
  window.__selectedCarrier = '';
  const deliver = (event, payload) => {
    for (const entry of Object.values(window.__cbMap)) if (entry.event === event) { try { entry.cb({ event, id: 1, payload }); } catch { /* isolate listener failures */ } }
  };
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      window.__calls.push({ cmd, args });
      if (cmd === 'plugin:event|listen') {
        const id = args.handler;
        window.__listenEvents.push(args.event);
        window.__cbMap[id].event = args.event;
        return 1;
      }
      if (cmd === 'selftest_enabled') return false;
      if (cmd === 'track_selftest') return null;
      if (cmd === 'diagnose') return {};
      if (cmd === 'run_track') {
        const carrier = args?.args?.carrier || window.__selectedCarrier || 'maersk';
        const payloads = window.__fixturePayloads[carrier];
        if (!payloads || payloads[1]?.number !== args?.args?.number) {
          setTimeout(() => deliver('track://event', { type: 'track-error', code: 'fixture-missing', msg: `No saved offline fixture for ${carrier}` }), 0);
          return { ok: true };
        }
        for (const p of payloads) setTimeout(() => deliver('track://event', p), 40);
        return { ok: true };
      }
      if (cmd === 'stop_track') return { ok: true };
      return { ok: true };
    },
    transformCallback: (cb) => { const id = window.__cbSeq++; window.__cbMap[id] = { event: null, cb }; return id; },
    metadata: {},
    convertFileSrc: (p) => p,
  };
}, { fixturePayloads });

await page.goto('http://127.0.0.1:18933/');
await page.waitForTimeout(1500);

// ---------- ② Maersk 摘要与时间线 ----------
console.log('═══ ② Maersk summary and timeline ═══');
ok(await page.isVisible('#tabs'), 'tab bar exists');
ok((await page.locator('#tabs .tab').allTextContents()).join('/') === '船期/提单/箱号', 'tab labels');
await page.click('#tabs .tab[data-v="track"]');
await page.waitForTimeout(200);
ok(await page.isVisible('#viewTrack') && await page.isHidden('#viewSched'), 'tracking tab is active');
await page.fill('#trackNum', done.number);
const hint = (await page.textContent('#trackHint') || '').trim();
ok(/Maersk/i.test(hint), 'number input predicts carrier', hint);
await page.click('#btnTrackGo');
await page.waitForSelector('#trackCard', { timeout: 10000 });
await page.waitForTimeout(250);
const tmain = (await page.textContent('.tmain') || '').trim();
const tmeta = (await page.textContent('.tmeta') || '').trim();
ok(/departure/i.test(tmain) && /XINGANG/i.test(tmain), 'summary shows current ACTUAL status/location', tmain);
ok(/ETA/i.test(tmeta), 'summary includes ETA', tmeta);
ok(!/arrival/i.test(tmain), 'future arrival is not shown as current');
ok(await page.isHidden('.tbody'), 'timeline starts collapsed');
await page.screenshot({ path: path.join(OUT, 'track-summary.png') });
await page.click('#trackCard');
await page.waitForTimeout(200);
const rows = await page.locator('.tbody .tev').count();
const est = await page.locator('.tbody .tev.est').count();
ok(await page.isVisible('.tbody'), 'summary click expands timeline');
ok(rows === done.events.length, `timeline row count matches saved result (${done.events.length})`, `${rows} rows`);
ok(est === 3, 'EXPECTED events are visually differentiated', `${est} rows`);
const firstRow = (await page.textContent('.tbody .tev')).replace(/\s+/g, ' ').trim();
ok(/09-15/.test(firstRow), 'timeline is chronological', firstRow);
await page.screenshot({ path: path.join(OUT, 'track-timeline.png') });

await page.focus('#trackCard');
await page.keyboard.press('Enter');
ok(await page.isHidden('.tbody'), 'Enter collapses timeline');
await page.keyboard.press('Space');
ok(await page.isVisible('.tbody'), 'Space expands timeline');
ok((await page.getAttribute('#trackCard', 'aria-expanded')) === 'true', 'expanded state is accessible');
ok(/cached .*min ago/.test(await page.textContent('#trackSummary')), 'cache age is visible');
await page.fill('#trackNum', 'MSKU3077039');
ok(/校验位/.test(await page.textContent('#trackHint')), 'invalid container gets checksum warning');
await page.click('#btnTrackGo');
ok((await page.evaluate(() => window.__calls.filter((x) => x.cmd === 'run_track').length)) === 1, 'invalid checksum does not auto-query');
await page.fill('#trackNum', 'NYKU1234560');
ok(/校验位|ONE/.test(await page.textContent('#trackHint')), 'shared detector handles NYKU owner code');
await page.fill('#trackNum', 'MEDU1234567');
const looseHint = (await page.textContent('#trackHint') || '');
ok(/MSC/.test(looseHint) && /校验位/.test(looseHint), '11-digit BL form with SCAC prefix is recognized (scac-loose)', looseHint);

// ---------- ③ 未识别号拦在前端，不启动引擎 ----------
console.log('═══ ③ Unknown number guard ═══');
const unknown = 'M237055674';
await page.fill('#trackNum', unknown);
await page.click('#btnTrackGo');
const callsBeforeManual = await page.evaluate(() => window.__calls.filter((x) => x.cmd === 'run_track').length);
ok((await page.textContent('#trackResult') || '').includes('Cannot identify carrier'), 'unknown number gets actionable error');
ok(callsBeforeManual === 1, 'unknown number does not spawn a carrier query');

// ---------- ④ MSC container manual selection ----------
console.log('═══ ④ MSC container manual selection ═══');
await page.fill('#trackNum', fixtures.msc.number);
await page.selectOption('#trackCarrier', 'msc');
await page.evaluate(() => { window.__selectedCarrier = document.querySelector('#trackCarrier').value; });
await page.click('#btnTrackGo');
await page.waitForTimeout(250);
const mscCard = (await page.textContent('#trackResult') || '').replace(/\s+/g, ' ').trim();
const mscRows = await page.locator('.tbody .tev').count();
ok(mscCard.includes(fixtures.msc.number), 'selected MSC result card contains queried number', mscCard.slice(0, 120));
ok(mscRows === fixtures.msc.events.length, 'MSC timeline shows all saved events', `${mscRows}/${fixtures.msc.events.length}`);
await page.screenshot({ path: path.join(OUT, 'track-msc-container.png') });

// ---------- ⑤ Layout check ----------
console.log('═══ ⑤ Layout check ═══');
await page.evaluate(() => { const c = document.getElementById('trackCard'); if (c && !c.classList.contains('open')) c.click(); });
await page.waitForTimeout(200);
const layout = await page.evaluate(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), l: +r.left.toFixed(1), r: +r.right.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const clipped = [...document.querySelectorAll('.tbody .tev')].filter((el) => el.scrollWidth > el.clientWidth + 1).length;
  const tmain = box('.tmain'), tmeta = box('.tmeta'), route = box('.troute'), card = box('.trackcard');
  const overlap = (a, b) => !!(a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b);
  return {
    card, viewport: { w: window.innerWidth, h: window.innerHeight },
    clipped, rows: document.querySelectorAll('.tbody .tev').length,
    overlaps: { 'route/tmain': overlap(route, tmain), 'tmain/tmeta': overlap(tmain, tmeta) },
    estOpacity: getComputedStyle(document.querySelector('.tbody .tev.est')).opacity,
    actOpacity: getComputedStyle(document.querySelector('.tbody .tev:not(.est)')).opacity,
    activeTab: (document.querySelector('#tabs .tab.active') || {}).textContent,
  };
});
ok(layout.clipped === 0, '时间线无横向截断', `${layout.rows} 行`);
ok(!layout.overlaps['route/tmain'] && !layout.overlaps['tmain/tmeta'], '摘要各行互不重叠', JSON.stringify(layout.overlaps));
ok(layout.card && layout.card.w > 600 && layout.card.h > 100, '结果卡尺寸正常', layout.card ? `${layout.card.w}×${layout.card.h}` : 'missing');
ok(layout.card && layout.card.r <= layout.viewport.w && layout.card.b <= layout.viewport.h, '结果卡在视口内（无溢出）', `${layout.viewport.w}×${layout.viewport.h}`);
ok(Number(layout.estOpacity) < Number(layout.actOpacity), 'EXPECTED events appear lighter', `est ${layout.estOpacity} < actual ${layout.actOpacity}`);
ok(layout.activeTab === '提单/箱号', 'tracking tab remains active', String(layout.activeTab));
await page.screenshot({ path: path.join(OUT, 'track-msc-timeline.png') });

console.log('═══ ONE manual fallback ═══');
await page.fill('#trackNum', fixtures.one.number);
await page.selectOption('#trackCarrier', 'one');
await page.click('#btnTrackGo');
await page.waitForTimeout(250);
ok((await page.textContent('#trackResult')).includes(fixtures.one.number), 'ONE bare document number works with manual carrier');
ok(await page.locator('.tbody .tev').count() === fixtures.one.events.length, 'ONE renders all container timeline events');
await page.click('#trackCard');
await page.screenshot({ path: path.join(OUT, 'track-one-timeline.png') });

// Verify a process failure restores the form even after a successful result.
await page.evaluate(() => {
  for (const entry of Object.values(window.__cbMap)) if (entry.event === 'track://event') {
    entry.cb({ payload: { type: 'track-started', number: 'TEST' } });
    entry.cb({ payload: { type: 'track-error', msg: 'Carrier request blocked by verification' } });
  }
});
ok((await page.textContent('#trackResult')).includes('blocked by verification'), 'carrier error remains visible');
await page.click('#tabs .tab[data-v="sched"]');
ok(await page.isVisible('#viewSched') && await page.isHidden('#viewTrack'), 'schedule tab still works');

console.log('═══ Event bridge checks ═══');
const calls = await page.evaluate(() => window.__calls.map((c) => c.cmd));
ok(calls.includes('run_track'), 'UI invokes run_track');
ok((await page.evaluate(() => window.__listenEvents)).includes('track://event'), 'UI listens on track://event');
ok(calls.includes('stop_track') === false, 'no unnecessary stop_track invocation in normal query');
ok(errs.length === 0, 'no page JS errors', errs.slice(0, 2).join(' | '));

await browser.close();
srv.close();
console.log(`\\n${failures === 0 ? '✅ ALL PASS' : `❌ ${failures} checks failed`} screenshots: ${OUT}/track-summary.png, ${OUT}/track-timeline.png, ${OUT}/track-msc-container.png`);
process.exit(failures === 0 ? 0 : 1);

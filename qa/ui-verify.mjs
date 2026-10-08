// 前端 UI 验收（不开爹地的屏幕）：Playwright 载真实 dist + 注入 Tauri 运行时桩，
// 用像素和 DOM 双重证据验证：
//   ① 搜索框：输入港口名（识别提示出现）后，三个输入框是否仍在同一水平线上
//   ② 折叠：点卡片头 → 卡片体收起；再点 → 展开；有无 JS 报错
// 用法：node qa/ui-verify.mjs [输出目录]
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/dist';
const OUT = process.argv[2] || '/tmp/ssh-ui';
fs.mkdirSync(OUT, { recursive: true });

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try {
    const d = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(18932, r));

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

await page.addInitScript(() => {
  window.__calls = [];
  window.__cbMap = {};
  window.__cbSeq = 1;
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      window.__calls.push({ cmd, args });
      if (cmd === 'plugin:event|listen') { window.__listenEvent = args.event; return 1; }
      if (cmd === 'diagnose') {
        return {
          platform: 'win32', arch: 'x86_64', node: 'C:\\Program Files\\ShipScheduleHub\\engine\\node-bin\\node.exe',
          nodeExists: true, script: 'C:\\Program Files\\ShipScheduleHub\\engine\\query.mjs', scriptExists: true,
          playwrightCore: true, portsDb: true, dataDir: 'C:\\Users\\x\\AppData\\Local\\ShipScheduleHub',
          chrome: 'edge → C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        };
      }
      return { ok: true };
    },
    transformCallback: (cb) => { const id = window.__cbSeq++; window.__cbMap[id] = cb; return id; },
    metadata: {},
    convertFileSrc: (p) => p,
  };
});

await page.goto('http://127.0.0.1:18932/');
await page.waitForTimeout(1200);

const emit = (payload) => page.evaluate((p) => {
  const id = Object.keys(window.__cbMap)[0];
  window.__cbMap[id]({ event: 'engine://event', id: 1, payload: p });
}, payload);

// ---------- ① 搜索框对齐 ----------
await page.fill('#origin', 'Ningbo');
await page.fill('#destination', 'Istanbul');
// 让识别提示出现（真实 App 由端口词典异步填 hint）
await page.evaluate(() => {
  const set = (id, html) => { const el = document.getElementById(id); if (el) { el.className = 'porthint ok'; el.innerHTML = html; } };
  set('originHint', '✓ 识别为 Ningbo (CNNBO / CN)<br><span class="near">同港区：Ningbo Pt / Beilun / Huangxian / Daxie Pt</span>');
  set('destinationHint', '✓ 识别为 Istanbul (TRIST · TR)');
});
await page.waitForTimeout(300);

const geom = await page.evaluate(() => {
  const g = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1) }; };
  return { origin: g('#origin'), dest: g('#destination'), date: g('#date'), go: g('#btnGo'), stop: g('#btnStop') };
});
console.log('═══ ① 搜索框几何（输入 + 提示出现后）═══');
for (const [k, v] of Object.entries(geom)) console.log(`  ${k.padEnd(7)} top=${v.top}  bottom=${v.bottom}  高=${v.h}`);
const tops = [geom.origin.top, geom.dest.top, geom.date.top];
const spread = Math.max(...tops) - Math.min(...tops);
console.log(`  三个输入框顶边极差 = ${spread.toFixed(1)}px  ${spread <= 1 ? '✅ 对齐' : '❌ 一高一低'}`);
const btnDiff = Math.abs(geom.go.top - geom.origin.top);
console.log(`  按钮与输入框顶边差 = ${btnDiff.toFixed(1)}px  ${btnDiff <= 1.5 ? '✅ 同排' : '⚠️ 不齐'}`);
await page.screenshot({ path: path.join(OUT, '1-form.png') });

// ---------- ② 卡片渲染 + 折叠 ----------
await page.click('#btnGo');
await page.waitForTimeout(800);
await emit({ type: 'engine-started' });
const dstr = (dayOffset) => new Date(Date.UTC(2026, 9, 3 + dayOffset)).toISOString().slice(0, 10);
const mk = (carrier, name, n) => ({
  type: 'carrier-status', carrier, name, status: 'done',
  msg: `API 直查 ${n} 条`,
  schedules: Array.from({ length: n }, (_, i) => ({
    vessel: `${name} VESSEL ${i + 1}`, voyage: `0${i}1W`, etd: dstr(i * 7), eta: dstr(i * 7 + 30), transitDays: 30 + i, via: '', direct: true,
  })),
});
for (const [c, n, nm] of [['one', 8, 'ONE 海洋网联'], ['oocl', 11, 'OOCL 东方海外'], ['msc', 8, 'MSC 地中海航运']]) {
  await emit(mk(c, nm, n));
  await page.waitForTimeout(150);
}
await page.waitForTimeout(400);

const before = await page.evaluate(() => {
  const gs = [...document.querySelectorAll('.cgroup')];
  return { cards: gs.length, bodies: gs.filter((g) => g.querySelector('.cbody') && g.querySelector('.cbody').offsetParent !== null).length };
});
await page.screenshot({ path: path.join(OUT, '2-cards.png'), fullPage: true });
console.log('\n═══ ② 折叠 ═══');
console.log(`  渲染卡片 ${before.cards} 张，其中展开 ${before.bodies} 张`);
const badges = await page.evaluate(() => [...document.querySelectorAll('.cgroup')].map((g) => g.querySelector('.cname').textContent + '=' + g.querySelector('.badge').textContent + '(行' + g.querySelectorAll('.trow').length + ')'));
console.log('  各家角标:', badges.slice(0, 4).join(' | '));

// 点第一张卡片的头
await page.click('.cgroup:nth-child(1) .chead');
await page.waitForTimeout(400);
const after = await page.evaluate(() => {
  const g = document.querySelector('.cgroup');
  const body = g.querySelector('.cbody');
  return {
    collapsed: g.classList.contains('collapsed'),
    bodyVisible: body.offsetParent !== null,
    chev: getComputedStyle(g.querySelector('.chev')).transform,
    badge: g.querySelector('.badge')?.textContent,
  };
});
console.log(`  点一次头部 → collapsed=${after.collapsed}  body 可见=${after.bodyVisible}  箭头 transform=${after.chev}  角标=${after.badge}`);
await page.screenshot({ path: path.join(OUT, '3-collapsed.png'), fullPage: true });

await page.click('.cgroup:nth-child(1) .chead');
await page.waitForTimeout(400);
const back = await page.evaluate(() => {
  const g = document.querySelector('.cgroup');
  return { collapsed: g.classList.contains('collapsed'), bodyVisible: g.querySelector('.cbody').offsetParent !== null };
});
console.log(`  再点一次     → collapsed=${back.collapsed}  body 可见=${back.bodyVisible}`);
await page.screenshot({ path: path.join(OUT, '4-expanded.png'), fullPage: true });

// ---------- ④ 引擎挂掉时的可见性（Windows「点了没反应」的核心诉求）----------
await emit({ type: 'engine-stderr', msg: "Error: Cannot find module 'playwright-core'" });
await page.waitForTimeout(200);
const warn1 = await page.evaluate(() => (document.getElementById('errBox').hidden ? '' : document.getElementById('errBox').textContent));
await emit({ type: 'engine-exit', total: 0, prefilled: 0, opened: 0, failed: 0 });
await page.waitForTimeout(300);
const warn2 = await page.evaluate(() => (document.getElementById('errBox').hidden ? '' : document.getElementById('errBox').textContent) + ' || 摘要: ' + document.getElementById('summary').textContent);
console.log('\n═══ ④ 引擎报错可见性 ═══');
console.log('  收到 stderr 后 错误条:', warn1.slice(0, 90));
console.log('  引擎退出后   错误条+摘要:', warn2.slice(0, 110));
console.log(`  ${/playwright-core|引擎/.test(warn1 + warn2) ? '✅ 能看到原因（不再静默）' : '❌ 仍然静默'}`);

// ---------- ⑤ 诊断面板 ----------
await page.click('#btnDiag');
await page.waitForTimeout(400);
const diag = await page.evaluate(() => {
  const b = document.getElementById('diagBox');
  return { hidden: b.hidden, text: b.innerText.replace(/\s+/g, ' ').slice(0, 200) };
});
console.log('\n═══ ⑤ 诊断面板 ═══');
console.log(`  hidden=${diag.hidden}`);
console.log('  内容:', diag.text || '(空)');
await page.screenshot({ path: path.join(OUT, '5-diagnostics.png'), fullPage: true });

// ---------- ⑥ 船期行详情（航程 + 截单）----------
const detailRow = {
  type: 'carrier-status', carrier: 'msc', name: 'MSC 地中海航运', status: 'done', msg: 'API 直查 8 条',
  schedules: [{
    vessel: 'MSC VIVIANA', voyage: 'GT637W', etd: '2026-10-09', eta: '2026-11-04', transitDays: 26, via: '', direct: true,
    detail: {
      service: 'TIGER SERVICE', routing: 'Direct', co2: '1.1465 Tons',
      legs: [{
        seq: 1, from: 'NINGBO', fromCode: 'CNNGB', fromTerminal: 'GANGJI TERMINAL (PHASE IV)',
        etd: 'Fri 9th Oct 2026 08:00', to: 'ISTANBUL', toCode: 'TRIST', toTerminal: 'MARPORT TERMINAL',
        eta: 'Wed 4th Nov 2026 14:30', vessel: 'MSC VIVIANA', imo: '9777216', built: '2017', flag: 'LIBERIA',
        service: 'TIGER SERVICE', co2: '1.1465 Tons',
        calls: ['SHEKOU(CNSHK)', 'SINGAPORE(SGSIN)', 'TEKIRDAG (ASYAPORT)(TRTEK)', 'EVYAP PORT(TREYP)'],
      }],
      cutoffs: {
        'CY 截关': 'Sun 20th Sep 2026 14:00', 'VGM 截止': 'Sun 20th Sep 2026 14:00',
        '提单指示': 'Sun 20th Sep 2026 14:00', '危险品': 'Wed 16th Sep 2026 12:00',
        '冷藏箱': 'Sun 20th Sep 2026 14:00',
      },
    },
  }],
};
// 有真实数据就用真实的（/tmp/msc-real.json 由部署态引擎跑出来）
let useRow = detailRow;
try {
  const real = JSON.parse(fs.readFileSync('/tmp/msc-real.json', 'utf8'));
  if (real && real.schedules && real.schedules.length) {
    useRow = { ...real, schedules: real.schedules.slice(0, 3) };
    console.log('（使用真实 MSC 数据渲染）');
  }
} catch { /* 没有真实数据就用 mock */ }
await emit(useRow);
await page.waitForTimeout(400);
console.log('\n═══ ⑥ 船期行详情 ═══');
const before6 = await page.evaluate(() => {
  const w = document.querySelector('.trow-wrap.expandable');
  return { hasExpandable: !!w, openBefore: w ? w.classList.contains('open') : null, detailVisible: w ? (w.querySelector('.tdetail')?.offsetParent !== null) : null };
});
console.log(`  可展开行: ${before6.hasExpandable}  展开前 detail 可见: ${before6.detailVisible}`);

await page.click('.trow-wrap.expandable .trow');
await page.waitForTimeout(400);
const after6 = await page.evaluate(() => {
  const w = document.querySelector('.trow-wrap.expandable');
  const d = w.querySelector('.tdetail');
  return {
    open: w.classList.contains('open'),
    visible: d.offsetParent !== null,
    text: d.innerText.replace(/\s+/g, ' ').slice(0, 260),
    cuts: [...d.querySelectorAll('.dcut')].length,
    legs: [...d.querySelectorAll('.dleg')].length,
  };
});
console.log(`  点一下 → open=${after6.open}  可见=${after6.visible}  航程段=${after6.legs}  截单项=${after6.cuts}`);
console.log('  内容:', after6.text);
// 出图前清掉自检残留（错误条/诊断面板是第④⑤节造的，不是真实状态）
await page.evaluate(() => {
  const e = document.getElementById('errBox'); if (e) { e.hidden = true; e.textContent = ''; }
  const d = document.getElementById('diagBox'); if (d) d.hidden = true;
  document.getElementById('engineState').textContent = 'engine 在线';
  document.getElementById('engineDot').className = 'engine-dot on';
});
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT, '6-row-detail.png'), fullPage: true });

await page.click('.trow-wrap.expandable .trow');
await page.waitForTimeout(300);
const toggleBack = await page.evaluate(() => document.querySelector('.trow-wrap.expandable').classList.contains('open'));
console.log(`  再点一下 → open=${toggleBack}`);

// ---------- ⑦ 查询中换条件重查（爹地 9-30 报的错）----------
// 先把状态复位（前面几节的小测试没发 engine-exit）
await emit({ type: 'engine-exit', total: 0, prefilled: 0, opened: 0, failed: 0 });
await page.waitForTimeout(400);
await page.evaluate(() => { window.__calls.length = 0; });
await page.fill('#origin', 'Shanghai');
await page.fill('#destination', 'Rotterdam');
await page.click('#btnGo');                          // 第一次查询
await page.waitForTimeout(600);
const afterFirst = await page.evaluate(() => ({
  calls: window.__calls.map((c) => c.cmd),
  btn: document.getElementById('btnGo').textContent,
  btnDisabled: document.getElementById('btnGo').disabled,
}));
console.log('\n═══ ⑦ 查询中重查 ═══');
console.log(`  第一次点：调用=${afterFirst.calls.join(',')}  按钮="${afterFirst.btn}" disabled=${afterFirst.btnDisabled}`);

// 引擎还在跑（没发 engine-exit）→ 改港口再点
await page.fill('#origin', 'Qingdao');
await page.click('#btnGo');
await page.waitForTimeout(600);
const duringSecond = await page.evaluate(() => ({
  calls: window.__calls.map((c) => c.cmd),
  summary: document.getElementById('summary').textContent.slice(0, 60),
  errShown: !document.getElementById('errBox').hidden,
}));
console.log(`  查询中再点：调用=${duringSecond.calls.join(',')}`);
console.log(`    summary="${duringSecond.summary}"  错误条显示=${duringSecond.errShown}（应为 false）`);

// 旧引擎退出 → 应自动开始新查询
await emit({ type: 'engine-exit', total: 0, prefilled: 0, opened: 0, failed: 0 });
await page.waitForTimeout(800);
const afterExit = await page.evaluate(() => ({
  calls: window.__calls.map((c) => c.cmd),
  lastArgs: (window.__calls.filter((c) => c.cmd === 'run_query').slice(-1)[0] || {}).args,
}));
console.log(`  旧引擎退出后：调用序列=${afterExit.calls.join(',')}`);
console.log(`    最后一次查询条件=${JSON.stringify(afterExit.lastArgs && afterExit.lastArgs.args)}`);
const ranTwice = afterExit.calls.filter((c) => c === 'run_query').length >= 2;
const stopped = afterExit.calls.includes('stop_query');
console.log(`  ${ranTwice && stopped ? '✅ 自动停旧+跑新（无报错）' : '❌ 未按预期重查'}`);
await page.screenshot({ path: path.join(OUT, '7-restart.png'), fullPage: true });

// ---------- ⑧ 前端刁钻操作（逆着前端逻辑）----------
console.log('\n═══ ⑧ 前端刁钻操作 ═══');
// 8.1 空港口直接点查询 → 应高亮 invalid、不发请求
await emit({ type: 'engine-exit', total: 0, prefilled: 0, opened: 0, failed: 0 });
await page.waitForTimeout(300);
await page.evaluate(() => { window.__calls.length = 0; });
await page.fill('#origin', '');
await page.fill('#destination', '');
await page.click('#btnGo');
await page.waitForTimeout(400);
const r81 = await page.evaluate(() => ({
  calls: window.__calls.map((c) => c.cmd),
  invalid: [...document.querySelectorAll('input.invalid')].map((e) => e.id),
  focused: document.activeElement && document.activeElement.id,
}));
console.log(`  8.1 空港口点查询：请求=${r81.calls.length} 高亮=${r81.invalid.join(',')} 焦点=${r81.focused}  ${r81.calls.length === 0 && r81.invalid.length ? '✅' : '❌'}`);

// 8.2 近似匹配/未识别的港口提示（shan → Shannon 隐患）
await page.fill('#origin', 'shan');
await page.waitForTimeout(200);
const r82 = await page.evaluate(() => {
  const h = document.getElementById('originHint');
  return { cls: h.className, text: h.textContent.slice(0, 70) };
});
console.log(`  8.2 "shan" 提示：class="${r82.cls}" 文案="${r82.text}"  ${/warn/.test(r82.cls) ? '✅ 有警告（不是假装精确）' : '❌ 仍显示为精确识别'}`);

await page.fill('#origin', 'asdfghjkl');
await page.waitForTimeout(200);
const r83 = await page.evaluate(() => {
  const h = document.getElementById('originHint');
  return { cls: h.className, text: h.textContent.slice(0, 80) };
});
console.log(`  8.3 未识别港口提示：class="${r83.cls}" 文案="${r83.text}"  ${/warn/.test(r83.cls) ? '✅' : '❌ 静默无提示'}`);

// 8.4 全不选船司 → 应 alert 拦截（alert 会被 playwright 自动 dismiss）
await page.fill('#origin', 'Ningbo');
await page.fill('#destination', 'Istanbul');
await page.evaluate(() => { window.__calls.length = 0; document.querySelectorAll('#carrierList input').forEach((b) => { b.checked = false; }); });
let alerted = false;
page.on('dialog', async (d) => { alerted = true; await d.dismiss(); });
await page.click('#btnGo');
await page.waitForTimeout(500);
const r84 = await page.evaluate(() => window.__calls.map((c) => c.cmd));
console.log(`  8.4 全不选船司：alert=${alerted} 请求=${r84.length}  ${alerted && !r84.includes('run_query') ? '✅ 拦住了' : '❌'}`);

// 8.5 连点 3 次 → 不应因此报错（应只跑一轮 + 排队一次）
await page.evaluate(() => { window.__calls.length = 0; document.querySelectorAll('#carrierList input').forEach((b) => { b.checked = true; }); });
await page.click('#btnGo');
await page.waitForTimeout(250);
await page.click('#btnGo');
await page.click('#btnGo');
await page.waitForTimeout(500);
const r85 = await page.evaluate(() => ({
  calls: window.__calls.map((c) => c.cmd),
  errShown: !document.getElementById('errBox').hidden,
  btn: document.getElementById('btnGo').textContent,
}));
console.log(`  8.5 连点 3 次：调用=${r85.calls.join(',')} 错误条=${r85.errShown} 按钮="${r85.btn}"  ${!r85.errShown && r85.calls.filter((c) => c === 'run_query').length === 1 ? '✅ 只有一轮 + 排队' : '⚠️ 看调用序列'}`);
await emit({ type: 'engine-exit', total: 0, prefilled: 0, opened: 0, failed: 0 });
await page.waitForTimeout(600);
const r85b = await page.evaluate(() => window.__calls.map((c) => c.cmd));
console.log(`      退出后：${r85b.join(',')}  ${r85b.filter((c) => c === 'run_query').length >= 2 ? '✅ 自动重查' : '⚠️'}`);
await page.screenshot({ path: path.join(OUT, '8-adversarial-ui.png'), fullPage: true });

console.log('\n═══ ③ 报错 ═══');
console.log('  页面错误数:', errs.length);
errs.slice(0, 6).forEach((e) => console.log('   ', e));
console.log('\n截图:', OUT);

srv.close();
await browser.close();
process.exit(0);

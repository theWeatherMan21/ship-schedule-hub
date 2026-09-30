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

console.log('\n═══ ③ 报错 ═══');
console.log('  页面错误数:', errs.length);
errs.slice(0, 6).forEach((e) => console.log('   ', e));
console.log('\n截图:', OUT);

srv.close();
await browser.close();
process.exit(0);

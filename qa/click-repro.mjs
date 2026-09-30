import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/dist';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try {
    const d = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(18931, r));

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 300)));

// 关键：注入 Tauri 运行时桩，让 invoke / listen 都能走通
await page.addInitScript(() => {
  window.__calls = [];
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => { window.__calls.push({ cmd, args }); return { ok: true }; },
    transformCallback: (cb) => { window.__cb = cb; return 1; },
    metadata: {},
    convertFileSrc: (p) => p,
  };
});

await page.goto('http://127.0.0.1:18931/');
await page.waitForTimeout(1500);

await page.fill('#origin', 'Ningbo');
await page.fill('#destination', 'Istanbul');
await page.waitForTimeout(600);

// 点「并发查询」——这就是爹地点的那一下
await page.click('#btnGo');
await page.waitForTimeout(2500);

const state = await page.evaluate(() => ({
  engineState: document.getElementById('engineState').textContent,
  btn: document.getElementById('btnGo').textContent,
  btnDisabled: document.getElementById('btnGo').disabled,
  summary: document.getElementById('summary').textContent,
  rows: [...document.querySelectorAll('.srow')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
  calls: window.__calls,
  fatal: document.getElementById('summary').textContent.includes('⚠'),
}));

console.log('=== 点击「并发查询」后的真实状态 ===');
console.log('engine 状态 :', state.engineState);
console.log('按钮        :', state.btn, 'disabled=', state.btnDisabled);
console.log('summary     :', state.summary);
console.log('船司状态行  :', state.rows.length, state.rows.slice(0, 4));
console.log('invoke 调用 :', JSON.stringify(state.calls));
console.log('页面错误    :', errs.length);
errs.slice(0, 5).forEach((e) => console.log('  ', e));

srv.close();
await browser.close();
process.exit(0);

import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import path from 'node:path';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (/error/i.test(m.type())) errs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 250)));
import http from 'node:http';
import fs from 'node:fs';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = path.join('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/dist', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try { const d = fs.readFileSync(p); res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(d); } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(18923, r));
await page.goto('http://127.0.0.1:18923/').catch((e) => errs.push('goto: ' + String(e).slice(0, 100)));
await new Promise((r) => setTimeout(r, 5000));
// 点查询按钮
const btn = await page.$('#btnGo');
console.log('btnGo 存在:', !!btn);
if (btn) { await btn.click().catch((e) => errs.push('click: ' + String(e).slice(0, 100))); await new Promise((r) => setTimeout(r, 3000)); }
console.log('console 错误:', errs.length);
errs.slice(0, 6).forEach((e) => console.log('  ', e));
srv.close();
await browser.close();
process.exit(0);

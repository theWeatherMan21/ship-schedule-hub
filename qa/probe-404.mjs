import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

const DIST = path.resolve('dist');
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(DIST, rel === '/' ? 'index.html' : rel);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  const ext = path.extname(p);
  res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.json' ? 'application/json' : 'text/html' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
page.on('response', (r) => { if (r.status() >= 400) console.log('  ❌ HTTP', r.status(), r.url()); });
page.on('requestfailed', (r) => console.log('  ⚠️ failed:', r.url(), r.failure()?.errorText));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await browser.close();
server.close();

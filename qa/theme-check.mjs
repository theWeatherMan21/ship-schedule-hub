// 深色/浅色主题**真实像素**断言（CSS 侧）：截图后解码，量右侧内容区亮度
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

function decodePng(buf) {
  let pos = 8, idat = [], W = 0, H = 0, ctype = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), typ = buf.toString('ascii', pos + 4, pos + 8);
    const ch = buf.subarray(pos + 8, pos + 8 + len);
    if (typ === 'IHDR') { W = ch.readUInt32BE(0); H = ch.readUInt32BE(4); ctype = ch[9]; }
    else if (typ === 'IDAT') idat.push(ch);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ctype === 6 ? 4 : 3, stride = W * bpp + 1;
  let prev = Buffer.alloc(W * bpp); const rows = [];
  for (let y = 0; y < H; y++) {
    const f = raw[y * stride]; const line = Buffer.from(raw.subarray(y * stride + 1, (y + 1) * stride));
    if (f === 1) for (let i = bpp; i < line.length; i++) line[i] = (line[i] + line[i - bpp]) & 255;
    else if (f === 2) for (let i = 0; i < line.length; i++) line[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < line.length; i++) { const a = i >= bpp ? line[i - bpp] : 0; line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255; }
    else if (f === 4) for (let i = 0; i < line.length; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    prev = line; rows.push(Buffer.from(line));
  }
  return { W, H, bpp, rows };
}

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
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = { invoke: async () => ({ ok: true }), transformCallback: () => 1 };
});
await page.goto(base, { waitUntil: 'load' });
await page.addStyleTag({ content: 'html,body{background:#20242c !important} #app{background:#20242c !important}' }); // 模拟"材质底色"，方便看 CSS 层是否足够遮住/融合

for (const mode of ['dark', 'light']) {
  await page.evaluate((m) => { document.documentElement.dataset.mode = m; }, mode);
  await page.waitForTimeout(300);
  const shot = await page.screenshot();
  const { W, H, bpp, rows } = decodePng(shot);
  const at = (x, y) => rows[y][x * bpp] + rows[y][x * bpp + 1] + rows[y][x * bpp + 2];
  const pts = { 顶栏: at(600, 22), 左侧栏: at(100, 300), 右内容中: at(800, 400), 右内容下: at(800, 700) };
  const right = Math.min(pts.右内容中, pts.右内容下) / 3;
  const ok = mode === 'dark' ? right < 160 : right > 170;
  console.log(`  ${mode === 'dark' ? '深色' : '浅色'}: ` + Object.entries(pts).map(([k, v]) => `${k}=${(v / 3).toFixed(0)}`).join('  ') + `   ${ok ? '✅' : '❌ 亮度不对'}`);
}
await browser.close();
server.close();

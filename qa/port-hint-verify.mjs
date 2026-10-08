// 港口识别「界面提示」验收：载真实 dist + Tauri 桩，逐字输入并读提示栏。
// 用法：node qa/port-hint-verify.mjs     退出码 0=全过
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/dist';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  let d = null;
  try { d = fs.readFileSync(p); } catch { /* 读不到再回 404 */ }
  if (d) { res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(d); }
  else { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(18934, r));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd) => (cmd === 'plugin:event|listen' ? 1 : (cmd === 'diagnose' ? {} : 1)),
    transformCallback: (cb) => cb,
  };
});
await page.goto('http://127.0.0.1:18934/');
await page.waitForTimeout(2500); // 等 port-aka.json / ports.json 两个动态 import

const CASES = [
  ['Portland', ['USPDX', 'US']],           // 改前会显示澳大利亚
  ['Alexandria', ['EGALY', 'EG']],         // 改前会显示美国小镇
  ['SHA', ['CNSHG', 'CN']],                // 改前是沙迦 AE —— 现在必须是上海
  ['Genoa', ['ITGOA', 'IT']],              // 改前词典里没有
  ['Chittagong', ['BDCGP', 'BD']],         // 改前词典里没有
  ['Pusan', ['KRPUS', 'KR']],              // 旧名
  ['LAX', ['USLAX', 'US']],                // 缩写
  ['Roterdam', ['NLRTM', 'NL']],           // 拼错
  ['Port of Spain', ['TTPOS', 'TT']],      // 连字符变体
  ['Ningbo-Zhoushan', ['CNNGB', 'CN']],
  ['Atlantis', ['词典里没有']],             // 必须明确告知未识别
];
let pass = 0; const fails = [];
for (const [input, expects] of CASES) {
  await page.fill('#origin', '');
  await page.fill('#origin', input);
  await page.dispatchEvent('#origin', 'input');
  await page.waitForTimeout(220);
  const hint = (await page.textContent('#originHint')) || '';
  const ok = expects.every((e) => hint.includes(e));
  if (ok) pass++; else fails.push(`${input} → 提示「${hint.trim().slice(0, 90)}」缺 ${expects.join('/')}`);
  console.log(`  ${ok ? '✅' : '❌'} ${input.padEnd(18)} ${hint.trim().replace(/\s+/g, ' ').slice(0, 76)}`);
}
await page.screenshot({ path: '/tmp/port-hint.png' });
await browser.close(); srv.close();
console.log(`\n界面提示验收：${pass}/${CASES.length} 通过`);
for (const f of fails) console.log('  ✗ ' + f);
process.exit(fails.length ? 1 : 0);

// 勾选状态持久化验收（10-15）：浏览器载入 dist → 勾掉 3 家 → reload → 断言恢复
// 运行：node qa/carrier-persist-test.mjs（需 engine/node_modules 的 playwright-core）
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = new URL('../dist', import.meta.url).pathname;

let chromium;
try { ({ chromium } = await import('../engine/node_modules/playwright-core/index.mjs')); }
catch { try { ({ chromium } = await import('playwright-core')); } catch { console.error('✗ 找不到 playwright-core'); process.exit(1); } }

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const f = join(root, decodeURIComponent(p));
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': mime[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--headless=new'],
});
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForSelector('#carrierList input');
await page.waitForTimeout(400);

// ① 首次打开：应全勾（11 家）
const total = await page.locator('#carrierList input').count();
let checked = await page.locator('#carrierList input:checked').count();
console.log(`① 首次：共 ${total} 家、勾 ${checked}`);
const t1 = total === 11 && checked === 11;

// ② 勾掉 msc / maersk / cma（点 label 更接近真实操作）
for (const id of ['msc', 'maersk', 'cma']) {
  await page.click(`#carrierList input[data-id="${id}"]`);
}
await page.waitForTimeout(300);
const stored = await page.evaluate(() => localStorage.getItem('ssh.carrierSel'));
console.log(`② 勾掉 3 家后 localStorage = ${stored}`);
const t2 = (() => { try { const a = JSON.parse(stored); return a.length === 8 && !a.includes('msc') && !a.includes('maersk') && !a.includes('cma'); } catch { return false; } })();

// ③ reload（模拟重启 App）：应恢复 8 勾、3 不勾
await page.reload();
await page.waitForSelector('#carrierList input');
await page.waitForTimeout(300);
checked = await page.locator('#carrierList input:checked').count();
const mscChecked = await page.locator('#carrierList input[data-id="msc"]').isChecked();
console.log(`③ 重载后：勾 ${checked} 家；msc 勾=${mscChecked}`);
const t3 = checked === 8 && mscChecked === false;

// ④-a 「全选/清空」按钮路径（语义：有缺→全勾；全勾→全清），且联动持久化
// 当前 8 勾（有缺）→ 第一次点 = 全勾 11；第二次点（全勾态）= 全清 0
await page.click('#selAll');
await page.waitForTimeout(200);
const afterFirst = await page.locator('#carrierList input:checked').count();
await page.click('#selAll');
await page.waitForTimeout(200);
const afterClear = await page.locator('#carrierList input:checked').count();
const clearedStored = await page.evaluate(() => localStorage.getItem('ssh.carrierSel'));
console.log(`④a 两次点「全选/清空」：${afterFirst} → ${afterClear} 家；存 = ${clearedStored}`);
const t4a = afterFirst === 11 && afterClear === 0 && clearedStored !== null && JSON.parse(clearedStored).length === 0;
// （注：真实使用中「全清」后即点查询会由 collectQuery 校验；此断言只验按钮与持久化联动）

// ④-b 空集兜底：手动存空数组（模拟「全清后就关 App」）→ reload → 应回全选
await page.evaluate(() => localStorage.setItem('ssh.carrierSel', '[]'));
await page.reload();
await page.waitForSelector('#carrierList input');
await page.waitForTimeout(300);
const afterReload = await page.locator('#carrierList input:checked').count();
console.log(`④b 存空集→重载：勾 ${afterReload} 家（预期 11 = 回全选）`);
const t4 = afterReload === 11;
const t4all = t4a && t4;

console.log(errors.length ? `pageerror: ${errors.join(' | ')}` : 'pageerror: 无');
const all = t1 && t2 && t3 && t4all;
console.log(all ? '\n✓ ALL PASS（持久化逻辑正确）' : `\n✗ FAIL: t1=${t1} t2=${t2} t3=${t3} t4a=${t4a} t4b=${t4}`);

await browser.close();
server.close();
process.exit(all ? 0 : 1);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { reuse: true });
await sleep(12000);
const before = new Set(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)));
// 触发一次真实查询：起运 Ningbo → 目的 Istanbul
try {
  const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].map((i, idx) => ({ idx, ph: i.placeholder, cls: i.className.slice(0, 40), type: i.type })).slice(0, 10));
  console.log('输入框:', JSON.stringify(inputs));
  // 第一个像港口的输入框输入 ningbo
  const sel = 'input[placeholder*="Port" i], input[placeholder*="city" i], input[placeholder*="起运" i], .ivu-input:not([type=hidden])';
  const loc = page.locator(sel).first();
  await loc.click({ timeout: 8000 });
  await page.keyboard.type('ningbo', { delay: 90 });
  await sleep(4000);
  // 选候选
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await sleep(2500);
  const loc2 = page.locator(sel).nth(1);
  await loc2.click({ timeout: 8000 }).catch(() => {});
  await page.keyboard.type('istanbul', { delay: 90 }).catch(() => {});
  await sleep(4000);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter').catch(() => {});
  await sleep(2500);
  // 点搜索
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => /search|查询|Search/i.test(b.textContent))?.click(); });
  await sleep(12000);
} catch (e) { console.log('交互:', String(e).slice(0, 100)); }
const after = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fresh = after.filter((u) => !before.has(u) && !/\.(css|js|png|svg|woff|ico)/.test(u) && !/analytics|collect|beacon/i.test(u));
console.log('\n查询触发的新请求:');
fresh.slice(0, 15).forEach((u) => console.log('  ', u.slice(0, 170)));
fs.writeFileSync('../docs/cosco-flow.json', JSON.stringify(fresh, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

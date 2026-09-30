// 用准确的 placeholder 选择器
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { reuse: true });
await sleep(12000);
const before = new Set(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)));
const fromInp = page.locator('input[placeholder="Origin City (City,Province,Country/Region)"]');
const toInp = page.locator('input[placeholder="Destination City (City,Province,Country/Region)"]');
await fromInp.click({ timeout: 10000 });
await page.keyboard.type('ningbo', { delay: 90 });
await sleep(4500);
// 候选是 ivu-select-item
const pick1 = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.ivu-select-item, .ivu-select-dropdown li')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent));
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 60); }
  return null;
});
console.log('起运候选:', pick1);
await sleep(2000);
await toInp.click({ timeout: 10000 });
await page.keyboard.type('istanbul', { delay: 90 });
await sleep(4500);
const pick2 = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.ivu-select-item, .ivu-select-dropdown li')].filter((el) => el.offsetParent !== null && /istanbul/i.test(el.textContent));
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 60); }
  return null;
});
console.log('目的候选:', pick2);
await sleep(2000);
// 点搜索按钮
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => /search|查询/i.test(b.textContent || b.innerText))?.click(); });
await sleep(13000);
const after = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fresh = after.filter((u) => !before.has(u) && !/\.(css|js|png|svg|woff|ico)/.test(u) && !/analytics|collect|beacon|error/i.test(u));
console.log('\n查询新请求:');
fresh.slice(0, 12).forEach((u) => console.log('  ', u.slice(0, 170)));
fs.writeFileSync('../docs/cosco-flow.json', JSON.stringify(fresh, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

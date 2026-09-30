import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
const before = new Set(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)));
// CMA 表单：origin/destination 输入 + 搜索按钮
try {
  const oInp = page.locator('input[placeholder*="origin" i], input[placeholder*="from" i], #origin').first();
  await oInp.click({ timeout: 10000 });
  await page.keyboard.type('ningbo', { delay: 80 });
  await sleep(4000);
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('[class*=suggestion] li, [class*=autocomplete] li, [class*=result] li, ul li')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent));
    if (items.length) items[0].click();
  });
  await sleep(2500);
  const dInp = page.locator('input[placeholder*="destination" i], input[placeholder*="to" i], #destination').first();
  await dInp.click({ timeout: 10000 });
  await page.keyboard.type('istanbul', { delay: 80 });
  await sleep(4000);
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('[class*=suggestion] li, [class*=autocomplete] li, [class*=result] li, ul li')].filter((el) => el.offsetParent !== null && /istanbul/i.test(el.textContent));
    if (items.length) items[0].click();
  });
  await sleep(2500);
  await page.evaluate(() => { [...document.querySelectorAll('button, input[type=submit]')].find((b) => /search/i.test(b.textContent || b.value || ''))?.click(); });
  await sleep(14000);
} catch (e) { console.log('交互:', String(e).slice(0, 90)); }
const after = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fresh = after.filter((u) => !before.has(u) && !/\.(css|js|png|svg|woff|ico)/.test(u) && !/analytics|contentsquare|cookielaw|walkme|maze|datadome/i.test(u));
console.log('查询新请求:');
fresh.slice(0, 12).forEach((u) => console.log('  ', u.slice(0, 170)));
fs.writeFileSync('../docs/cma-flow.json', JSON.stringify(fresh, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

// POST 通了（200，业务码 500 = 参数名不对：「起运地名称无效」）。抓真实 POST 的 body
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { reuse: true });
await sleep(10000);
let realBody = null;
ctx.on('request', (req) => {
  if (req.url().includes('purpoShipmentWs') && !realBody) {
    realBody = req.postData();
    console.log('🎯 真实请求体:', req.postData());
  }
});
// 走一遍 UI
const fromInp = page.locator('input[placeholder="Origin City (City,Province,Country/Region)"]');
const toInp = page.locator('input[placeholder="Destination City (City,Province,Country/Region)"]');
await fromInp.click({ timeout: 10000 });
await page.keyboard.type('ningbo', { delay: 90 });
await sleep(4000);
await page.evaluate(() => { const i = [...document.querySelectorAll('.ivu-select-item')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent))[0]; if (i) i.click(); });
await sleep(2000);
await toInp.click({ timeout: 10000 });
await page.keyboard.type('istanbul', { delay: 90 });
await sleep(4000);
await page.evaluate(() => { const i = [...document.querySelectorAll('.ivu-select-item')].filter((el) => el.offsetParent !== null && /istanbul/i.test(el.textContent))[0]; if (i) i.click(); });
await sleep(2000);
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => /search|查询/i.test(b.textContent || b.innerText))?.click(); });
await sleep(12000);
console.log(realBody ? '✅ 拦到' : '❌ 没拦到');
await ctx.close().catch(() => {});
process.exit(0);

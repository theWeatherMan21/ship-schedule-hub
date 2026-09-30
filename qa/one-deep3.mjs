import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/manage-shipment/create-booking', { reuse: true });
await sleep(12000);
console.log('主页:', await page.evaluate(() => document.body.innerText.length));
const d = new Date().toISOString().slice(0, 10);
const u = `https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=&destLocNmParam=&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=${d}&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=${+d.slice(0,4)}&month=${+d.slice(5,7)}&searchType=List&isPolPodOn=false`;
await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
for (let i = 0; i < 10; i++) {
  await sleep(3000);
  const st = await page.evaluate(() => ({ len: document.body.innerText.length, head: document.body.innerText.replace(/\s+/g, ' ').slice(0, 130) }));
  console.log(i, JSON.stringify(st));
}
await ctx.close().catch(() => {});
process.exit(0);

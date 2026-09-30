import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=NINGBO%2C+ZHEJIANG%2C+CHINA&destLocNmParam=ISTANBUL%2C+TURKEY&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=2026-09-23&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=2026&month=9&searchType=List&isPolPodOn=false', { reuse: true });
await sleep(28000);
const r = await page.evaluate(() => {
  const t = document.body.innerText;
  const i = t.indexOf('Origin');
  const seg = t.slice(i >= 0 ? i : 0, (i >= 0 ? i : 0) + 1800).replace(/\s+/g, ' ');
  return seg;
});
console.log(r);
await ctx.close().catch(() => {});
process.exit(0);

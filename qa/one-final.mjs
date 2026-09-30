// URL 深链参数全拿到了！用它直开结果页（oriLocCdParam=CNNGB&destLocCdParam=TRIST...）看发什么 API
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=NINGBO%2C+ZHEJIANG%2C+CHINA&destLocNmParam=ISTANBUL%2C+TURKEY&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=2026-09-23&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=2026&month=9&searchType=List&isPolPodOn=false', { reuse: true });
await sleep(20000);
console.log('标题:', await page.title().catch(() => '?'));
// 结果渲染了吗
const txt = await page.evaluate(() => {
  const t = document.body.innerText;
  const m = t.match(/(ETD|ETA|Transit|Vessel|Voyage)/gi);
  return { hasResult: !!m, nTransit: (t.match(/transit/gi) || []).length, sample: t.replace(/\s+/g, ' ').slice(0, 300) };
}).catch((e) => ({ err: String(e).slice(0, 80) }));
console.log('结果页:', JSON.stringify(txt).slice(0, 400));
await ctx.close().catch(() => {});
process.exit(0);

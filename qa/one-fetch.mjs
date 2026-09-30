import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=NINGBO%2C+ZHEJIANG%2C+CHINA&destLocNmParam=ISTANBUL%2C+TURKEY&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=2026-09-23&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=2026&month=9&searchType=List&isPolPodOn=false', { reuse: true });
await sleep(20000);
const r = await page.evaluate(async () => {
  const tries = [
    '/api/v1/schedule/point-to-point/result?oriLocCd=CNNGB&destLocCd=TRIST&frmDt=2026-09-23&cargoNature=GP',
    '/api/v1/schedule/point-to-point/schedules?oriLocCd=CNNGB&destLocCd=TRIST&frmDt=2026-09-23',
    '/one-ecom/api/v1/schedule/point-to-point/search?oriLocCd=CNNGB&destLocCd=TRIST',
  ];
  const out = [];
  for (const p of tries) {
    try {
      const resp = await fetch(p, { headers: { accept: 'application/json' } });
      const t = await resp.text();
      out.push({ p, status: resp.status, len: t.length, head: t.slice(0, 120) });
    } catch (e) { out.push({ p, error: String(e).slice(0, 80) }); }
  }
  return out;
});
console.log(JSON.stringify(r, null, 1).slice(0, 900));
await ctx.close().catch(() => {});
process.exit(0);

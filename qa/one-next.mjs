import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=NINGBO%2C+ZHEJIANG%2C+CHINA&destLocNmParam=ISTANBUL%2C+TURKEY&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=2026-09-23&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=2026&month=9&searchType=List&isPolPodOn=false', { reuse: true });
await sleep(26000);
const r = await page.evaluate(() => {
  // 找结果区域文本（含船名/日期）
  const t = document.body.innerText;
  const idx = t.indexOf('ETD');
  const hasVessel = /Vessel/i.test(t);
  // next data
  const nd = document.getElementById('__NEXT_DATA__');
  return {
    hasVessel,
    resultText: idx >= 0 ? t.slice(idx, idx + 400).replace(/\s+/g, ' ') : '(无 ETD 字样)',
    hasNextData: !!nd,
    ndLen: nd ? nd.textContent.length : 0,
    ndSample: nd ? nd.textContent.slice(0, 300) : '',
  };
});
console.log(JSON.stringify(r, null, 1).slice(0, 800));
await ctx.close().catch(() => {});
process.exit(0);

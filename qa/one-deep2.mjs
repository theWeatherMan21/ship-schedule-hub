import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'about:blank', { reuse: true });
const d = new Date().toISOString().slice(0, 10);
const u = `https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=&destLocNmParam=&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=${d}&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=${+d.slice(0,4)}&month=${+d.slice(5,7)}&searchType=List&isPolPodOn=false`;
try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) { console.log('goto:', String(e).slice(0, 60)); }
for (let i = 0; i < 12; i++) {
  await sleep(2500);
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return { hasTotal: /Total \d+ results/.test(t), hasDays: /day\(s\)/.test(t), len: t.length, url: location.href.slice(0, 90) };
  });
  console.log(i, JSON.stringify(st));
  if (st.hasTotal || st.hasDays) break;
}
const txt = await page.evaluate(() => {
  const t = document.body.innerText;
  const i = t.indexOf('Origin');
  return t.slice(i >= 0 ? i : 0, (i >= 0 ? i : 0) + 800).replace(/\s+/g, ' ');
});
console.log('文字:', txt.slice(0, 500));
await ctx.close().catch(() => {});
process.exit(0);

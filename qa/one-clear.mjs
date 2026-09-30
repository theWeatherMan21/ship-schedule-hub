import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
await ctx.clearCookies().catch(() => {});
console.log('cookies 已清');
await page.goto('https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
for (let i = 0; i < 10; i++) {
  await sleep(3000);
  const len = await page.evaluate(() => document.body.innerText.length);
  console.log(i, 'len=', len);
  if (len > 2000) break;
}
const d = new Date().toISOString().slice(0, 10);
await page.goto(`https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=&destLocNmParam=&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=${d}&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=${+d.slice(0,4)}&month=${+d.slice(5,7)}&searchType=List&isPolPodOn=false`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
for (let i = 0; i < 12; i++) {
  await sleep(3000);
  const st = await page.evaluate(() => ({ len: document.body.innerText.length, ok: /Total \d+ results|day\(s\)/.test(document.body.innerText) }));
  console.log('deep', i, JSON.stringify(st));
  if (st.ok) { console.log('✅ 渲染出来了'); break; }
}
const txt = await page.evaluate(() => { const t = document.body.innerText; const i = t.indexOf('Total'); return i >= 0 ? t.slice(Math.max(0, i - 300), i + 400).replace(/\s+/g, ' ') : '(无 Total)'; });
console.log(txt.slice(0, 600));
await ctx.close().catch(() => {});
process.exit(0);

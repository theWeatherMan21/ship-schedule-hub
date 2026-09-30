// vesselDetails 里应该有船名
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en', { reuse: true });
await sleep(20000);
const r = await page.evaluate(async () => {
  const resp = await fetch('https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=PLGDN&startDate=2026-09-24&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=42GP', {
    headers: { accept: 'application/json', 'x-token': 'public' },
  });
  const j = await resp.json();
  const legs = (j.routes[0].legs || []);
  return {
    vesselDetails: legs.map((lg) => lg.vesselDetails),
    voyageNumbers: legs.map((lg) => ({ vn: lg.voyageNumber, svn: lg.scheduleVoyageNumber, svc: lg.serviceCode, name: lg.serviceName })),
  };
});
console.log(JSON.stringify(r, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});
process.exit(0);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en', { reuse: true });
await sleep(20000);
const r = await page.evaluate(async () => {
  const resp = await fetch('https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=PLGDN&startDate=2026-09-24&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=42GP', { headers: { accept: 'application/json', 'x-token': 'public' } });
  const j = await resp.json();
  const legs = j.routes[0].legs || [];
  const sea = legs.find((lg) => (lg.modeOfTransport || '').toUpperCase() === 'VESSEL') || legs[0];
  return { vdKeys: sea.vesselDetails ? Object.keys(sea.vesselDetails) : null, vd: sea.vesselDetails, mode: sea.modeOfTransport };
});
console.log(JSON.stringify(r).slice(0, 500));
await ctx.close().catch(() => {});
process.exit(0);

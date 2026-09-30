// routes[i] 本身就是航段数组（topKeys 0-4 = 5 段）！结构：routes = [ [leg,leg,...], ... ]
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point', { reuse: true });
await sleep(13000);
const r = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB%3B0&PortDestinationCode=TRIST%3B0&Direction=true&FromDate=23-September-2026&WeeksAhead=6&CountryCode=US&CargoType=true`;
  const resp = await fetch(u, { headers: { accept: 'application/json' } });
  const j = await resp.json();
  return j.routes.slice(0, 3).map((legs) => {
    const f = legs[0], l = legs[legs.length - 1];
    return {
      nLegs: legs.length,
      first: { v: f.vesselName, voy: f.voyage, dep: f.departureDate, from: f.portDepartureName },
      last: { v: l.vesselName, voy: l.voyage, arr: l.arrivalDate, to: l.portArrivalName },
      via: legs.slice(1, -1).map((x) => x.portDepartureName).slice(0, 2),
    };
  });
});
console.log(JSON.stringify(r, null, 1).slice(0, 1400));
await ctx.close().catch(() => {});
process.exit(0);

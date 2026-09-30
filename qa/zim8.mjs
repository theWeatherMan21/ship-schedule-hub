// 只看 route 顶层字段（不展开 midPoints）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point', { reuse: true });
await sleep(13000);
const r = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB%3B0&PortDestinationCode=TRIST%3B0&Direction=true&FromDate=23-September-2026&WeeksAhead=6&CountryCode=US&CargoType=true`;
  const resp = await fetch(u, { headers: { accept: 'application/json' } });
  const j = await resp.json();
  return j.routes.slice(0, 3).map((r0) => {
    const legs = r0.midPoints || [];
    const fleg = legs[0] && legs[0][0];
    const lleg = legs.length && legs[legs.length-1];
    const last = lleg && lleg[lleg.length-1];
    return {
      topKeys: Object.keys(r0),
      firstVessel: fleg && fleg.vesselName,
      firstDep: fleg && fleg.departureDate,
      lastVessel: last && last.vesselName,
      lastArr: last && last.arrivalDate,
      nLegs: legs.length,
      portName: r0.portName, destPortName: r0.destinationPortName,
    };
  });
});
console.log(JSON.stringify(r, null, 1).slice(0, 1300));
await ctx.close().catch(() => {});
process.exit(0);

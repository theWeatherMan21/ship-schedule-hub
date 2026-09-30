// 有些路线首尾是 Land Trans（驳船+陆转）。找主航线段：vesselCode 非 RX/非 Land Trans。列出前 8 条的关键信息做人工核对
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point', { reuse: true });
await sleep(13000);
const r = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB%3B0&PortDestinationCode=TRIST%3B0&Direction=true&FromDate=23-September-2026&WeeksAhead=6&CountryCode=US&CargoType=true`;
  const resp = await fetch(u, { headers: { accept: 'application/json' } });
  const j = await resp.json();
  return j.routes.slice(0, 8).map((legs) => {
    const sea = legs.filter((x) => !x.isLandTrans && x.vesselName && x.vesselName !== 'Land Trans');
    const f = legs[0], l = legs[legs.length - 1];
    return {
      nLegs: legs.length,
      seaVessels: sea.map((x) => `${x.vesselName}/${x.voyage}`).slice(0, 3),
      dep: (f.departureDate || '').slice(0, 10),
      arr: (l.arrivalDate || '').slice(0, 10),
      via: legs.filter((x) => x.portDepartureName).slice(1, -1).map((x) => x.portDepartureName).slice(0, 3),
    };
  });
});
console.log(JSON.stringify(r, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

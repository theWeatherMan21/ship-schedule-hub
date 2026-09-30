// routes[0] 的完整字段
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point', { reuse: true });
await sleep(13000);
const r = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB%3B0&PortDestinationCode=TRIST%3B0&Direction=true&FromDate=23-September-2026&WeeksAhead=6&CountryCode=US&CargoType=true`;
  const resp = await fetch(u, { headers: { accept: 'application/json' } });
  const j = await resp.json();
  const r0 = j.routes && j.routes[0];
  if (!r0) return { no: 'routes empty' };
  const flat = {};
  for (const [k, v] of Object.entries(r0)) flat[k] = Array.isArray(v) ? `array(${v.length})` : v;
  // midPoints[0] 若是航段数组：看字段
  if (r0.midPoints) flat.midPoint0 = JSON.stringify(r0.midPoints[0] && r0.midPoints[0][0]).slice(0, 400);
  return flat;
});
console.log(JSON.stringify(r, null, 1).slice(0, 1800));
await ctx.close().catch(() => {});
process.exit(0);

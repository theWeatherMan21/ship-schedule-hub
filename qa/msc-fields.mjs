// MSC：dump 一条完整 Route 的所有字段（找 voyage），并验证 MSC 摘要「转」vs 明细「直达」矛盾
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.msc.com/en/search-a-schedule', { reuse: true });
await sleep(18000);
const r = await page.evaluate(async () => {
  const resp = await fetch('/api/feature/tools/SearchSailingRoutes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify({ FromDate: '2026-09-24', fromPortId: 441, toPortId: 157, language: 'en', dataSourceId: '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}' }),
  });
  const j = await resp.json();
  if (!j.IsSuccess) return { err: j.Data };
  const d0 = j.Data[0];
  return {
    dataKeys: Object.keys(d0),
    key: d0.Key,
    routeKeys: Object.keys(d0.Routes[0]),
    route0: d0.Routes[0],
    transit: { h: d0.TransitTimeHours, t: d0.TransitTime, rt: d0.RoutingType, direct: d0.IsDirectRoute },
  };
});
console.log(JSON.stringify(r, null, 1).slice(0, 1500));
await ctx.close().catch(() => {});
process.exit(0);

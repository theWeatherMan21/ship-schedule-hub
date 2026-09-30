import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.msc.com/en/search-a-schedule', { reuse: true });
await sleep(18000);
const r = await page.evaluate(async () => {
  const mk = (fd) => JSON.stringify({ FromDate: fd, fromPortId: 441, toPortId: 106, language: 'en', dataSourceId: '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}' });
  const out = [];
  for (const fd of ['2026-10-06', '2026-10-15', '2026-11-01']) {
    const resp = await fetch('/api/feature/tools/SearchSailingRoutes', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' }, body: mk(fd) });
    const j = await resp.json().catch(() => null);
    if (j && j.IsSuccess && Array.isArray(j.Data)) {
      out.push({ fd, n: j.Data.length, routes: j.Data.map((x) => ({ svc: x.Key && x.Key.MaritimeServiceName, nR: x.Routes ? x.Routes.length : 0, legs: (x.Routes || []).map((lg) => `${lg.VesselName}/${lg.VoyageNumber}:${lg.EstimatedDepartureDateFormatted}->${lg.EstimatedArrivalDateFormatted}`) })) });
    } else {
      out.push({ fd, err: j && j.Data });
    }
    await new Promise((r2) => setTimeout(r2, 1500));
  }
  return out;
});
console.log(JSON.stringify(r, null, 1).slice(0, 1800));
await ctx.close().catch(() => {});
process.exit(0);

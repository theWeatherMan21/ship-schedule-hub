import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.msc.com/en/search-a-schedule', { reuse: true });
await sleep(18000);
const r = await page.evaluate(async () => {
  const resp = await fetch('/api/feature/tools/SearchSailingRoutes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify({ FromDate: '2026-09-23', fromPortId: 441, toPortId: 106, language: 'en', dataSourceId: '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}' }),
  });
  const j = await resp.json();
  const d = j.Data;
  const t = typeof d;
  if (t === 'object' && !Array.isArray(d) && d) return { type: t, keys: Object.keys(d).slice(0, 10), sample: JSON.stringify(d).slice(0, 800) };
  if (Array.isArray(d)) return { type: 'array', n: d.length, first: JSON.stringify(d[0]).slice(0, 800) };
  return { type: t, head: JSON.stringify(j).slice(0, 300) };
});
console.log(JSON.stringify(r, null, 1).slice(0, 1600));
await ctx.close().catch(() => {});
process.exit(0);

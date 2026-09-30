// MSC：试不同 FromDate + 可能的窗口参数
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.msc.com/en/search-a-schedule', { reuse: true });
await sleep(18000);
const r = await page.evaluate(async () => {
  const tries = [
    { label: '原参数(FromDate=今天)', body: { FromDate: '2026-09-23', fromPortId: 441, toPortId: 106, language: 'en', dataSourceId: '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}' } },
    { label: 'FromDate=今天+ToDate', body: { FromDate: '2026-09-23', ToDate: '2026-12-31', fromPortId: 441, toPortId: 106, language: 'en', dataSourceId: '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}' } },
    { label: 'FromDate=下周', body: { FromDate: '2026-10-01', fromPortId: 441, toPortId: 106, language: 'en', dataSourceId: '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}' } },
  ];
  const out = [];
  for (const t of tries) {
    const resp = await fetch('/api/feature/tools/SearchSailingRoutes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify(t.body),
    });
    const j = await resp.json().catch(() => null);
    const n = j && Array.isArray(j.Data) ? j.Data.length : -1;
    out.push({ label: t.label, n });
    await new Promise((r2) => setTimeout(r2, 1200));
  }
  return out;
});
console.log(JSON.stringify(r));
await ctx.close().catch(() => {});
process.exit(0);

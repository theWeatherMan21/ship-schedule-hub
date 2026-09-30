import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.msc.com/en/search-a-schedule', { reuse: true });
await sleep(18000);
const r = await page.evaluate(async () => {
  const mk = (fd) => JSON.stringify({ FromDate: fd, fromPortId: 441, toPortId: 106, language: 'en', dataSourceId: '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}' });
  const out = [];
  for (const [label, body] of [['今天', mk('2026-09-23')], ['下周', mk('2026-10-01')], ['再下周', mk('2026-10-08')], ['11月', mk('2026-11-02')]]) {
    const resp = await fetch('/api/feature/tools/SearchSailingRoutes', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' }, body });
    const t = await resp.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    out.push({ label, keys: j ? Object.keys(j).slice(0, 6) : null, dataN: j && j.Data ? j.Data.length : null, success: j && j.IsSuccess, head: t.slice(0, 150) });
    await new Promise((r2) => setTimeout(r2, 1500));
  }
  return out;
});
console.log(JSON.stringify(r, null, 1).slice(0, 1400));
await ctx.close().catch(() => {});
process.exit(0);

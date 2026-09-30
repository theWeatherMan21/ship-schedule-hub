// 验证 Hapag routes API + HMM apiPointToPointList（页面内）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();

// ═══ Hapag ═══
console.log('═══ Hapag routes API ═══');
{
  const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', { reuse: true });
  await sleep(13000);
  const r = await page.evaluate(async () => {
    try {
      const resp = await fetch('https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=TRIST&startDate=2026-09-23&startHaulage=MERCHANT&endHaulage=MERCHANT', {
        headers: { accept: 'application/json' },
      });
      const t = await resp.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      return { status: resp.status, len: t.length, isArray: Array.isArray(j), n: Array.isArray(j) ? j.length : null, sample: JSON.stringify(Array.isArray(j) ? j[0] : (j || {})).slice(0, 500) || t.slice(0, 200) };
    } catch (e) { return { error: String(e).slice(0, 100) }; }
  }).catch((e) => ({ error: String(e).slice(0, 100) }));
  console.log(' →', JSON.stringify(r).slice(0, 700));
}

// ═══ HMM ═══
console.log('\n═══ HMM apiPointToPointList ═══');
{
  const { page } = await openPage(ctx, 'https://www.hmm21.com/eng/business/liner/schedule/index.html', { reuse: true });
  await sleep(10000);
  const r = await page.evaluate(async () => {
    try {
      const resp = await fetch('/e-service/general/schedule/apiPointToPointList.do', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          srchPointFromCd: 'CNNGB', srchCityFrom: 'CY',
          srchPointToCd: 'TRIST', srchCityTo: 'CY',
          srchSelPriority: 'A', srchPorFcltyCd: '', srchPvyFcltyCd: '',
          paramToday: '20260923', srchViewType: 'L', srchSailDate: '20260923',
          srchSelWeeks: '4', srchSelSortBy: 'D', itemPolCd: '', itemPodCd: '',
        }),
      });
      const t = await resp.text();
      return { status: resp.status, len: t.length, head: t.slice(0, 400) };
    } catch (e) { return { error: String(e).slice(0, 100) }; }
  }).catch((e) => ({ error: String(e).slice(0, 100) }));
  console.log(' →', JSON.stringify(r).slice(0, 600));
}
await ctx.close().catch(() => {});
process.exit(0);

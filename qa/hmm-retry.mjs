// HMM：开它的 p2p 页面（referer 对），页内 fetch apiPointToPointList
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hmm21.com/eng/business/liner/schedule/pointToPoint/index.html', { reuse: true });
await sleep(15000);
const r = await page.evaluate(async () => {
  try {
    const resp = await fetch('/e-service/general/schedule/apiPointToPointList.do', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ srchPointFromCd: 'CNNGB', srchCityFrom: 'CY', srchPointToCd: 'PLGDN', srchCityTo: 'CY', srchSelPriority: 'A', srchPorFcltyCd: '', srchPvyFcltyCd: '', paramToday: '20260924', srchViewType: 'L', srchSailDate: '20260924', srchSelWeeks: '4', srchSelSortBy: 'D', itemPolCd: '', itemPodCd: '' }),
    });
    const t = await resp.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    return { status: resp.status, len: t.length, keys: j ? Object.keys(j).slice(0, 8) : null, head: t.slice(0, 200) };
  } catch (e) { return { error: String(e).slice(0, 100) }; }
});
console.log(JSON.stringify(r).slice(0, 400));
await ctx.close().catch(() => {});
process.exit(0);

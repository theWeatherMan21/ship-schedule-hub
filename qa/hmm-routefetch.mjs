import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hmm21.com/eng/business/liner/schedule/pointToPoint/index.html', { reuse: true });
await sleep(15000);
// route.fetch：用浏览器真实请求上下文发出（带全部 cookie/头）
const resp = await page.request.post('https://www.hmm21.com/e-service/general/schedule/apiPointToPointList.do', {
  headers: { 'content-type': 'application/json', accept: 'application/json', origin: 'https://www.hmm21.com', referer: 'https://www.hmm21.com/eng/business/liner/schedule/pointToPoint/index.html' },
  data: JSON.stringify({ srchPointFromCd: 'CNNGB', srchCityFrom: 'CY', srchPointToCd: 'PLGDN', srchCityTo: 'CY', srchSelPriority: 'A', srchPorFcltyCd: '', srchPvyFcltyCd: '', paramToday: '20260924', srchViewType: 'L', srchSailDate: '20260924', srchSelWeeks: '4', srchSelSortBy: 'D', itemPolCd: '', itemPodCd: '' }),
  timeout: 30000,
}).catch((e) => null);
if (!resp) { console.log('request 失败'); process.exit(0); }
const t = await resp.text();
console.log('status', resp.status(), 'len', t.length);
console.log(t.slice(0, 300));
await ctx.close().catch(() => {});
process.exit(0);

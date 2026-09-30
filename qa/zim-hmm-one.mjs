// ZIM: apigw.zim.com/digitalSchedules/PointToPoint/v2?PortCode=CNNGB;10&PortDestinationCode=TRIST;10&...
// HMM: POST /e-service/general/schedule/apiPointToPointList.do（403 上次 —— 需正确 referer/页面）
// ONE: /api/v1/schedule/point-to-point/search?pointName=（地点搜索）→ 船期端点未知，先挖
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();

// ═══ ZIM ═══
console.log('═══ ZIM PointToPoint/v2 ═══');
{
  const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point', { reuse: true });
  await sleep(15000);
  const r = await page.evaluate(async () => {
    const key = '9d63cf020a4c4708a7b0ebfe39578300';
    const tries = [
      `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB;10&PortDestinationCode=TRIST;10&FromDate=2026-09-23&WeeksAhead=4&DirectOnly=false&Language=ENG`,
      `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB%3B10&PortDestinationCode=TRIST%3B10&FromDate=2026-09-23&WeeksAhead=4`,
    ];
    const out = [];
    for (const u of tries) {
      try {
        const resp = await fetch(u, { headers: { accept: 'application/json' } });
        const t = await resp.text();
        let j = null; try { j = JSON.parse(t); } catch {}
        out.push({ u: u.slice(60, 130), status: resp.status, len: t.length, keys: j && typeof j === 'object' ? Object.keys(j).slice(0, 8) : null, sample: JSON.stringify(j).slice(0, 400) });
      } catch (e) { out.push({ error: String(e).slice(0, 100) }); }
      await new Promise((r2) => setTimeout(r2, 1200));
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1).slice(0, 1200));
}

// ═══ HMM：在它真实查询页面上（拿对 referer）═══
console.log('\n═══ HMM ═══');
{
  const { page } = await openPage(ctx, 'https://www.hmm21.com/eng/business/liner/schedule/pointToPoint/index.html', { reuse: true });
  await sleep(13000);
  const r = await page.evaluate(async () => {
    try {
      const resp = await fetch('/e-service/general/schedule/apiPointToPointList.do', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ srchPointFromCd: 'CNNGB', srchCityFrom: 'CY', srchPointToCd: 'TRIST', srchCityTo: 'CY', srchSelPriority: 'A', srchPorFcltyCd: '', srchPvyFcltyCd: '', paramToday: '20260923', srchViewType: 'L', srchSailDate: '20260923', srchSelWeeks: '4', srchSelSortBy: 'D', itemPolCd: '', itemPodCd: '' }),
      });
      const t = await resp.text();
      return { status: resp.status, len: t.length, head: t.slice(0, 350) };
    } catch (e) { return { error: String(e).slice(0, 100) }; }
  });
  console.log(JSON.stringify(r).slice(0, 500));
}

// ═══ ONE：船期端点挖掘（先搜地点拿 code）═══
console.log('\n═══ ONE 地点搜索 ═══');
{
  const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/manage-shipment/create-booking', { reuse: true });
  await sleep(12000);
  const r = await page.evaluate(async () => {
    try {
      const resp = await fetch('/api/v1/schedule/point-to-point/search?pointName=ningbo&userCountryCode=HK&sortType=origin', { headers: { accept: 'application/json' } });
      const t = await resp.text();
      return { status: resp.status, len: t.length, head: t.slice(0, 400) };
    } catch (e) { return { error: String(e).slice(0, 100) }; }
  });
  console.log(JSON.stringify(r).slice(0, 550));
}
await ctx.close().catch(() => {});
process.exit(0);

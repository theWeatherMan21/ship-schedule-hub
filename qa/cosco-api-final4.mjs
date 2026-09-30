// 全链路：uuid → POST → 船期
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { reuse: true });
await sleep(10000);
const r = await page.evaluate(async () => {
  try {
    const geo = async (kw) => (await (await fetch('/ebbase/public/general/findCityDistrictByPrefix?prefix=' + kw, { headers: { accept: 'application/json' } })).json()).data.content;
    const oList = await geo('ningbo'); const dList = await geo('istanbul');
    const o = oList.find((x) => x.unloCode === 'CNNGB') || oList[0];
    const d = dList.find((x) => x.unloCode === 'TRIST') || dList[0];
    const body = {
      fromDate: '2026-09-23', pickup: 'B', delivery: 'B', estimateDate: 'D',
      toDate: '2026-10-20',
      originCityUuid: o.cityUuid, destinationCityUuid: d.cityUuid,
      originCity: `${o.cityLocName},${o.county || ''},${o.state || ''},${o.country},${o.unloCode}`,
      destinationCity: `${d.cityLocName},${d.county || ''},${d.state || ''},${d.country},${d.unloCode}`,
      cargoNature: 'All',
    };
    const resp = await fetch('/ebschedule/public/purpoShipmentWs', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await resp.json();
    const rows = (j.data && j.data.content && j.data.content.data) || [];
    return { status: resp.status, code: j.code, n: rows.length, sample: rows[0] ? JSON.stringify(rows[0]).slice(0, 500) : JSON.stringify(j).slice(0, 300) };
  } catch (e) { return { error: String(e).slice(0, 150) }; }
});
console.log(JSON.stringify(r, null, 1).slice(0, 900));
await ctx.close().catch(() => {});
process.exit(0);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { reuse: true });
await sleep(10000);
// 从上轮流程推的参数：fromCity/toCity + 日期。试 GET 和 POST 两种
const tries = [
  { m: 'GET', u: '/ebschedule/public/purpoShipmentWs?fromCity=CNNGB&toCity=TRIST&fromDate=2026-09-23&pickup=B&delivery=B&cargoType=DO' },
  { m: 'GET', u: '/ebschedule/public/purpoShipmentWs?fromCity=CNNGB&toCity=TRIST&fromDate=2026-09-23' },
  { m: 'POST', u: '/ebschedule/public/purpoShipmentWs', b: { fromCity: 'CNNGB', toCity: 'TRIST', fromDate: '2026-09-23', pickup: 'B', delivery: 'B' } },
];
for (const t of tries) {
  const r = await page.evaluate(async ({ m, u, b }) => {
    try {
      const opt = { method: m, headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' } };
      if (b) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(b); }
      const resp = await fetch(u, opt);
      const txt = await resp.text();
      return { status: resp.status, len: txt.length, head: txt.slice(0, 400) };
    } catch (e) { return { error: String(e).slice(0, 90) }; }
  }, t).catch((e) => ({ error: String(e).slice(0, 90) }));
  console.log(`[${t.m}] ${t.u.slice(0, 80)}`);
  console.log('  →', JSON.stringify(r).slice(0, 400));
  await sleep(1800);
}
await ctx.close().catch(() => {});
process.exit(0);

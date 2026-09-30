import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebschedule/public/purposeOpen', { reuse: true });
await sleep(10000);
// COSCO 前端调用的是 /ebbase/public/sarin/... 系列 —— 试几个常见路径
const tries = [
  { u: '/ebbase/public/sarin/schedule/v2/shipmentSchedules?fromCity=CNNGB&toCity=TRIST&sailDate=2026-09-23&sailWeek=1&cargoType=DO', m: 'GET' },
  { u: '/ebbase/public/sarin/schedule/queryScheduleList', m: 'POST', b: { fromCity: 'CNNGB', toCity: 'TRIST', sailDate: '2026-09-23', cargoType: 'DO' } },
  { u: '/ebbase/public/sarin/schedule/getScheduleByPortPair?pol=CNNGB&pod=TRIST', m: 'GET' },
];
for (const t of tries) {
  const r = await page.evaluate(async ({ u, m, b }) => {
    try {
      const opt = { method: m, headers: { accept: 'application/json' } };
      if (b) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(b); }
      const resp = await fetch(u, opt);
      const txt = await resp.text();
      return { status: resp.status, len: txt.length, head: txt.slice(0, 300) };
    } catch (e) { return { error: String(e).slice(0, 80) }; }
  }, t).catch((e) => ({ error: String(e).slice(0, 80) }));
  console.log(`[${t.m}] ${t.u.slice(0, 90)}`);
  console.log('  →', JSON.stringify(r).slice(0, 320));
  await sleep(1500);
}
await ctx.close().catch(() => {});
process.exit(0);

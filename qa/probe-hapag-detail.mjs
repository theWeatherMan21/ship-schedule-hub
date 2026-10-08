// 探赫伯罗特的原始响应里有没有「分段 + 截单时间」。
// 必须在 hapag 页面上下文里 fetch（API 被 Cloudflare 护着）。
import { launch, openPage, quietWindow, sleep } from '../engine/browser.mjs';

const ctx = await launch({});
try {
  await quietWindow(ctx, 'minimized').catch(() => {});
  const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/en/online-business/schedules.html');
  await sleep(6000);
  const start = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const raw = await page.evaluate(async (startDate) => {
    const u = `https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=TRIST&startDate=${startDate}&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=42GP`;
    try {
      const r = await fetch(u, { headers: { accept: 'application/json', 'x-token': 'public' } });
      const j = await r.json();
      return { status: r.status, sample: j.routes && j.routes[0] ? j.routes[0] : null, n: (j.routes || []).length };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  }, start).catch((e) => ({ error: String(e).slice(0, 160) }));

  console.log('HTTP', raw.status, 'routes 条数:', raw.n, raw.error || '');
  const s = raw.sample;
  if (s) {
    console.log('\n═══ route[0] 顶层字段 ═══');
    for (const [k, v] of Object.entries(s)) {
      const t = v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.length}]` : '{...}') : String(v).slice(0, 90);
      console.log(`  ${k}: ${t}`);
    }
    const legs = s.legs || [];
    console.log(`\n═══ legs 段数: ${legs.length} ═══`);
    if (legs[0]) {
      console.log('── legs[0] 全字段 ──');
      for (const [k, v] of Object.entries(legs[0])) {
        const t = v && typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 90);
        console.log(`  ${k}: ${t}`);
      }
    }
    const gc = s.gateInCutOffDateTimes || [];
    console.log(`\n═══ gateInCutOffDateTimes（${gc.length} 条）═══`);
    for (const g of gc) console.log('  ', g.cutOffDateTimeCode, '=', g.cutOffDateTime);

    console.log('\n═══ 含 cut/close/date/terminal 的字段 ═══');
    for (const [k, v] of Object.entries(s)) if (/cut|clos|date|termin|vessel|service/i.test(k)) console.log(`  ${k} = ${String(v).slice(0, 110)}`);
  }
} finally {
  await ctx.close().catch(() => {});
}

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en', { reuse: true });
await sleep(20000);
const r = await page.evaluate(async () => {
  try {
    const resp = await fetch('https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=TRIST&startDate=2026-09-23&startHaulage=MERCHANT&endHaulage=MERCHANT', {
      headers: { accept: 'application/json', 'x-token': 'public' },
    });
    const t = await resp.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    return { status: resp.status, len: t.length, n: Array.isArray(j) ? j.length : null, sample: JSON.stringify(Array.isArray(j) && j[0] ? j[0] : j).slice(0, 600) };
  } catch (e) { return { error: String(e).slice(0, 120) }; }
});
console.log(JSON.stringify(r, null, 1).slice(0, 900));
await ctx.close().catch(() => {});
process.exit(0);

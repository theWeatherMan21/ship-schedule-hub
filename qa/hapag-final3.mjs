import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en', { reuse: true });
await sleep(20000);
const r = await page.evaluate(async () => {
  const out = [];
  for (const ct of ['42GP', '45GP']) {
    const u = `https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=TRIST&startDate=2026-09-23&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=${ct}`;
    const resp = await fetch(u, { headers: { accept: 'application/json', 'x-token': 'public' } });
    const t = await resp.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    out.push({ ct, status: resp.status, n: Array.isArray(j) ? j.length : null, sample: JSON.stringify(Array.isArray(j) && j[0] ? j[0] : (j || {})).slice(0, 700) });
    if (Array.isArray(j) && j.length) break;
    await new Promise((r2) => setTimeout(r2, 1500));
  }
  return out;
});
console.log(JSON.stringify(r, null, 1).slice(0, 1600));
await ctx.close().catch(() => {});
process.exit(0);

// 400 = 参数问题。上轮真实请求还带了 containerType=45G1 等。用完整参数
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en', { reuse: true });
await sleep(20000);
const r = await page.evaluate(async () => {
  try {
    const tries = [
      'https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=TRIST&startDate=2026-09-23&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=45G1',
      'https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=TRIST&startDate=2026-09-23&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=All',
      'https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=TRIST&startDate=2026-09-23',
    ];
    const out = [];
    for (const u of tries) {
      const resp = await fetch(u, { headers: { accept: 'application/json', 'x-token': 'public' } });
      const t = await resp.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      out.push({ q: u.split('?')[1].slice(0, 80), status: resp.status, len: t.length, n: Array.isArray(j) ? j.length : null, sample: JSON.stringify(Array.isArray(j) && j[0] ? j[0] : (j || {})).slice(0, 400) });
      if (resp.status === 200 && Array.isArray(j) && j.length) break;
      await new Promise((r2) => setTimeout(r2, 1500));
    }
    return out;
  } catch (e) { return [{ error: String(e).slice(0, 120) }]; }
});
console.log(JSON.stringify(r, null, 1).slice(0, 1400));
await ctx.close().catch(() => {});
process.exit(0);

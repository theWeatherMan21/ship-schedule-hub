// YM 参数组合矩阵：paramTrackPosition × paramRefNo 对事件段的影响（无头、只读）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);

const combos = [
  ['SEARCH', '', 'YMLU4794131'],
  ['BL_CT', 'N237068499', 'YMLU4794131'],
  ['SEARCH', 'N237068499', 'YMLU4794131'],
  ['BL_CT', '', 'YMLU4794131'],
  ['CNTR_CT', 'N237068499', 'YMLU4794131'],
];

for (const [pos, ref, no] of combos) {
  const u = `https://www.yangming.com/api/CargoTracking/GetTracking?paramTrackNo=${encodeURIComponent(no)}&paramTrackPosition=${pos}&paramRefNo=${encodeURIComponent(ref)}`;
  const r = await page.evaluate(async ({ u }) => {
    try {
      const resp = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const t = await resp.text();
      let j = null;
      try { j = JSON.parse(t); } catch { /* */ }
      if (!j) return { head: t.slice(0, 120) };
      const c0 = (j.containerList || [])[0] || {};
      const evs = c0.dcsaStatusInfo || c0.ctStatusInfo || [];
      return {
        success: j.successCnt,
        containers: (j.containerList || []).length,
        bls: (j.blList || []).length,
        evCount: evs.length,
        first: evs[0] ? `${evs[0].moveDate} ${evs[0].eventDesc}`.slice(0, 60) : null,
        last: evs.length ? `${evs[evs.length - 1].moveDate} ${evs[evs.length - 1].eventDesc}`.slice(0, 60) : null,
      };
    } catch (e) { return { error: String(e).slice(0, 120) }; }
  }, { u });
  console.log(`pos=${pos} ref=${ref || '-'} no=${no} →`, JSON.stringify(r));
  await sleep(1200);
}

await ctx.close().catch(() => {});

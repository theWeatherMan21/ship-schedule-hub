// 探针：翻站点 JS chunk，找「Deadlines 文案 ← deadlineCode」映射表（判定 DG 行口径）
import { launch, openPage, quietWindow, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
await sleep(8000);
await quietWindow(ctx, 'minimized').catch(() => {});

const hits = await page.evaluate(async () => {
  const urls = [...new Set(performance.getEntriesByType('resource').map((e) => e.name))]
    .filter((u) => /\.js(\?|$)/.test(u) && /maersk\.com|maerskline/.test(u));
  const out = [];
  for (const u of urls.slice(0, 60)) {
    try {
      const t = await (await fetch(u)).text();
      const marks = [];
      for (const w of ['Container gate-in', 'Dangerous Goods Declaration', 'Empty container pickup', 'Verified Gross Mass', 'Shipping Instructions', 'SGIN', 'FMDGFD', 'ECPL', 'SIAMS']) {
        const i = t.indexOf(w);
        if (i >= 0) marks.push({ w, ctx: t.slice(Math.max(0, i - 220), i + 220).replace(/\s+/g, ' ') });
      }
      if (marks.length) out.push({ u, len: t.length, marks });
    } catch { /* skip */ }
  }
  return { n: urls.length, out };
});
console.log('[probe] 扫描 js 资源', hits.n, '个；命中', hits.out.length);
for (const h of hits.out) {
  console.log('\n===', h.u.slice(0, 150), 'len', h.len);
  for (const m of h.marks) console.log(`  [${m.w}] …${m.ctx}…`);
}
await ctx.close().catch(() => {});
process.exit(0);

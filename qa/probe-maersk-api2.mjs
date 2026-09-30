// 探针：Maersk 页内 API 链路到底哪一步断了（婉宜 9-29）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launch, openPage, sleep } from '../engine/browser.mjs';
import { maerskResolve, maerskQuery, maerskInPage } from '../engine/fastpath.mjs';

const ctx = await launch({});
try {
  const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
  await sleep(7000);

  const res = await maerskResolve(page, 'Ningbo', 'Istanbul', 'CNNGB', 'TRIST');
  console.log('① resolve:', JSON.stringify(res).slice(0, 400));

  if (res && res.o) {
    for (const d of (res.dList || []).slice(0, 3)) {
      const q = await maerskQuery(page, res.o.geo, d.geo, '2026-09-30', '2026-10-28');
      console.log(`② query ${d.word} (${d.rkst}) → HTTP ${q && q.status} routings=${q && (q.routings || []).length} raw=${String(q && q.raw || '').slice(0, 100)}`);
      await sleep(1500);
    }
  }

  const out = await maerskInPage(page, 'CNNGB', 'TRIST', '', 'Ningbo', 'Istanbul');
  console.log('③ maerskInPage →', out ? `rows=${out.rows.length} | ${out.note}` : 'null（走兜底）');
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 300));
} finally {
  await ctx.close().catch(() => {});
}

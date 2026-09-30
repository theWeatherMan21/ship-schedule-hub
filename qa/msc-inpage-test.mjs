// MSC inPage fetch 实测：部署态 profile 的页面里调它自己的 SearchSailingRoutes
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { mscInPage } from '../engine/fastpath.mjs';

const { ctx, mode } = await launchHeadedQuiet();
console.log('模式:', mode);
const { page } = await openPage(ctx, 'https://www.msc.com/en/search-a-schedule', { reuse: true });
await sleep(8000);

// 逐个候选参数格式试
const tries = [
  { FromLocation: 'CNNGB', ToLocation: 'TRIST' },
  { FromLocation: 'CNNGB', ToLocation: 'TRIST', FromDate: '20260923', ToDate: '20261014' },
  { portOfLoadId: null, portOfDischargeId: null, fromLocation: 'CNNGB', toLocation: 'TRIST' },
];
for (let i = 0; i < tries.length; i++) {
  const body = tries[i];
  const r = await page.evaluate(async (b) => {
    try {
      const resp = await fetch('/api/feature/tools/SearchSailingRoutes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(b),
      });
      const t = await resp.text();
      return { status: resp.status, head: t.slice(0, 400) };
    } catch (e) { return { error: String(e).slice(0, 120) }; }
  }, body).catch((e) => ({ error: String(e).slice(0, 120) }));
  console.log(`[${i}] ${JSON.stringify(body).slice(0, 90)}`);
  console.log('    →', JSON.stringify(r).slice(0, 350));
  if (r.status === 200) break;
  await sleep(2000);
}

// 如果 fetch 全被拦，试试 mscInPage（走完整函数）
console.log('\n── mscInPage() 完整函数测试 ──');
const out = await mscInPage(page, 'CNNGB', 'TRIST', '');
console.log('结果:', out ? JSON.stringify(out).slice(0, 500) : 'null（失败）');

await ctx.close().catch(() => {});
console.log('DONE');
process.exit(0);

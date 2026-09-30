// MSC API 参数穷举：200 但返回空 → 试出正确参数名
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';

const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.msc.com/en/search-a-schedule', { reuse: true });
await sleep(8000);

const tries = [
  // 从抓包看到的第二形态（null id + 小写字段）
  { portOfLoadId: null, portOfDischargeId: null, fromLocation: 'CNNGB', toLocation: 'TRIST' },
  // 驼峰 + 日期
  { portOfLoadId: null, portOfDischargeId: null, fromLocation: 'CNNGB', toLocation: 'TRIST', fromDate: '20260923', toDate: '20261014' },
  // 日期 ISO 格式
  { portOfLoadId: null, portOfDischargeId: null, fromLocation: 'CNNGB', toLocation: 'TRIST', fromDate: '2026-09-23', toDate: '2026-10-14' },
  // ResponseJSON 抓包里见过 PortOfLoadId 数字 —— 先拿港口 ID？试带 id 的
  { portOfLoadId: 441, portOfDischargeId: 106, fromLocation: 'CNNGB', toLocation: 'TRIST' },
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
      return { status: resp.status, len: t.length, head: t.slice(0, 500) };
    } catch (e) { return { error: String(e).slice(0, 100) }; }
  }, body).catch((e) => ({ error: String(e).slice(0, 100) }));
  console.log(`[${i}] ${JSON.stringify(body).slice(0, 110)}`);
  console.log(`    → status=${r.status} len=${r.len} head=${(r.head || r.error || '').slice(0, 260)}`);
  await sleep(2500);
}
await ctx.close().catch(() => {});
console.log('DONE');
process.exit(0);

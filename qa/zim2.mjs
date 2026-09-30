// ZIM 日期格式 "23-Sep-2026"；ONE 404 = 页面 origin 不对（next.js SPA 在 ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();

console.log('═══ ZIM 日期格式修正 ═══');
{
  const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point', { reuse: true });
  await sleep(14000);
  const r = await page.evaluate(async () => {
    const key = '9d63cf020a4c4708a7b0ebfe39578300';
    const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB%3B10&PortDestinationCode=TRIST%3B10&FromDate=23-Sep-2026&WeeksAhead=4`;
    try {
      const resp = await fetch(u, { headers: { accept: 'application/json' } });
      const t = await resp.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      return { status: resp.status, len: t.length, keys: j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j).slice(0, 10) : Array.isArray(j) ? j.length + ' 条' : null, sample: JSON.stringify(j).slice(0, 600) };
    } catch (e) { return { error: String(e).slice(0, 120) }; }
  });
  console.log(JSON.stringify(r, null, 1).slice(0, 900));
}

console.log('\n═══ ONE：用 SPA 主页 origin ═══');
{
  const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
  await sleep(14000);
  const r = await page.evaluate(async () => {
    try {
      const resp = await fetch('/api/v1/schedule/point-to-point/search?pointName=ningbo&userCountryCode=HK&sortType=origin', { headers: { accept: 'application/json' } });
      const t = await resp.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      return { status: resp.status, len: t.length, n: Array.isArray(j) ? j.length : null, sample: JSON.stringify(Array.isArray(j) && j[0] ? j[0] : j).slice(0, 400) };
    } catch (e) { return { error: String(e).slice(0, 100) }; }
  });
  console.log(JSON.stringify(r).slice(0, 600));
}
await ctx.close().catch(() => {});
process.exit(0);

// CMA 直连 403（Datadome）→ 第二档页面内 form submit / fetch
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
// 页面内 fetch POST routing-finder（form-encoded）
const r = await page.evaluate(async () => {
  try {
    const body = new URLSearchParams({
      polDescription: 'ningbo(CNNGB)China',
      podDescription: 'istanbul, ambarli port e. side(TRAVC)Turkiye',
      SearchDate: '06-OCT-2026',
      searchRange: '1',
    });
    const resp = await fetch('/ebusiness/schedules/routing-finder', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
      body: body.toString(),
    });
    const txt = await resp.text();
    // 从 HTML 里抽船期行
    const transit = (txt.match(/Transit Time[^<]*/gi) || []).slice(0, 5);
    const vessels = (txt.match(/Vessel name[^<]*/gi) || []).slice(0, 5);
    return { status: resp.status, len: txt.length, transit, vessels, sample: txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400) };
  } catch (e) { return { error: String(e).slice(0, 120) }; }
});
console.log(JSON.stringify(r, null, 1).slice(0, 800));
await ctx.close().catch(() => {});
process.exit(0);

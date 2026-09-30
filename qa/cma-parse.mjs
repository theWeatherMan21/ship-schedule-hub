// CMA 返回 366KB HTML（结果页!）—— 抽 .cardelem 船期卡片
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
const r = await page.evaluate(async () => {
  try {
    const body = new URLSearchParams({
      polDescription: 'ningbo(CNNGB)China',
      podDescription: 'istanbul, ambarli port e. side(TRAVC)Turkiye',
      SearchDate: '06-OCT-2026', searchRange: '1',
    });
    const resp = await fetch('/ebusiness/schedules/routing-finder', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
      body: body.toString(),
    });
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // 卡片结构探测
    const cards = [...doc.querySelectorAll('.cardelem, [class*=card]')].slice(0, 3);
    const probe = cards.map((c) => ({ cls: c.className.slice(0, 40), text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 250) }));
    return { n: cards.length, probe };
  } catch (e) { return { error: String(e).slice(0, 120) }; }
});
console.log(JSON.stringify(r, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});
process.exit(0);

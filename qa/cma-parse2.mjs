// 找真正装船期数据的容器
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
const r = await page.evaluate(async () => {
  const body = new URLSearchParams({ polDescription: 'ningbo(CNNGB)China', podDescription: 'istanbul, ambarli port e. side(TRAVC)Turkiye', SearchDate: '06-OCT-2026', searchRange: '1' });
  const resp = await fetch('/ebusiness/schedules/routing-finder', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }, body: body.toString() });
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // 搜含 Vessel 的元素
  const hits = [];
  for (const sel of ['.schedules', '#schedules', '[class*=schedule]', '[id*=schedule]', '.routing', '.solution', '[class*=solution]']) {
    const els = doc.querySelectorAll(sel);
    if (els.length) hits.push({ sel, n: els.length, sample: els[0].textContent.replace(/\s+/g, ' ').trim().slice(0, 300) });
  }
  // 兜底：全文找 "SCHEDULE 1" 或 ETD 字样
  const m = html.match(/SCHEDULE[^<]{0,80}/i);
  const etd = html.match(/(ETD|Departure)[^<]{0,60}/i);
  return { hits: hits.slice(0, 4), scheduleWord: m && m[0], etdWord: etd && etd[0] };
});
console.log(JSON.stringify(r, null, 1).slice(0, 1400));
await ctx.close().catch(() => {});
process.exit(0);

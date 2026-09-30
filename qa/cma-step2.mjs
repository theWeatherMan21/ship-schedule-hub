import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
const r = await page.evaluate(async () => {
  const body = new URLSearchParams({ polDescription: 'ningbo(CNNGB)China', podDescription: 'istanbul, ambarli port e. side(TRAVC)Turkiye', SearchDate: '06-OCT-2026', searchRange: '1' });
  const resp = await fetch('/ebusiness/schedules/routing-finder', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }, body: body.toString() });
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const forms = [...doc.querySelectorAll('form')].map((f) => ({ action: f.action, method: f.method, inputs: [...f.querySelectorAll('input,select')].filter((i) => i.type === 'hidden' || i.name.match(/pol|pod|date|code/i)).slice(0, 12).map((i) => ({ n: i.name, v: (i.value || '').slice(0, 50) })) }));
  return forms.slice(0, 3);
});
console.log(JSON.stringify(r, null, 1).slice(0, 1300));
await ctx.close().catch(() => {});
process.exit(0);

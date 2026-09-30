import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hmm21.com/eng/business/liner/schedule/pointToPoint/index.html', { reuse: true });
await sleep(15000);
const st = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, input[type=submit], a.btn')].filter((b) => /search/i.test(b.textContent || b.value || '')).map((b) => ({ tag: b.tagName, txt: (b.textContent || b.value || '').trim().slice(0, 25), id: b.id, cls: (b.className || '').slice(0, 40), form: !!b.closest('form'), onclick: (b.getAttribute('onclick') || '').slice(0, 60) }));
  const forms = [...document.querySelectorAll('form')].map((f) => ({ action: f.action.slice(0, 80), method: f.method, id: f.id }));
  return { btns, forms };
});
console.log(JSON.stringify(st, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});
process.exit(0);

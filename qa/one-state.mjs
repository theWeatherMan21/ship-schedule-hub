import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
await sleep(18000);
console.log('URL:', page.url());
const st = await page.evaluate(() => ({
  nBtn: [...document.querySelectorAll('button')].filter((b) => /search/i.test(b.textContent || '')).map((b) => (b.textContent || '').trim().slice(0, 30)),
  nInput: document.querySelectorAll('input').length,
  head: document.body.innerText.replace(/\s+/g, ' ').slice(0, 180),
})).catch((e) => ({ err: String(e).slice(0, 80) }));
console.log(JSON.stringify(st, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

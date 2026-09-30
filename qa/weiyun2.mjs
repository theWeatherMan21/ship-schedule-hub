import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.weiyun001.com/NewRoute', { reuse: true });
await sleep(15000);
console.log('URL:', page.url());
const st = await page.evaluate(() => ({
  title: document.title.slice(0, 50),
  head: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
  inputs: [...document.querySelectorAll('input, select')].slice(0, 12).map((i) => ({ tag: i.tagName, ph: i.placeholder || '', id: i.id, name: i.name, cls: (i.className || '').toString().slice(0, 30) })),
  btns: [...document.querySelectorAll('button, .btn, [class*=search]')].filter((b) => b.offsetParent !== null).slice(0, 8).map((b) => (b.textContent || '').trim().slice(0, 15)),
}));
console.log(JSON.stringify(st, null, 1).slice(0, 1500));
await ctx.close().catch(() => {});
process.exit(0);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.weiyun001.com/', { reuse: true });
await sleep(15000);
// 找船期查询入口
const links = await page.evaluate(() => {
  const items = [...document.querySelectorAll('a, [onclick]')].filter((el) => /船期/i.test(el.textContent || '') && (el.textContent || '').length < 30).map((el) => ({ tag: el.tagName, txt: (el.textContent || '').trim().slice(0, 20), href: el.href || '', onclick: (el.getAttribute('onclick') || '').slice(0, 60) }));
  return items.slice(0, 8);
});
console.log(JSON.stringify(links, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.sofreight.com/', { reuse: true });
await sleep(15000);
console.log('标题:', await page.title());
// 找船期查询入口
const links = await page.evaluate(() => {
  const els = [...document.querySelectorAll('a')].filter((e) => /船期/.test(e.textContent || '')).map((e) => ({ t: (e.textContent || '').trim().slice(0, 15), h: e.getAttribute('href') }));
  return els.slice(0, 6);
});
console.log('船期入口:', JSON.stringify(links));
await ctx.close().catch(() => {});
process.exit(0);

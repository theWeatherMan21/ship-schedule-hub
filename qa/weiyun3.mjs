import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.weiyun001.com/NewRoute', { reuse: true });
await sleep(18000);
// antd select：找起运港/目的港选择器
const st = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.ant-select, .ant-select-selection-search-input, input')].filter((e) => e.offsetParent !== null);
  return all.slice(0, 15).map((e) => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 40), ph: e.getAttribute('placeholder') || '' }));
});
console.log(JSON.stringify(st, null, 1).slice(0, 1000));
const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
console.log('文字:', txt.slice(0, 400));
await ctx.close().catch(() => {});
process.exit(0);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
const inputs = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].map((i) => ({ tag: i.tagName, id: i.id, name: i.name, ph: i.placeholder, type: i.type, visible: i.offsetParent !== null })).filter((x) => x.visible)).catch(() => []);
console.log('可见输入:', JSON.stringify(inputs.slice(0, 12), null, 1));
await ctx.close().catch(() => {});
process.exit(0);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
await sleep(12000);
const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => ({ id: i.id, name: i.name, ph: (i.placeholder || '').slice(0, 45), aria: i.getAttribute('aria-label'), visible: i.offsetParent !== null })).filter((x) => x.visible)).catch(() => []);
console.log(JSON.stringify(inputs.slice(0, 10), null, 1));
await ctx.close().catch(() => {});
process.exit(0);

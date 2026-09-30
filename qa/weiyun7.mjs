import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.weiyun001.com/NewRoute', { reuse: true });
await sleep(20000);
await page.screenshot({ path: '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/docs/weiyun.png', fullPage: false }).catch(() => {});
console.log('screenshot saved');
await ctx.close().catch(() => {});
process.exit(0);

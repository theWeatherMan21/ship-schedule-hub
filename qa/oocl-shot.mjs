import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
await sleep(18000);
await page.screenshot({ path: '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/docs/oocl-search.png', fullPage: true }).catch((e) => console.log('shot:', String(e).slice(0, 60)));
console.log('截图完成');
await ctx.close().catch(() => {});
process.exit(0);

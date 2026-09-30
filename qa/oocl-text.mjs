import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input').length).catch(() => 0); if (n > 10) break; }
const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 900)).catch(() => '?');
console.log('页面文本:', txt);
await ctx.close().catch(() => {});
process.exit(0);

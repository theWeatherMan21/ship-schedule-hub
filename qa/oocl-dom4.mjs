import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 10; i++) {
  await sleep(3000);
  const n = await page.evaluate(() => document.querySelectorAll('input[name=sailing]').length).catch(() => 0);
  console.log(i, 'sailing inputs:', n);
  if (n > 0) break;
}
const models = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => ({ name: i.name, ng: i.getAttribute('ng-model'), type: i.type, visible: i.offsetParent !== null }))).catch(() => []);
console.log(JSON.stringify(models, null, 1).slice(0, 900));
await ctx.close().catch(() => {});
process.exit(0);

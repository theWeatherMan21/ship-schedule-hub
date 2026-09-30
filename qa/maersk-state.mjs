import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
await sleep(14000);
console.log('URL:', page.url());
console.log('标题:', await page.title().catch(() => '?'));
const st = await page.evaluate(() => ({
  bodyLen: document.body.innerText.length,
  bodyHead: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
  nInputs: document.querySelectorAll('input').length,
  nShadow: document.querySelectorAll('*').length,
  hasOneTrust: !!document.querySelector('#onetrust-banner-sdk'),
})).catch((e) => ({ err: String(e).slice(0, 100) }));
console.log(JSON.stringify(st, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

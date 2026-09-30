import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', { reuse: true });
await sleep(16000);
console.log('标题:', await page.title().catch(() => '?'));
const st = await page.evaluate(() => ({
  bodyLen: document.body.innerText.length,
  head: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
  nIframe: document.querySelectorAll('iframe').length,
})).catch((e) => ({ err: String(e).slice(0, 100) }));
console.log(JSON.stringify(st));
await ctx.close().catch(() => {});
process.exit(0);

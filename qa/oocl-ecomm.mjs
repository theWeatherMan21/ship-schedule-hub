import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
try {
  const { page } = await openPage(ctx, 'https://ecomm.oocl.com/ebusiness/p2pSchedule', { reuse: true });
  await sleep(15000);
  console.log('URL:', page.url().slice(0, 100));
  console.log('标题:', await page.title().catch(() => '?'));
  const st = await page.evaluate(() => ({ n: document.querySelectorAll('input').length, head: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200) })).catch((e) => ({ err: String(e).slice(0, 80) }));
  console.log(JSON.stringify(st));
} catch (e) { console.log('失败:', String(e).slice(0, 120)); }
await ctx.close().catch(() => {});
process.exit(0);

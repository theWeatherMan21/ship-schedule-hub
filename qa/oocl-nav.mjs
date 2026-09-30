import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.oocl.com/eng/Pages/default.aspx', { reuse: true });
await sleep(16000);
await page.evaluate(() => { const b = document.getElementById('allowAll'); if (b) b.click(); }).catch(() => {});
await sleep(2000);
const links = await page.evaluate(() => {
  const els = [...document.querySelectorAll('a')].filter((a) => /schedule|point to point|vessel/i.test(a.textContent || '')).map((a) => ({ t: (a.textContent || '').trim().slice(0, 30), h: a.href }));
  return els.slice(0, 10);
}).catch((e) => []);
console.log(JSON.stringify(links, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});
process.exit(0);

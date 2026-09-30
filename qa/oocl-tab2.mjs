import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input').length).catch(() => 0); if (n > 10) break; }
const st = await page.evaluate(() => {
  const clickables = [...document.querySelectorAll('a, li, span, button')].filter((e) => e.offsetParent !== null && /^(voyage|port pair|vessel|by port|by vessel|by voyage)/i.test((e.textContent || '').trim())).map((e) => ({ tag: e.tagName, t: (e.textContent || '').trim().slice(0, 30), cls: (e.className || '').toString().slice(0, 30) }));
  const hashes = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).slice(0, 10);
  return { clickables, hashes };
}).catch((e) => ({ err: String(e).slice(0, 80) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1400));
await ctx.close().catch(() => {});
process.exit(0);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input').length).catch(() => 0); if (n > 10) break; }
const st = await page.evaluate(() => {
  const inp = [...document.querySelectorAll('input[ng-model="user.port_of_Load"]')][0];
  if (!inp) return { none: 1 };
  const chain = [];
  let p = inp;
  for (let i = 0; i < 6 && p; i++) {
    chain.push({ tag: p.tagName, cls: (p.className || '').toString().slice(0, 40), style: (p.getAttribute('style') || '').slice(0, 60), ngshow: p.getAttribute('ng-show'), ngif: p.getAttribute('ng-if') });
    p = p.parentElement;
  }
  return chain;
}).catch((e) => ({ err: String(e).slice(0, 90) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1400));
await ctx.close().catch(() => {});
process.exit(0);

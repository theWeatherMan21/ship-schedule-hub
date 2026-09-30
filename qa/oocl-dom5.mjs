import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input').length).catch(() => 0); if (n > 10) break; }
const st = await page.evaluate(() => {
  const all = [...document.querySelectorAll('input')].map((i) => ({ name: i.name, ng: i.getAttribute('ng-model'), type: i.type, ph: i.placeholder, cls: (i.className || '').slice(0, 35) }));
  return { text: all.filter((x) => x.type === 'text' || x.type === ''), radio: all.filter((x) => x.type === 'radio').map((x) => x.ng) };
}).catch((e) => ({ err: String(e).slice(0, 80) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});
process.exit(0);

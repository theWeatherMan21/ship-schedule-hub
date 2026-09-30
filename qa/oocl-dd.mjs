import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input').length).catch(() => 0); if (n > 10) break; }
const st = await page.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter((s) => s.offsetParent !== null).map((s) => ({ id: s.id, ng: s.getAttribute('ng-model'), opts: [...s.options].slice(0, 4).map((o) => o.textContent.trim().slice(0, 25)) }));
  const customs = [...document.querySelectorAll('[class*=select], [class*=combobox], [class*=dropdown]')].filter((e) => e.offsetParent !== null && !e.querySelector('select')).slice(0, 8).map((e) => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 40), txt: (e.textContent || '').trim().slice(0, 25) }));
  return { sels, customs };
}).catch((e) => ({ err: String(e).slice(0, 80) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1600));
await ctx.close().catch(() => {});
process.exit(0);

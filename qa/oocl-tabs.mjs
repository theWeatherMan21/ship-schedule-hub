import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input').length).catch(() => 0); if (n > 10) break; }
const st = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('[class*=tab], [role=tab], li a')].filter((t) => t.offsetParent !== null).map((t) => ({ t: (t.textContent || '').trim().slice(0, 25), cls: (t.className || '').toString().slice(0, 30) })).slice(0, 10);
  // 全部可见 input（不限 port_of）
  const vis = [...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null).map((i) => ({ ng: i.getAttribute('ng-model'), type: i.type, name: i.name }));
  return { tabs, vis };
}).catch((e) => ({ err: String(e).slice(0, 80) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1500));
await ctx.close().catch(() => {});
process.exit(0);

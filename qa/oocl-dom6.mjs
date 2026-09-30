import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input[ng-model*=port_of]').length).catch(() => 0); if (n >= 2) { console.log(i, 'ready', n); break; } }
const st = await page.evaluate(() => [...document.querySelectorAll('input[ng-model*=port_of]')].map((i) => ({
  ng: i.getAttribute('ng-model'), type: i.type,
  visible: i.offsetParent !== null,
  rect: (() => { const r = i.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
  hidden: i.hidden, disp: getComputedStyle(i).display, vis2: getComputedStyle(i).visibility,
}))).catch((e) => ({ err: String(e).slice(0, 80) }));
console.log(JSON.stringify(st, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

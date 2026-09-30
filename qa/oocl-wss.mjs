import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
await sleep(18000);
console.log('标题:', await page.title().catch(() => '?'));
const st = await page.evaluate(() => ({
  url: location.hash.slice(0, 60),
  inputs: [...document.querySelectorAll('input, select')].filter((i) => i.offsetParent !== null).slice(0, 10).map((i) => ({ tag: i.tagName, id: i.id, name: i.name, ph: (i.placeholder || '').slice(0, 25) })),
  btns: [...document.querySelectorAll('button, input[type=submit], a.btn')].filter((b) => b.offsetParent !== null).slice(0, 6).map((b) => (b.textContent || b.value || '').trim().slice(0, 18)),
})).catch((e) => ({ err: String(e).slice(0, 100) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});
process.exit(0);

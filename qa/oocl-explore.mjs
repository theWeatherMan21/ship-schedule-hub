import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.oocl.com/eng/ourservices/eservices/sailingschedule/Pages/vss.aspx', { reuse: true });
await sleep(16000);
console.log('标题:', await page.title().catch(() => '?'));
const st = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('input, select')].filter((i) => i.offsetParent !== null).slice(0, 12).map((i) => ({ tag: i.tagName, id: i.id, name: i.name, ph: (i.placeholder || '').slice(0, 30), type: i.type })),
  btns: [...document.querySelectorAll('button, input[type=submit], a.btn')].filter((b) => b.offsetParent !== null).slice(0, 8).map((b) => ({ t: (b.textContent || b.value || '').trim().slice(0, 20), id: b.id })),
  iframes: [...document.querySelectorAll('iframe')].map((f) => f.src.slice(0, 90)).slice(0, 4),
})).catch((e) => ({ err: String(e).slice(0, 100) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1600));
await ctx.close().catch(() => {});
process.exit(0);

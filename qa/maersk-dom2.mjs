// nInputs=9 但 visible 过滤后 0 —— Maersk 用 shadow DOM！穿过 shadowRoot 找
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
await sleep(14000);
const st = await page.evaluate(() => {
  const all = [...document.querySelectorAll('input')].map((i) => ({ ph: (i.placeholder || '').slice(0, 40), aria: i.getAttribute('aria-label'), cls: (i.className || '').slice(0, 30), inShadow: !i.closest('body') }));
  // 也查 open shadow roots
  const shadowHosts = [...document.querySelectorAll('*')].filter((el) => el.shadowRoot).map((el) => el.tagName + '.' + (el.className || '').toString().slice(0, 30)).slice(0, 6);
  return { inputs: all.slice(0, 10), shadowHosts };
}).catch((e) => ({ err: String(e).slice(0, 120) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});
process.exit(0);

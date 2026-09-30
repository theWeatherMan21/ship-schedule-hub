// 真实体拿到了：关键是 cityUuid（findCityDistrictByPrefix 里应该有）。先拿 uuid 再 POST
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { reuse: true });
await sleep(10000);
// ① 拿 uuid
const geo = await page.evaluate(async () => {
  const o = await (await fetch('/ebbase/public/general/findCityDistrictByPrefix?prefix=ningbo', { headers: { accept: 'application/json' } })).json();
  const d = await (await fetch('/ebbase/public/general/findCityDistrictByPrefix?prefix=istanbul', { headers: { accept: 'application/json' } })).json();
  return { o: JSON.stringify(o).slice(0, 600), d: JSON.stringify(d).slice(0, 600) };
});
console.log('Ningbo:', geo.o.slice(0, 400));
console.log('Istanbul:', geo.d.slice(0, 400));
await ctx.close().catch(() => {});
process.exit(0);

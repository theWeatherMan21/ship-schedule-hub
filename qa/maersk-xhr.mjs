import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { byId } from '../engine/registry.mjs';
import * as utils from '../engine/lib/utils.mjs';
import * as dom from '../engine/lib/dom.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
await sleep(12000);
await utils.dismissCookies(page).catch(() => {});
const carrier = byId('maersk');
const o = await resolvePort('maersk', 'Ningbo');
const d = await resolvePort('maersk', 'Istanbul');
const before = new Set(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)));
let real = null;
ctx.on('request', (req) => {
  const u = req.url();
  if (/api\.maersk\.com|api\./.test(u) && /sched|route|transport/i.test(u) && !/active-vessels|vessel-flags|stale|audience/i.test(u) && !real) {
    real = { url: u, method: req.method(), body: (req.postData() || '').slice(0, 700) };
    console.log('🎯', req.method(), u.slice(0, 160));
    if (real.body) console.log('   body:', real.body.slice(0, 500));
  }
});
try {
  await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null, raw: {} }, { ...utils, ...dom });
  console.log('配方跑完');
} catch (e) { console.log('配方:', String(e).slice(0, 90)); }
await sleep(15000);
const after = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fresh = [...new Set(after.filter((u) => !before.has(u) && /api/i.test(u) && !/\.(css|js|png|svg)/.test(u) && !/analytics|doubleclick|google|audience/i.test(u)))];
console.log('API 请求:');
fresh.slice(0, 8).forEach((u) => console.log('  ', u.slice(0, 160)));
console.log(real ? '✅ 拦到船期 API' : '❌ 没拦到');
fs.writeFileSync('../docs/maersk-xhr.json', JSON.stringify({ fresh, real }, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

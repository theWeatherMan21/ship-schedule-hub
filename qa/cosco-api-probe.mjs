import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
// COSCO 船期查询页（searchByCity）—— 提交后看发出的 XHR
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebschedule/public/purposeOpen?cargoType=DO&fromCityName=Ningbo&toCityName=Istanbul&fromCity=CNNGB&toCity=TRIST', { reuse: true });
await sleep(14000);
const reqs = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)
  .filter((u) => /sarin|schedule|query|search|route/i.test(u) && !/\.(css|js|png|svg)/.test(u)).slice(0, 15));
console.log('COSCO 查询请求:');
reqs.forEach((u) => console.log('  ', u.slice(0, 160)));
fs.writeFileSync('../docs/cosco-schedule-api.json', JSON.stringify(reqs, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

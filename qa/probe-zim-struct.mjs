
// 取船期接口的完整响应结构（用于写正确的字段映射）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(5000);
await H.dismissCookies(page); await sleep(1000);
const j = await page.evaluate(async () => {
  const k = '9d63cf020a4c4708a7b0ebfe39578300';
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${k}&PortCode=${encodeURIComponent('CNNGB;10')}&PortDestinationCode=${encodeURIComponent('ILASH;10')}&Direction=true&FromDate=09-October-2026&WeeksAhead=6&CountryCode=US&CargoType=true`;
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  return await r.json().catch(() => null);
});
fs.writeFileSync('/tmp/zim-struct.json', JSON.stringify(j, null, 1));
console.log('顶层字段:', Object.keys(j || {}).join(', '));
const mp = j && j.midPoints;
console.log('midPoints 条数:', Array.isArray(mp) ? mp.length : typeof mp);
if (Array.isArray(mp) && mp.length) {
  const first = mp[0];
  console.log('每条的类型:', Array.isArray(first) ? '数组(航段)' : typeof first, '段数:', Array.isArray(first) ? first.length : '-');
  const leg = Array.isArray(first) ? first[0] : first;
  console.log('航段字段:');
  for (const [k, v] of Object.entries(leg || {})) console.log('   ' + k + ' = ' + String(JSON.stringify(v)).slice(0, 80));
}
await ctx.close().catch(() => {});

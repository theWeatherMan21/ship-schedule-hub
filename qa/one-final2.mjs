// 深链直开结果页 —— 拦它此时发的 API（一定有船期请求！）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const reqs = [];
cdp.on('Network.requestWillBeSent', (e) => {
  const u = e.request.url;
  if (/cookie|banner|event-log|\.js|\.css|\.png|\.svg|\.woff|analytics|gtm|googletag|heap|contentsquare/i.test(u)) return;
  reqs.push({ m: e.request.method, u, body: e.request.postData || '' });
});
try { await page.goto('https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=NINGBO%2C+ZHEJIANG%2C+CHINA&destLocNmParam=ISTANBUL%2C+TURKEY&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=2026-09-23&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=2026&month=9&searchType=List&isPolPodOn=false', { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { console.log('goto:', String(e).slice(0, 60)); }
await sleep(26000);
console.log('API 请求:');
const seen = new Set();
for (const r of reqs) {
  const k = r.m + ' ' + r.u.split('?')[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`[${r.m}] ${r.u.slice(0, 190)}`);
  if (r.body) console.log('    body:', r.body.slice(0, 450));
}
await ctx.close().catch(() => {});
process.exit(0);

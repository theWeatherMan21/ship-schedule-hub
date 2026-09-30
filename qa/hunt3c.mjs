// 上轮没输出：请求可能发生在 goto 前（init script 前）。这轮先挂监听再开页，并开 SPA 结果页（点过搜索后的 URL）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const auths = [];
const h = (req) => {
  const u = req.url();
  if (/hlag\.cloud|schedule\.api/.test(u)) auths.push({ m: req.method(), u: u.slice(0, 200), auth: (req.headers()['authorization'] || '').slice(0, 50), key: (req.headers()['x-api-key'] || req.headers()['apikey'] || '').slice(0, 50) });
};
ctx.on('request', h);
const { page } = await ctx.newPage().catch(() => null) || await openPage(ctx, 'about:blank', { reuse: true }).then((r) => r);
try {
  await page.goto('https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch {}
await sleep(16000);
ctx.removeListener('request', h);
console.log('hlag.cloud 请求', auths.length, '条:');
const seen = new Set();
for (const a of auths) {
  const k = a.u.split('?')[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  [${a.m}] auth=${a.auth || '-'} xapikey=${a.key || '-'}`);
  console.log(`      ${a.u.slice(0, 150)}`);
}
await ctx.close().catch(() => {});
process.exit(0);

// Hapag 有 3 个 iframe —— SPA 在 iframe 里！它的 API 请求从 iframe 发（不同 origin → 上轮 hook 挂错了页面）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const reqs = [];
const h = (req) => {
  const u = req.url();
  if (/schedule\.api\.hlag\.cloud|\/api\/routes/.test(u)) reqs.push({ m: req.method(), u: u.slice(0, 250), auth: (req.headers()['authorization'] || '').slice(0, 60), key: (req.headers()['x-api-key'] || req.headers()['api-key'] || '').slice(0, 60) });
};
ctx.on('request', h);
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', { reuse: true });
await sleep(18000);
ctx.removeListener('request', h);
console.log('routes API 请求:', reqs.length);
const seen = new Set();
for (const r of reqs) {
  const k = r.u.split('?')[0];
  if (seen.has(k) && seen.size > 0) continue;
  seen.add(k);
  console.log(`[${r.m}] auth=${r.auth || '-'} key=${r.key || '-'}`);
  console.log('   ', r.u.slice(0, 200));
}
// 同时 dump iframe src
const iframes = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => f.src.slice(0, 120))).catch(() => []);
console.log('\niframes:', iframes);
await ctx.close().catch(() => {});
process.exit(0);

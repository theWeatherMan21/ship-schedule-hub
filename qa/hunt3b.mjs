// Hapag 401 = 要 auth token（页面加载时会拿）。在 SPA 里看它的 token 请求。
// HMM 403 = 它的页面不是这个（.do 需要 referer/session）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();

// Hapag：开 SPA 时的所有 hlag.cloud 请求（找 auth）
console.log('═══ Hapag auth 流程 ═══');
{
  const auths = [];
  const h = (req) => {
    const u = req.url();
    if (/hlag\.cloud/.test(u)) auths.push({ m: req.method(), u: u.slice(0, 180), auth: (req.headers()['authorization'] || '').slice(0, 40), key: (req.headers()['x-api-key'] || req.headers()['apikey'] || '').slice(0, 40) });
  };
  ctx.on('request', h);
  const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', { reuse: true });
  await sleep(14000);
  ctx.removeListener('request', h);
  const uniq = [];
  const seen = new Set();
  for (const a of auths) { const k = a.u.split('?')[0]; if (!seen.has(k)) { seen.add(k); uniq.push(a); } }
  uniq.forEach((a) => console.log(`  [${a.m}] auth=${a.auth || '-'} key=${a.key || '-'} ${a.u.slice(0, 110)}`));
}
await ctx.close().catch(() => {});
process.exit(0);

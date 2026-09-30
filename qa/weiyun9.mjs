import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.weiyun001.com/NewRoute', { reuse: true });
await sleep(20000);
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/wywapi/.test(u)) reqs.push({ m: r.method(), u: u.replace('https://wywapi.weiyun001.com/api/', ''), body: (r.postData() || '').slice(0, 260) });
});
// 截屏到可写目录
await page.screenshot({ path: '/Users/russospencer/.hermes/cache/scratch/wy-newroute.png' }).catch((e) => console.log('shot:', String(e).slice(0, 50)));
console.log('url:', page.url());
console.log('初始 API:', reqs.length);
await ctx.close().catch(() => {});
process.exit(0);

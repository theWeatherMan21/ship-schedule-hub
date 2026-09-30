import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
await sleep(18000);
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/oocl/.test(u) && !/\.js|\.css|\.png|\.woff|\.gif/.test(u)) reqs.push({ m: r.method(), u: u.slice(0, 140), body: (r.postData() || '').slice(0, 300) });
});
// 看 HTML 源里的 angular 模板（找 pol/pod 字段名）
const html = await page.content();
const polHints = html.match(/(pol|pod|origin|destination|fromPort|toPort|locationFrom)[A-Za-z]{0,15}/gi) || [];
console.log('字段线索:', [...new Set(polHints.map((x) => x.toLowerCase()))].slice(0, 14).join(', '));
// angular 输入框：ng-model 属性
const models = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.getAttribute('ng-model')).filter(Boolean));
console.log('ng-model:', models);
console.log('当前请求数:', reqs.length);
await ctx.close().catch(() => {});
process.exit(0);

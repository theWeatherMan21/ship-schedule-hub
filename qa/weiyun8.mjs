import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.weiyun001.com/NewRoute', { reuse: true });
await sleep(18000);
// 全程记录 XHR（不注入、不 evaluate —— 纯 Playwright 监听）
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/weiyun/.test(u) && !/\.(js|css|png|jpg|svg|woff|ico)/.test(u)) reqs.push({ m: r.method(), u: u.slice(0, 150), body: (r.postData() || '').slice(0, 300) });
});
// 用坐标/键盘操作：点击输入框输入 ningbo（不 evaluate）
// 先截图看页面
await page.screenshot({ path: '/tmp/wy2.png' }).catch(() => {});
console.log('截图已存 /tmp/wy2.png');
// 键盘 tab 到输入框
await page.keyboard.press('Tab').catch(() => {});
await page.keyboard.type('ningbo', { delay: 100 }).catch(() => {});
await sleep(5000);
await page.screenshot({ path: '/tmp/wy3.png' }).catch(() => {});
console.log('输入后 API:', reqs.length);
reqs.slice(0, 6).forEach((r) => console.log(`[${r.m}] ${r.u}`, r.body ? `body=${r.body}` : ''));
await ctx.close().catch(() => {});
process.exit(0);

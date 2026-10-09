
// 找 cs-captcha 的 SDK 与 verify 端点
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/client/sailing_schedules/views/search.html', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);
const out = await page.evaluate(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src).filter((u) => /captcha|cs-|secur/i.test(u));
  const globals = Object.keys(window).filter((k) => /captcha|cs[A-Z]|verify|slide/i.test(k)).slice(0, 30);
  const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => f.src).filter(Boolean);
  return { scripts, globals, iframes, perf: (performance.getEntriesByType('resource') || []).map((e) => e.name).filter((u) => /captcha/i.test(u)).slice(0, 20) };
});
console.log('验证码相关脚本:', JSON.stringify(out.scripts, null, 1).slice(0, 600));
console.log('全局对象:', JSON.stringify(out.globals).slice(0, 400));
console.log('iframe:', JSON.stringify(out.iframes).slice(0, 300));
console.log('performance 里 captcha 资源:');
for (const u of out.perf) console.log('   ' + u.slice(0, 160));
await ctx.close().catch(() => {});


// OOCL 验证码：运行时发现（不逆向）—— 触发 widget，找它的实例/函数
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(6000);
// 触发一次搜索（空表单也行——目的是让验证码 widget 挂载）
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, a')].find((x) => /^search$/i.test((x.textContent || '').trim()) && x.offsetParent !== null);
  if (b) b.click();
}).catch(() => {});
await sleep(8000);
const out = await page.evaluate(() => {
  const res = { globals: [], jqData: [], dom: [], jq: !!window.jQuery };
  res.globals = Object.keys(window).filter((k) => /captcha|verify|slide|puzzle|cs_|csc/i.test(k)).slice(0, 40);
  // jQuery 插件/实例：常见挂法 $.cs_captcha / $(el).data('captcha')
  if (window.jQuery) {
    res.jqKeys = Object.keys(window.jQuery).filter((k) => /captcha|verify|slide/i.test(k)).slice(0, 20);
    for (const sel of ['.verifybox', '.verify-img-panel', '#cs_captcha', '.cs-captcha-box', '[class*=verify]']) {
      const el = document.querySelector(sel);
      if (el) {
        res.dom.push(sel + ' → ' + (el.className || '').toString().slice(0, 80));
        const d = window.jQuery(el).data ? Object.keys(window.jQuery(el).data() || {}) : [];
        if (d.length) res.jqData.push(sel + ' data=' + d.join(','));
      }
    }
  }
  return res;
});
console.log(JSON.stringify(out, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});

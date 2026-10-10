
// OOCL：接住 captchaCallback 的 token —— 看它能不能"自动"产出（无人工交互）
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
page.on('console', (m) => { const t = m.text(); if (/token|captcha/i.test(t)) console.log('[页面控制台] ' + t.slice(0, 140)); });
await page.goto('https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(6000);
// ① 下钩：接住 captchaCallback 的 token + 记录 captchaCreate 何时被调
await page.evaluate(() => {
  window.__tokens = [];
  if (typeof window.captchaCallback === 'function') {
    const orig = window.captchaCallback;
    window.captchaCallback = (t, ...rest) => { window.__tokens.push(String(t).slice(0, 80)); try { return orig(t, ...rest); } catch (e) { return undefined; } };
  }
  if (typeof window.captchaCreate === 'function') {
    const oc = window.captchaCreate;
    window.__captchaCreateCalls = 0;
    window.captchaCreate = (...a) => { window.__captchaCreateCalls++; return oc(...a); };
  }
}).catch(() => {});
// ② 触发一次搜索（空表单）看验证码是否自动初始化/产 token
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, a')].find((x) => /^search$/i.test((x.textContent || '').trim()) && x.offsetParent !== null);
  if (b) b.click();
}).catch(() => {});
await sleep(12000);
const out = await page.evaluate(() => ({
  tokens: window.__tokens || [],
  createCalls: window.__captchaCreateCalls || 0,
  widgetVisible: !!document.querySelector('.verifybox, [class*=verifybox], .verify-img-panel'),
  puzzleImg: !!document.querySelector('.verify-img-panel img, [class*=verify] img'),
}));
console.log('── 结果:');
console.log('  captchaCreate 被调次数:', out.createCalls);
console.log('  收到的 token:', JSON.stringify(out.tokens));
console.log('  widget 出现:', out.widgetVisible, ' 拼图出现:', out.puzzleImg);
await ctx.close().catch(() => {});

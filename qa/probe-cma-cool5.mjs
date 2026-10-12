// CMA 冷却复测诊断探针（10-10 收尾用）——看清到底是「IP 层 403」还是「挑战页」还是「都没拦」
// 用法：SSH_PROFILE_DIR=/tmp/xxx node qa/probe-cma-cool5.mjs [url]
// 全程无头（launch 默认 auto=headless-new），屏幕上不留窗口。
import { launch, sleep } from '../engine/browser.mjs';

const url = process.argv[2] || 'https://www.cma-cgm.com/ebusiness/schedules';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const out = { url, profile: process.env.SSH_PROFILE_DIR || '(default)' };
try {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => ({ failure: () => String(e).slice(0, 120) }));
  out.httpStatus = resp && resp.status ? resp.status() : null;
  out.gotoErr = resp && resp.failure ? resp.failure() : null;
  try {
    const h = resp.headers ? await resp.allHeaders() : {};
    out.server = h['server'] || '';
    out.setCookieDD = /datadome/i.test(h['set-cookie'] || '');
    out.setCookie = (h['set-cookie'] || '').slice(0, 220);
  } catch { /* 忽略 */ }
  await sleep(6000);
  out.finalUrl = page.url();
  out.info = await page.evaluate(() => {
    const html = document.documentElement.innerHTML || '';
    return {
      title: document.title,
      bodyLen: (document.body?.innerText || '').length,
      bodyHead: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
      hasForm: !!document.querySelector('#AutoCompletePOL'),
      hrefIsCaptcha: /captcha-delivery/i.test(location.href),
      frames: [...document.querySelectorAll('iframe')].map((f) => (f.src || '(empty)').slice(0, 90)).slice(0, 8),
      htmlHasCaptcha: /captcha-delivery/i.test(html),
      htmlHasTags: /js\.datadome\.co\/tags\.js/i.test(html),
    };
  }).catch((e) => 'eval ERR ' + String(e).slice(0, 100));
  const cookies = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  out.ddCookie = (cookies.find((c) => c.name === 'datadome') || {}).value?.slice(0, 40) || null;
  out.cookieNames = cookies.map((c) => c.name).slice(0, 12);
  await page.screenshot({ path: '/tmp/cma-cool5.png', timeout: 8000 }).catch(() => {});
} catch (e) { out.err = String(e).slice(0, 200); }
console.log(JSON.stringify(out, null, 1));
await ctx.close();

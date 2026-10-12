// CMA DataDome：连访探针 —— 同一 context 连续 N 次访问，看是「频率限流」还是「cookie 记账」
// 用法：SSH_PROFILE_DIR=/tmp/xxx node qa/probe-cma-cool7.mjs [N] [cleardd|none]
// 全程无头，屏幕不留窗口。
import { launch, sleep } from '../engine/browser.mjs';

const N = Number(process.argv[2] || 4);
const mode = process.argv[3] || 'none';
const URL = 'https://www.cma-cgm.com/ebusiness/schedules';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const rows = [];
try {
  let before = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  if (mode === 'cleardd') {
    for (const c of before.filter((c) => /datadome/i.test(c.name))) await ctx.addCookies([{ ...c, expires: 0 }]).catch(() => {});
  }
  rows.push({ visit: 0, dd: (before.find((c) => c.name === 'datadome') || {}).value?.slice(0, 24) || null, note: 'cookies@launch' });
  for (let i = 1; i <= N; i++) {
    const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => null);
    const st = resp && resp.status ? resp.status() : null;
    await sleep(5000);
    const info = await page.evaluate(() => ({
      t: document.title.slice(0, 40),
      form: !!document.querySelector('#AutoCompletePOL'),
      cap: [...document.querySelectorAll('iframe')].some((f) => /captcha-delivery/i.test(f.src || '')),
    })).catch(() => null);
    const ck = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
    rows.push({ visit: i, status: st, title: info?.t, form: info?.form, captcha: info?.cap, dd: (ck.find((c) => c.name === 'datadome') || {}).value?.slice(0, 24) || null });
  }
} catch (e) { rows.push({ err: String(e).slice(0, 150) }); }
console.log(JSON.stringify({ mode, profile: process.env.SSH_PROFILE_DIR || '(default)', rows }, null, 1));
await ctx.close();

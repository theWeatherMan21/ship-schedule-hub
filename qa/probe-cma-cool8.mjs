// CMA DataDome：每次访问前清掉 datadome cookie，看是否次次 200（验证「无 cookie 首访放行」模型）
// 用法：SSH_PROFILE_DIR=/tmp/xxx node qa/probe-cma-cool8.mjs [N]
import { launch, sleep } from '../engine/browser.mjs';

const N = Number(process.argv[2] || 3);
const URL = 'https://www.cma-cgm.com/ebusiness/schedules';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const rows = [];
try {
  for (let i = 1; i <= N; i++) {
    const ck = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
    const dd = ck.filter((c) => /datadome/i.test(c.name));
    for (const c of dd) await ctx.addCookies([{ ...c, expires: 0 }]).catch(() => {});
    const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => null);
    await sleep(5000);
    const info = await page.evaluate(() => ({
      t: document.title.slice(0, 40),
      form: !!document.querySelector('#AutoCompletePOL'),
      cap: [...document.querySelectorAll('iframe')].some((f) => /captcha-delivery/i.test(f.src || '')),
    })).catch(() => null);
    rows.push({ visit: i, cleared: dd.length, status: resp && resp.status ? resp.status() : null, ...info });
  }
} catch (e) { rows.push({ err: String(e).slice(0, 150) }); }
console.log(JSON.stringify({ profile: process.env.SSH_PROFILE_DIR || '(default)', rows }, null, 1));
await ctx.close();

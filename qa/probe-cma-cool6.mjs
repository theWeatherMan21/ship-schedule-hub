// CMA DataDome 归因探针（10-10 收尾）：403 到底是「IP 层」还是「profile 里的 datadome uid 被标记」
// 用法：SSH_PROFILE_DIR=/tmp/prof-copy4 node qa/probe-cma-cool6.mjs <mode>
//   mode = none | cleardd | clearall | keepdd   （都不改原 profile，只改运行中的副本）
// 全程无头，屏幕上不留窗口。
import { launch, sleep } from '../engine/browser.mjs';

const mode = process.argv[2] || 'none';
const URL = 'https://www.cma-cgm.com/ebusiness/schedules';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const out = { mode, profile: process.env.SSH_PROFILE_DIR || '(default)' };
try {
  const before = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  out.cookiesBefore = before.map((c) => c.name);
  out.ddBefore = (before.find((c) => c.name === 'datadome') || {}).value?.slice(0, 30) || null;

  if (mode === 'cleardd') {
    // 只作废 datadome / x-datadome 系 cookie（把过期时间设到过去）
    const kill = before.filter((c) => /datadome/i.test(c.name));
    for (const c of kill) await ctx.addCookies([{ ...c, expires: 0 }]).catch(() => {});
    out.killed = kill.map((c) => c.name);
  } else if (mode === 'clearall') {
    await ctx.clearCookies();
    out.killed = 'ALL';
  } else if (mode === 'keepdd') {
    // 只留 datadome，其余清掉（反向对照）
    const dd = before.filter((c) => /datadome/i.test(c.name));
    await ctx.clearCookies();
    for (const c of dd) await ctx.addCookies([c]).catch(() => {});
    out.killed = 'all-but-datadome';
  }

  const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  out.httpStatus = resp && resp.status ? resp.status() : null;
  await sleep(6000);
  out.finalUrl = page.url();
  out.info = await page.evaluate(() => ({
    title: document.title,
    bodyLen: (document.body?.innerText || '').length,
    hasForm: !!document.querySelector('#AutoCompletePOL'),
    captchaFrame: [...document.querySelectorAll('iframe')].some((f) => /captcha-delivery/i.test(f.src || '')),
    htmlHasCaptcha: /captcha-delivery/i.test(document.documentElement.innerHTML || ''),
  })).catch((e) => 'eval ERR ' + String(e).slice(0, 80));
  const after = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  out.ddAfter = (after.find((c) => c.name === 'datadome') || {}).value?.slice(0, 30) || null;
  out.cookiesAfter = after.map((c) => c.name);
} catch (e) { out.err = String(e).slice(0, 180); }
console.log(JSON.stringify(out, null, 1));
await ctx.close();

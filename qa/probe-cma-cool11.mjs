// CMA 收尾诊断 v3：同一 context 里 —— 先正门(清 cookie 后 200)，再访 routing-finder，看搜索页放不放行
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const log = [];
const probe = async (url, tag) => {
  const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  await sleep(6000);
  const s = await page.evaluate(() => ({
    url: location.href.slice(0, 120), title: document.title.slice(0, 45),
    bodyLen: (document.body?.innerText || '').length,
    form: !!document.querySelector('#AutoCompletePOL'),
    cap: [...document.querySelectorAll('iframe')].some((f) => /captcha-delivery/i.test(f.src || '')),
  })).catch((e) => ({ err: String(e).slice(0, 80) }));
  const cks = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  log.push({ tag, status: r && r.status ? r.status() : null, dd: (cks.find((c) => c.name === 'datadome') || {}).value?.slice(0, 22) || null, ...s });
};
try {
  const cks = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  for (const c of cks.filter((x) => /datadome/i.test(x.name))) await ctx.addCookies([{ ...c, expires: 0 }]).catch(() => {});
  await probe('https://www.cma-cgm.com/ebusiness/schedules', 'A.正门(无cookie)');
  await probe('https://www.cma-cgm.com/ebusiness/schedules/routing-finder', 'B.搜索页(正门后,带新cookie)');
  // C：清掉 cookie 再访搜索页
  const c2 = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  for (const c of c2.filter((x) => /datadome/i.test(x.name))) await ctx.addCookies([{ ...c, expires: 0 }]).catch(() => {});
  await probe('https://www.cma-cgm.com/ebusiness/schedules/routing-finder', 'C.搜索页(清cookie后)');
} catch (e) { log.push({ err: String(e).slice(0, 160) }); }
console.log(JSON.stringify(log, null, 1));
await ctx.close();

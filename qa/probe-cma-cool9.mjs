// CMA 收尾诊断：定位「表单填完点搜索后为什么没有结果」
// 用法：SSH_PROFILE_DIR=/tmp/xxx node qa/probe-cma-cool9.mjs
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const log = [];
const snap = async (tag) => {
  const s = await page.evaluate(() => ({
    url: location.href.slice(0, 120),
    title: document.title.slice(0, 50),
    bodyLen: (document.body?.innerText || '').length,
    form: !!document.querySelector('#AutoCompletePOL'),
    cap: [...document.querySelectorAll('iframe')].some((f) => /captcha-delivery/i.test(f.src || '')),
    head: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
  })).catch((e) => ({ err: String(e).slice(0, 80) }));
  log.push({ tag, ...s });
  return s;
};
try {
  // 作废自锁 cookie
  const cks = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  for (const c of cks.filter((x) => /datadome/i.test(x.name))) await ctx.addCookies([{ ...c, expires: 0 }]).catch(() => {});

  // ① 直达 routing-finder（真实搜索页）
  const r1 = await page.goto('https://www.cma-cgm.com/ebusiness/schedules/routing-finder', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  await sleep(6000);
  log.push({ tag: 'routing-finder-direct', http: r1 && r1.status ? r1.status() : null });
  const s1 = await snap('routing-finder-direct');

  // ② 若表单在 → 填 ningbo/hamburg → 点搜索 → 逐步观察
  if (s1 && s1.form) {
    const fill = async (sel, word) => {
      const el = page.locator(sel).first();
      await el.click({ timeout: 8000 }).catch(() => {});
      await page.keyboard.type(word, { delay: 70 });
      await sleep(2600);
      const row = page.locator('li.place-suggestion').filter({ hasText: /port/i }).first();
      if (await row.count().catch(() => 0)) await row.click({ timeout: 6000 }).catch(() => {});
      else {
        const any = page.locator('li.place-suggestion').first();
        if (await any.count().catch(() => 0)) await any.click({ timeout: 6000 }).catch(() => {});
      }
      await sleep(1200);
      await page.keyboard.press('Escape').catch(() => {});
      return page.evaluate((s) => document.querySelector(s)?.value || '', sel).catch(() => '');
    };
    log.push({ tag: 'fillPOL', val: await fill('#AutoCompletePOL', 'ningbo') });
    log.push({ tag: 'fillPOD', val: await fill('#AutoCompletePOD', 'hamburg') });
    const btn = page.getByRole('button', { name: /^search$/i }).first();
    log.push({ tag: 'searchBtnCount', n: await btn.count().catch(() => -1) });
    await btn.click({ timeout: 8000 }).catch((e) => log.push({ tag: 'clickErr', e: String(e).slice(0, 80) }));
    for (const t of [4, 9, 15, 22, 30]) { await sleep(t === 4 ? 4000 : 5000); await snap('after-search+' + t + 's'); }
  }
} catch (e) { log.push({ err: String(e).slice(0, 160) }); }
console.log(JSON.stringify(log, null, 1));
await page.screenshot({ path: '/tmp/cma-flow.png', timeout: 8000 }).catch(() => {});
await ctx.close();

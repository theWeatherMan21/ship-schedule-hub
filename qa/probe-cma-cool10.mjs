// CMA 收尾诊断 v2：走 /ebusiness/schedules 正门 → 填表 → 点搜索，逐步看 URL/状态/挑战
// 用法：SSH_PROFILE_DIR=/tmp/xxx node qa/probe-cma-cool10.mjs
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const log = [];
const net = [];
page.on('response', (r) => {
  const u = r.url();
  if (/routing-finder|captcha-delivery|schedules/.test(u)) net.push({ s: r.status(), u: u.slice(0, 100) });
});
const snap = async (tag) => {
  const s = await page.evaluate(() => ({
    url: location.href.slice(0, 130),
    title: document.title.slice(0, 45),
    bodyLen: (document.body?.innerText || '').length,
    form: !!document.querySelector('#AutoCompletePOL'),
    cap: [...document.querySelectorAll('iframe')].some((f) => /captcha-delivery/i.test(f.src || '')),
    hasMainVessel: /Main vessel/i.test(document.body?.innerText || ''),
    hasDays: /\d+\s*Days/.test(document.body?.innerText || ''),
    head: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 100),
  })).catch((e) => ({ err: String(e).slice(0, 80) }));
  log.push({ tag, ...s });
  return s;
};
try {
  const cks = await ctx.cookies('https://www.cma-cgm.com').catch(() => []);
  log.push({ clearedDD: cks.filter((x) => /datadome/i.test(x.name)).length });
  for (const c of cks.filter((x) => /datadome/i.test(x.name))) await ctx.addCookies([{ ...c, expires: 0 }]).catch(() => {});

  const r0 = await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  log.push({ tag: 'entry', http: r0 && r0.status ? r0.status() : null });
  await sleep(6000);
  const s1 = await snap('entry');

  if (s1 && s1.form) {
    const fill = async (sel, word) => {
      const el = page.locator(sel).first();
      await el.click({ timeout: 8000 }).catch(() => {});
      await page.keyboard.type(word, { delay: 70 });
      await sleep(2600);
      const row = page.locator('li.place-suggestion').filter({ hasText: /port/i }).first();
      if (await row.count().catch(() => 0)) await row.click({ timeout: 6000 }).catch(() => {});
      else { const any = page.locator('li.place-suggestion').first(); if (await any.count().catch(() => 0)) await any.click({ timeout: 6000 }).catch(() => {}); }
      await sleep(1200);
      await page.keyboard.press('Escape').catch(() => {});
      return page.evaluate((s) => document.querySelector(s)?.value || '', sel).catch(() => '');
    };
    log.push({ tag: 'fillPOL', val: await fill('#AutoCompletePOL', 'ningbo') });
    log.push({ tag: 'fillPOD', val: await fill('#AutoCompletePOD', 'hamburg') });
    const btn = page.getByRole('button', { name: /^search$/i }).first();
    log.push({ tag: 'searchBtn', n: await btn.count().catch(() => -1) });
    await btn.click({ timeout: 8000 }).catch((e) => log.push({ tag: 'clickErr', e: String(e).slice(0, 90) }));
    for (const t of [4, 9, 15, 22, 30]) { await sleep(t === 4 ? 4000 : 5000); await snap('after+' + t + 's'); }
  }
} catch (e) { log.push({ err: String(e).slice(0, 160) }); }
console.log(JSON.stringify(log, null, 1));
console.log('NET: ' + JSON.stringify(net.slice(0, 25)));
await page.screenshot({ path: '/tmp/cma-flow2.png', timeout: 8000 }).catch(() => {});
await ctx.close();

// ONE 探针 C（9-29 婉宜）：① 枚举按钮 + 逐个点看哪个触发查询；② 从 JS chunk 挖 API 路径
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
const ENTRY = 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule';
const IGN = /heap|clarity|productfruits|contentsquare|google|doubleclick|hotjar|segment|newrelic|datadog|cookieyes|_next\/static|\.(css|woff2?|png|svg|jpe?g|gif|ico)/i;

const { page } = await openPage(ctx, ENTRY, { reuse: true });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
let hits = [];
cdp.on('Network.requestWillBeSent', (e) => {
  const u = e.request.url;
  if (!IGN.test(u)) hits.push({ m: e.request.method, t: e.type, u: u.slice(0, 300), b: (e.request.postData || '').slice(0, 400) });
});
const bodies = {};
cdp.on('Network.responseReceived', async (e) => {
  try {
    const h = hits.find((x) => x.u.startsWith(e.response.url.slice(0, 120)));
    if (h && !bodies[e.requestId] && /\/api\//i.test(e.response.url) && !/country|ip\b/.test(e.response.url)) {
      const b = await cdp.send('Network.getResponseBody', { requestId: e.requestId }).catch(() => null);
      if (b && b.body) bodies[e.requestId] = { u: e.response.url.slice(0, 160), body: b.body.slice(0, 2500) };
    }
  } catch { /* no-op */ }
});

try {
  await sleep(12000);
  await dismissCookies(page).catch(() => {});

  const fillOne = async (inp, word) => {
    await inp.click({ timeout: 8000 }).catch(() => {});
    await inp.fill('').catch(() => {});
    await inp.type(word, { delay: 90 }).catch(() => {});
    await sleep(3500);
    const opt = page.locator('[role="option"]');
    if (await opt.count().catch(() => 0)) await opt.nth(0).click({ timeout: 5000 }).catch(() => {});
    await sleep(1200);
  };
  const oInp = page.locator('input[placeholder*="origin" i], input[placeholder*="from" i], input[id*="origin" i]').first();
  const dInp = page.locator('input[placeholder*="destination" i], input[placeholder*="to" i], input[id*="destination" i]').first();
  await fillOne(oInp, 'ningbo');
  await fillOne(dInp, 'istanbul');
  const before = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
  console.log('填表后(前400):', before);

  // ===== ① 枚举按钮 =====
  const btns = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"], input[type="submit"], a.button, [class*="btn"]')]
    .map((el, i) => ({ i, tag: el.tagName, text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40), aria: el.getAttribute('aria-label') || '', type: el.getAttribute('type') || '', cls: String(el.className).slice(0, 60), vis: !!el.offsetParent }))
    .filter((x) => x.vis));
  console.log('== 可见按钮 ==');
  btns.forEach((b) => console.log('  ', JSON.stringify(b)));

  // ===== ② 逐个点 search 相关按钮，看哪个触发查询 =====
  const cands = btns.filter((b) => /search|查询/i.test(b.text + ' ' + b.aria));
  console.log('\n== 候选按钮 ==', JSON.stringify(cands.map((c) => c.text || c.aria)));
  for (const b of cands) {
    hits = [];
    const el = page.locator('button, [role="button"], input[type="submit"], a.button').filter({ hasText: new RegExp(`^\\s*${(b.text || b.aria).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }).first();
    const ok = await el.isVisible().catch(() => false);
    console.log(`\n-- 点 "${b.text || b.aria}" (可见=${ok}) --`);
    if (ok) await el.click({ timeout: 6000 }).catch((e) => console.log('   click err', String(e).slice(0, 70)));
    let t = '';
    for (let i = 0; i < 6; i++) {
      await sleep(2500);
      t = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/day\(s\)|No results|Total \d+ results/i.test(t)) break;
    }
    console.log('   URL:', page.url().slice(0, 160));
    console.log('   len=', t.length, 'day(s)=', /day\(s\)/.test(t), 'reasons:', [...new Set(hits.filter((h) => /api|sched|point/i.test(h.u)).map((h) => `${h.m} ${h.u.slice(0, 150)}`))].slice(0, 6));
    if (/day\(s\)|Total \d+ results/i.test(t)) { console.log('   ✅ 命中! body:', t.replace(/\s+/g, ' ').slice(0, 1200)); break; }
  }
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/one-buttons.json', JSON.stringify({ btns, bodies }, null, 1));
  console.log('\n== API 响应体 ==');
  Object.entries(bodies).slice(0, 6).forEach(([id, b]) => console.log('  ', b.u, '\n   ', b.body.slice(0, 600), '\n'));

  // ===== ③ 从 JS chunk 挖 API 路径 =====
  console.log('\n== 挖 chunk 里的 /api/ 路径 ==');
  const urls = await page.evaluate(async () => {
    const html = await (await fetch('/one-ecom/schedule/point-to-point-schedule')).text();
    const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))];
    const found = new Set();
    for (const c of chunks.slice(0, 40)) {
      try {
        const t = await (await fetch(c)).text();
        for (const m of t.matchAll(/["'`](\/api\/v[0-9][A-Za-z0-9/_.\-{}$:]*)/g)) found.add(m[1]);
      } catch { /* no-op */ }
    }
    return { nChunks: chunks.length, found: [...found].slice(0, 60) };
  }).catch((e) => ({ error: String(e).slice(0, 150) }));
  console.log(JSON.stringify(urls, null, 1).slice(0, 3000));
  fs.writeFileSync('qa/probe-out/one-chunks.json', JSON.stringify(urls, null, 1));
} catch (e) {
  console.log('!! 异常:', String(e && e.stack || e).slice(0, 400));
} finally {
  await ctx.close().catch(() => {});
  process.exit(0);
}

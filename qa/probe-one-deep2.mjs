// ONE 深挖探针（9-29 婉宜）：
//  A) 手工填表：Origin/Destination 打字 → dump 候选 → 真实点击 CY 行 → 回读 input → 点 Search → dump 结果 + 抓 API
//  B) 深链（oriLocCdParam=CNNGB&destLocCdParam=TRIST）是否渲染
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
const ENTRY = 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule';
const IGN = /heap|clarity|productfruits|contentsquare|google|doubleclick|hotjar|segment|newrelic|datadog|cookie-event|feature-config|simplify-tooltip|advance-notification|country|_next\/static|\.(css|woff2?|png|svg|js)/i;

const { page } = await openPage(ctx, ENTRY, { reuse: true });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
let hits = [];
cdp.on('Network.requestWillBeSent', (e) => {
  const u = e.request.url;
  if (/\/api\//i.test(u) && !IGN.test(u)) hits.push({ m: e.request.method, u: u.slice(0, 300), b: (e.request.postData || '').slice(0, 500), id: e.requestId });
});
const bodies = {};
cdp.on('Network.responseReceived', async (e) => {
  try {
    const h = hits.find((x) => x.id === e.requestId);
    if (h && !bodies[e.requestId] && !/pointName=/.test(h.u)) {
      const b = await cdp.send('Network.getResponseBody', { requestId: e.requestId }).catch(() => null);
      if (b && b.body) bodies[e.requestId] = b.body.slice(0, 1500);
    }
  } catch { /* no-op */ }
});

try {
  await sleep(12000);
  await dismissCookies(page).catch(() => {});
  console.log('URL:', page.url().slice(0, 140), 'blocked=', await isBlockPage(page));

  const oInp = page.locator('input[placeholder*="origin" i], input[placeholder*="from" i], input[id*="origin" i]').first();
  const dInp = page.locator('input[placeholder*="destination" i], input[placeholder*="to" i], input[id*="destination" i]').first();

  const dumpCands = async () => page.evaluate(() => {
    const sels = '[role="option"], [role="listbox"] li, li[role="option"], ul li, [class*="option"], [class*="suggest"] li, [class*="dropdown"] li, [class*="list"] li';
    const out = [];
    for (const el of document.querySelectorAll(sels)) {
      if (!el.offsetParent) continue;
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t && t.length < 80 && !out.includes(t)) out.push(t);
    }
    return out.slice(0, 30);
  });

  const typeInto = async (inp, word) => {
    await inp.click({ timeout: 8000 }).catch(() => {});
    await inp.fill('').catch(() => {});
    await inp.type(word, { delay: 90 }).catch(() => {});
    await sleep(4000);
  };

  console.log('\n== A) 手工填表 ==');
  await typeInto(oInp, 'ningbo');
  let v = await oInp.inputValue().catch(() => '?');
  console.log('origin 输入后 value=', JSON.stringify(v));
  const oc = await dumpCands();
  console.log('origin 候选:', JSON.stringify(oc));
  // 用 Playwright locator 真点（取含 CN 或第一个含 CY 的项；ariaSnapshot 更可靠）
  const optLoc = page.locator('[role="option"]');
  const n0 = await optLoc.count().catch(() => 0);
  const snaps = [];
  for (let i = 0; i < Math.min(n0, 12); i++) { let s = ''; try { s = await optLoc.nth(i).ariaSnapshot(); } catch {} snaps.push((s || '').replace(/\s+/g, ' ').trim()); }
  console.log('role=option 快照:', JSON.stringify(snaps));
  const pickIdx = snaps.findIndex((t) => /\bY\b|CY/i.test(t)) >= 0 ? snaps.findIndex((t) => /\bY\b|CY/i.test(t)) : 0;
  if (n0) { await optLoc.nth(pickIdx).click({ timeout: 5000 }).catch((e) => console.log('click err', String(e).slice(0, 60))); }
  await sleep(1500);
  console.log('origin 点选后 value=', JSON.stringify(await oInp.inputValue().catch(() => '?')));

  await typeInto(dInp, 'istanbul');
  console.log('dest 输入后 value=', JSON.stringify(await dInp.inputValue().catch(() => '?')));
  console.log('dest 候选:', JSON.stringify(await dumpCands()));
  const n1 = await optLoc.count().catch(() => 0);
  const snaps2 = [];
  for (let i = 0; i < Math.min(n1, 12); i++) { let s = ''; try { s = await optLoc.nth(i).ariaSnapshot(); } catch {} snaps2.push((s || '').replace(/\s+/g, ' ').trim()); }
  console.log('dest role=option 快照:', JSON.stringify(snaps2));
  if (n1) { await optLoc.nth(0).click({ timeout: 5000 }).catch((e) => console.log('click err', String(e).slice(0, 60))); }
  await sleep(1500);
  console.log('dest 点选后 value=', JSON.stringify(await dInp.inputValue().catch(() => '?')));

  hits = [];
  const sBtn = page.getByRole('button', { name: /^search$/i }).first();
  console.log('search 按钮可见:', await sBtn.isVisible().catch(() => false));
  await sBtn.click({ timeout: 8000 }).catch((e) => console.log('search click err', String(e).slice(0, 80)));
  let text = '';
  for (let i = 0; i < 14; i++) {
    await sleep(3000);
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/day\(s\)|No results|Total \d+ results/i.test(text)) break;
  }
  console.log('搜索后 URL:', page.url().slice(0, 200));
  console.log('搜索后 len=', text.length, '| day(s)?', /day\(s\)/.test(text), '| total?', /Total \d+ results/i.test(text));
  console.log('body:', text.replace(/\s+/g, ' ').slice(0, 1500));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/one-manual.txt', `URL:${page.url()}\n\n${text}`);
  await shot(page, 'one-manual-9-29');
  console.log('\n-- A 阶段 API --');
  [...new Set(hits.map((h) => `${h.m} ${h.u}`))].slice(0, 15).forEach((x) => console.log('  ', x));
  Object.entries(bodies).slice(0, 6).forEach(([id, b]) => console.log('  RESP', id, b.slice(0, 600), '\n'));

  // ---------- B) 深链 ----------
  console.log('\n== B) 深链 CNNGB→TRIST ==');
  hits = [];
  const today = new Date().toISOString().slice(0, 10);
  const deep = `https://www.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=&destLocNmParam=&oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=${today}&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=${today.slice(0, 4)}&month=${String(+today.slice(5, 7))}&searchType=List&isPolPodOn=false`;
  await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  let t2 = '';
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    t2 = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/day\(s\)|No results|Total \d+ results/i.test(t2)) break;
  }
  console.log('深链 len=', t2.length, '| day(s)?', /day\(s\)/.test(t2), '| total?', /Total \d+ results/i.test(t2));
  console.log('深链 body:', t2.replace(/\s+/g, ' ').slice(0, 1500));
  fs.writeFileSync('qa/probe-out/one-deep-trist.txt', `URL:${page.url()}\n\n${t2}`);
  await shot(page, 'one-deep-trist-9-29');
  console.log('\n-- B 阶段 API --');
  [...new Set(hits.map((h) => `${h.m} ${h.u}`))].slice(0, 15).forEach((x) => console.log('  ', x));
  Object.entries(bodies).slice(-4).forEach(([id, b]) => console.log('  RESP', id, b.slice(0, 800), '\n'));
} catch (e) {
  console.log('!! 异常:', String(e && e.stack || e).slice(0, 400));
} finally {
  fs.writeFileSync('qa/probe-out/one-xhr2.json', JSON.stringify({ hits, bodies }, null, 1));
  await ctx.close().catch(() => {});
  process.exit(0);
}

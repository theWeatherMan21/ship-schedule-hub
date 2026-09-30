// ONE 探针 D（9-29 婉宜）：点 button[type=submit] 提交 + 抓全部相关请求（含 _next/data）；再试「带名字」深链
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
const ENTRY = 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule';
const IGN = /heap|clarity|productfruits|contentsquare|google|doubleclick|hotjar|segment|newrelic|datadog|cookieyes|\.(css|woff2?|png|svg|jpe?g|gif|ico)/i;

const { page } = await openPage(ctx, ENTRY, { reuse: true });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
let hits = [];
cdp.on('Network.requestWillBeSent', (e) => {
  const u = e.request.url;
  if (!IGN.test(u) && !/\.js$/.test(u)) hits.push({ m: e.request.method, t: e.type, u: u.slice(0, 320), b: (e.request.postData || '').slice(0, 600), id: e.requestId });
});
const bodies = {};
cdp.on('Network.responseReceived', async (e) => {
  try {
    const id = e.requestId;
    if (!bodies[id] && /point-to-point|_next\/data|schedule\/api|\/api\/v[0-9]/i.test(e.response.url) && !/pointName=/.test(e.response.url)) {
      const b = await cdp.send('Network.getResponseBody', { requestId: id }).catch(() => null);
      if (b && b.body) bodies[id] = { u: e.response.url.slice(0, 220), body: b.body.slice(0, 3000) };
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
  console.log('填表后:', (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).slice(0, 380));

  // ===== A) 点真 submit =====
  hits = [];
  const submit = page.locator('button[type="submit"], form button[type="submit"]').last();
  console.log('\nsubmit 数量:', await page.locator('button[type="submit"]').count(), '可见:', await submit.isVisible().catch(() => false));
  const allSubmit = await page.evaluate(() => [...document.querySelectorAll('button[type="submit"]')].map((b, i) => ({ i, text: b.innerText.trim(), form: b.form ? b.form.action || '(form)' : '(no form)' })));
  console.log('submit 按钮:', JSON.stringify(allSubmit));
  await submit.click({ timeout: 8000 }).catch((e) => console.log('click err', String(e).slice(0, 80)));
  let text = '';
  for (let i = 0; i < 14; i++) {
    await sleep(3000);
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/day\(s\)|No results|Total \d+ results/i.test(text)) break;
  }
  console.log('A) URL:', page.url().slice(0, 240));
  console.log('A) len=', text.length, 'day(s)=', /day\(s\)/.test(text), 'total=', /Total \d+ results/i.test(text));
  console.log('A) body:', text.replace(/\s+/g, ' ').slice(0, 1600));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/one-submit.txt', `URL:${page.url()}\n\n${text}`);
  await shot(page, 'one-submit-9-29');
  console.log('A) 相关请求:');
  [...new Set(hits.filter((h) => /point-to-point|_next\/data|schedul/i.test(h.u)).map((h) => `${h.m} ${h.t} ${h.u}`))].slice(0, 12).forEach((x) => console.log('   ', x));
  Object.entries(bodies).slice(0, 4).forEach(([id, b]) => console.log('   RESP', b.u, '\n     ', b.body.slice(0, 1200), '\n'));

  // ===== B) 带名字的深链 =====
  console.log('\n== B) 深链（带 name）==');
  hits = [];
  const today = new Date().toISOString().slice(0, 10);
  const p = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const deep = 'https://www.one-line.com/one-ecom/schedule/point-to-point-schedule?' + p({
    oriLocNmParam: 'NINGBO, ZHEJIANG, CHINA', destLocNmParam: 'ISTANBUL, TURKEY',
    oriLocCdParam: 'CNNGB', destLocCdParam: 'TRIST', oriTermCdPara: 'Y', desTermCdPara: 'Y',
    frmDtParam: today, nextWeekValue: '14', cargoNature: 'GP', isEnabledCO2: 'false',
    year: today.slice(0, 4), month: String(+today.slice(5, 7)), searchType: 'List', isPolPodOn: 'false',
  });
  await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  let t2 = '';
  for (let i = 0; i < 16; i++) {
    await sleep(3000);
    t2 = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/day\(s\)|No results|Total \d+ results/i.test(t2)) break;
  }
  console.log('B) len=', t2.length, 'day(s)=', /day\(s\)/.test(t2), 'total=', /Total \d+ results/i.test(t2));
  console.log('B) body:', t2.replace(/\s+/g, ' ').slice(0, 1600));
  fs.writeFileSync('qa/probe-out/one-deep-named.txt', `URL:${page.url()}\n\n${t2}`);
  await shot(page, 'one-deep-named-9-29');
  console.log('B) 相关请求:');
  [...new Set(hits.filter((h) => /point-to-point|_next\/data|schedul/i.test(h.u)).map((h) => `${h.m} ${h.t} ${h.u}`))].slice(0, 12).forEach((x) => console.log('   ', x));
  Object.entries(bodies).slice(-3).forEach(([id, b]) => console.log('   RESP', b.u, '\n     ', b.body.slice(0, 900), '\n'));
  fs.writeFileSync('qa/probe-out/one-submit-xhr.json', JSON.stringify({ hits, bodies }, null, 1));
} catch (e) {
  console.log('!! 异常:', String(e && e.stack || e).slice(0, 400));
} finally {
  await ctx.close().catch(() => {});
  process.exit(0);
}

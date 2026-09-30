// 合并探针：A) Maersk 适配器 dump first routing 全结构；B) ONE 配方跑一遍 + CDP 抓请求（9-29 婉宜）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';
import * as utils from '../engine/lib/utils.mjs';
import * as dom from '../engine/lib/dom.mjs';
import { maerskInPage } from '../engine/fastpath.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import { byId } from '../engine/registry.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  // ---------- A) Maersk：dump 一条 routing 的全结构（看 via 有没有可读地名） ----------
  const { page: mp } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
  await sleep(7000);
  await dismissCookies(mp).catch(() => {});
  const o = await resolvePort('maersk', 'Ningbo');
  const d = await resolvePort('maersk', 'Istanbul');
  const mr = await maerskInPage(mp, o.locode, d.locode, '', o.name, d.name);
  console.log('== A) maersk rows:', mr && mr.rows && mr.rows.length, mr && mr.note);
  if (mr && mr.first) {
    fs.mkdirSync('qa/probe-out', { recursive: true });
    fs.writeFileSync('qa/probe-out/maersk-first-routing.json', JSON.stringify(mr.first, null, 1));
    console.log(JSON.stringify(mr.first, null, 1).slice(0, 2600));
  }

  // ---------- B) ONE：跑配方 + CDP 抓 API ----------
  console.log('\n== B) ONE ==');
  const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const hits = [];
  cdp.on('Network.requestWillBeSent', (e) => {
    const u = e.request.url;
    if (/api|graphql|schedule/i.test(u) && !/cookie|banner|log|analytics|segment|clarity|productfruits|contentsquare|one-line\.com\/ld\/|hotjar|google|facebook|newrelic|datadog/i.test(u)) {
      hits.push({ m: e.request.method, u: u.slice(0, 260), b: (e.request.postData || '').slice(0, 400), id: e.requestId });
    }
  });
  const bodies = {};
  cdp.on('Network.responseReceived', async (e) => {
    try {
      if (hits.some((h) => h.id === e.requestId && /schedule|route|search|PointToPoint/i.test(h.u)) && !bodies[e.requestId]) {
        const b = await cdp.send('Network.getResponseBody', { requestId: e.requestId }).catch(() => null);
        if (b && b.body) bodies[e.requestId] = b.body.slice(0, 1200);
      }
    } catch { /* no-op */ }
  });
  await sleep(6000);
  await dismissCookies(page).catch(() => {});
  const carrier = byId('one');
  let recipeMsg = '';
  try {
    const r = await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null, raw: {} }, { ...utils, ...dom, sleep: (ms) => new Promise((x) => setTimeout(x, ms)) });
    recipeMsg = JSON.stringify(r).slice(0, 600);
  } catch (e) { recipeMsg = 'ERR ' + String(e).slice(0, 200); }
  await sleep(10000);
  console.log('配方返回:', recipeMsg);
  console.log('URL:', page.url().slice(0, 200));
  const st = await page.evaluate(() => ({ len: document.body.innerText.length, head: document.body.innerText.replace(/\s+/g, ' ').slice(0, 900) })).catch((e) => ({ err: String(e).slice(0, 120) }));
  console.log('页面状态:', JSON.stringify(st).slice(0, 1200));
  console.log('\n-- 抓到的请求 --');
  [...new Set(hits.map((h) => `${h.m} ${h.u}`))].slice(0, 25).forEach((x) => console.log('  ', x));
  const withBody = hits.filter((h) => h.b);
  withBody.slice(0, 6).forEach((h) => console.log('  BODY', h.m, h.u.slice(0, 130), '|', h.b.slice(0, 300)));
  console.log('\n-- 响应体 --');
  Object.entries(bodies).slice(0, 4).forEach(([id, b]) => console.log('  ', id, b.slice(0, 500), '\n'));
  fs.writeFileSync('qa/probe-out/one-xhr.json', JSON.stringify({ hits, bodies, recipeMsg, url: page.url() }, null, 1));
} catch (e) {
  console.log('!! 异常:', String(e && e.stack || e).slice(0, 400));
} finally {
  await ctx.close().catch(() => {});
  process.exit(0);
}

// HMM 提单追踪 · 第 3 步：直开深链 /e-service/search/index.do?query=<单号>，抓 XHR + 结果页结构
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const NUM = process.argv[2] || 'HDMUSHAF36562700';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const log = [];
const skip = /\.(png|jpg|jpeg|gif|css|woff2?|svg|ico|js)(\?|$)/i;
page.on('request', (r) => { const u = r.url(); if (!skip.test(u)) log.push(`REQ ${r.method()} ${u}${r.postData() ? ' | ' + String(r.postData()).slice(0, 400) : ''}`); });
page.on('response', async (r) => {
  const u = r.url();
  if (skip.test(u)) return;
  const ct = (r.headers()['content-type'] || '');
  try {
    const t = await r.text();
    if (/json|xml|plain|javascript/.test(ct) || /\.do|\.json|api|search/i.test(u)) {
      fs.appendFileSync('/tmp/hmm-search-resp.txt', `\n=== ${r.status()} ${u} [${ct}]\n${t.slice(0, 8000)}\n`);
    }
  } catch {}
});
try {
  // 热身
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(3000);
  const url = `https://www.hmm21.com/e-service/search/index.do?query=${encodeURIComponent(NUM)}`;
  console.log('DEEP LINK:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(9000);
  const info = await page.evaluate(() => ({ url: location.href, title: document.title, len: (document.body?.innerText || '').length, body: (document.body?.innerText || '').slice(0, 4000) }));
  console.log('AFTER:', info.url, '|', info.title, '| len', info.len);
  console.log('--- BODY ---'); console.log(info.body);
  console.log('--- NET ---'); for (const l of [...new Set(log)].slice(-60)) console.log('  ' + l);
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
await ctx.close().catch(() => {});
process.exit(0);

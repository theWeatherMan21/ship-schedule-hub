// HMM 提单追踪 · 第 2 步：读 gotoTrkNTrc 源码 + 真填单号点 Search，抓跳转与 XHR
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const NUM = process.argv[2] || 'HDMUSHAF36562700';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const log = [];
page.on('request', (r) => { const u = r.url(); if (!/\.(png|jpg|gif|css|woff2?|svg|ico)(\?|$)/i.test(u)) log.push(`REQ ${r.method()} ${u}${r.postData() ? ' | ' + String(r.postData()).slice(0, 500) : ''}`); });
page.on('response', async (r) => {
  const u = r.url();
  if (/trace|Trace|track|Track/i.test(u) && !/\.(png|jpg|gif|css|woff2?|svg|ico|js)(\?|$)/i.test(u)) {
    try { const t = await r.text(); fs.appendFileSync('/tmp/hmm-trace-resp.txt', `\n=== ${r.status()} ${u}\n${t.slice(0, 6000)}\n`); log.push(`RESP ${r.status()} ${u} (${t.length}B)`); } catch {}
  }
});
try {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(3500);
  const src = await page.evaluate(() => {
    const fn = window.gotoTrkNTrc;
    return { exists: typeof fn === 'function', src: typeof fn === 'function' ? fn.toString() : '', scripts: [...document.querySelectorAll('script[src]')].map((s) => s.src) };
  });
  console.log('gotoTrkNTrc 存在:', src.exists);
  console.log('--- 源码 ---'); console.log(src.src);
  console.log('--- scripts ---'); for (const s of src.scripts) console.log('  ' + s);
  // 真填单号
  await page.fill('#selectTnt', NUM);
  await sleep(400);
  const before = page.url();
  await page.evaluate(() => window.gotoTrkNTrc());
  await sleep(7000);
  const after = await page.evaluate(() => ({ url: location.href, title: document.title, body: (document.body?.innerText || '').slice(0, 2500) }));
  console.log(`\nBEFORE ${before}\nAFTER  ${after.url}  |  ${after.title}`);
  console.log('--- AFTER BODY ---'); console.log(after.body);
  console.log('--- NET ---'); for (const l of [...new Set(log)].slice(-50)) console.log('  ' + l);
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
await ctx.close().catch(() => {});
process.exit(0);

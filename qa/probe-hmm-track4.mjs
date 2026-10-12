// HMM 提单追踪 · 第 4 步：抓 selectTrackNTrace.do 的完整请求/响应 + 点「Display Previous Moves」展开全历史
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const NUM = process.argv[2] || 'HDMUSHAF36562700';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
fs.writeFileSync('/tmp/hmm4-req.txt', '');
page.on('request', (r) => { if (/selectTrackNTrace|trackNTrace|search\/index/i.test(r.url())) fs.appendFileSync('/tmp/hmm4-req.txt', `${r.method()} ${r.url()}\nHEADERS ${JSON.stringify(r.headers()).slice(0, 600)}\nPOST ${String(r.postData() || '').slice(0, 1500)}\n---\n`); });
let n = 0;
page.on('response', async (r) => {
  if (!/selectTrackNTrace|TrackNTrace\.do|search\/index/i.test(r.url())) return;
  try { const t = await r.text(); n++; fs.writeFileSync(`/tmp/hmm4-resp-${n}.html`, t); console.log(`RESP#${n} ${r.status()} ${r.url()} len=${t.length} -> /tmp/hmm4-resp-${n}.html`); } catch {}
});
try {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(2500);
  await page.goto(`https://www.hmm21.com/e-service/search/index.do?query=${encodeURIComponent(NUM)}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(8000);
  const a = await page.evaluate(() => ({ url: location.href, len: (document.body?.innerText || '').length }));
  console.log('PAGE', a.url, 'len', a.len);
  console.log('--- 全 BODY ---');
  console.log(await page.evaluate(() => document.body.innerText));
  // 找「Display Previous Moves」并点它
  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button,span,div')].find((e) => /display previous moves/i.test((e.textContent || '').trim()));
    if (!el) return null;
    el.click();
    return { tag: el.tagName, onclick: el.getAttribute('onclick') || '', id: el.id, cls: el.className };
  });
  console.log('--- 点 Display Previous Moves ---', JSON.stringify(clicked));
  if (clicked) {
    await sleep(6000);
    console.log('--- 展开后 BODY ---');
    console.log(await page.evaluate(() => document.body.innerText));
  }
  console.log('--- REQS ---'); console.log(fs.readFileSync('/tmp/hmm4-req.txt', 'utf8').slice(0, 3000));
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
await ctx.close().catch(() => {});
process.exit(0);

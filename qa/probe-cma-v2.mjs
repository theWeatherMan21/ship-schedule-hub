// CMA 探针 v2：干净档案单次提交 + POST 响应监听 + 结果 fixture（静默）
import fs from 'node:fs';
import { launch, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'NGP3170431';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

let postResp = null;
page.on('response', async (r) => {
  if (/ebusiness\/tracking\/search/i.test(r.url()) && r.request().method() === 'POST') {
    postResp = { status: r.status(), ct: (r.headers()['content-type'] || '').slice(0, 40) };
    try { postResp.head = (await r.text()).slice(0, 300); } catch { /* ignore */ }
  }
});

await page.goto('https://www.cma-cgm.com/eBusiness/Tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(7000);
const f = await page.evaluate(() => ({
  hasRef: !!document.querySelector('#Reference'),
  hasBtn: !!document.querySelector('#btnTracking'),
  ddScript: /datadome/i.test(document.documentElement ? document.documentElement.innerHTML.slice(0, 8000) : ''),
})).catch(() => ({}));
console.log('form:', JSON.stringify(f));

if (f.hasRef) {
  await page.fill('#Reference', BL).catch(() => {});
  await sleep(1000);
  await page.click('#btnTracking', { timeout: 15000 }).catch((e) => console.log('clickErr', String(e).slice(0, 80)));
  let hit = null;
  for (let i = 0; i < 25; i++) {
    await sleep(3000);
    const s = await page.evaluate(() => ({
      details: /Tracking details/i.test(document.body ? document.body.innerText : ''),
      notfound: /was not found/i.test(document.body ? document.body.innerText : ''),
    })).catch(() => ({}));
    if (s.details || s.notfound) { hit = s; console.log(`hit@${(i + 1) * 3}s`, JSON.stringify(s)); break; }
  }
  console.log('postResp:', JSON.stringify(postResp));
  const st = await page.evaluate(() => ({
    url: location.href.slice(0, 150),
    txt: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 900),
  })).catch(() => ({}));
  console.log('final:', JSON.stringify(st).slice(0, 1300));
  if (hit && hit.details) {
    fs.mkdirSync('qa/fixtures', { recursive: true });
    fs.writeFileSync('qa/fixtures/cma-search-result.html', await page.content().catch(() => ''));
    console.log('fixture saved');
    const seg = await page.evaluate(() => {
      const t = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ');
      const i = t.indexOf('Tracking details');
      return { seg: t.slice(i, i + 1200), containers: [...new Set(t.match(/[A-Z]{4}\d{7}/g) || [])].slice(0, 8) };
    }).catch(() => ({}));
    console.log(JSON.stringify(seg, null, 1));
  }
}
await ctx.close().catch(() => {});

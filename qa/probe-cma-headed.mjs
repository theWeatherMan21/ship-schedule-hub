// CMA 冷却复测（有头最小化真指纹）：提交真单 + 轮询 + fixture（只读）
import fs from 'node:fs';
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'NGP3170431';
console.log('启动有头最小化浏览器…');
const h = await launchHeadedQuiet();
console.log('mode:', h.mode);
const ctx = h.ctx;
const page = ctx.pages()[0] || (await ctx.newPage());

async function probe(tag) {
  return page.evaluate(() => ({
    url: location.href.slice(0, 150),
    hasRef: !!document.querySelector('#Reference'),
    details: /Tracking details/i.test(document.body ? document.body.innerText : ''),
    notfound: /was not found/i.test(document.body ? document.body.innerText : ''),
    challenge: /datadome|verify you are|slide to|blocked/i.test((document.documentElement ? document.documentElement.innerHTML : '').slice(0, 5000)),
    txt: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 260),
  })).catch(() => ({}));
}

await page.goto('https://www.cma-cgm.com/eBusiness/Tracking', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('gotoErr', String(e).slice(0, 90)));
await sleep(8000);
console.log('[land]', JSON.stringify(await probe('land')));

const r = await probe('land');
if (r.hasRef) {
  await page.fill('#Reference', BL).catch(() => {});
  await sleep(900);
  await page.click('#btnTracking', { timeout: 15000 }).catch((e) => console.log('clickErr', String(e).slice(0, 80)));
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const s = await probe('wait');
    if (s.details || s.notfound) { console.log(`命中@${(i + 1) * 3}s details=${s.details} notfound=${s.notfound}`); break; }
  }
  const fin = await probe('final');
  console.log('[final]', JSON.stringify(fin));
  if (fin.details) {
    fs.mkdirSync('qa/fixtures', { recursive: true });
    const html = await page.content().catch(() => '');
    fs.writeFileSync('qa/fixtures/cma-search-result.html', html);
    console.log('fixture saved:', html.length, 'bytes');
    const st = await page.evaluate(() => {
      const t = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ');
      const i = t.indexOf('Tracking details');
      return { seg: t.slice(i, i + 1200), containers: [...new Set(t.match(/[A-Z]{4}\d{7}/g) || [])].slice(0, 10) };
    }).catch(() => ({}));
    console.log(JSON.stringify(st, null, 1));
  }
}
await ctx.close().catch(() => {});
console.log('closed');

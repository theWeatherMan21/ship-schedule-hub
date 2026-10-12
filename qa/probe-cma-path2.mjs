// CMA 双路探：结果页深链 + 表单提交轮询（无头、只读）
import fs from 'node:fs';
import { launch, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'NGP3170431';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

async function snap(tag) {
  const s = await page.evaluate(() => ({
    url: location.href.slice(0, 150),
    details: /Tracking details/i.test(document.body ? document.body.innerText : ''),
    notfound: /was not found|no information/i.test(document.body ? document.body.innerText : ''),
    txt: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 420),
  })).catch(() => ({}));
  console.log(`[${tag}]`, JSON.stringify(s));
  return s;
}

// A. 深链试探（detail 路径，GET）
for (const u of [
  `https://www.cma-cgm.com/ebusiness/tracking/detail/${BL}`,
  `https://www.cma-cgm.com/eBusiness/tracking/detail/${BL}`,
]) {
  await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(9000);
  const s = await snap('deep ' + u.split('/').slice(-2)[0]);
  if (s.details) {
    fs.writeFileSync('qa/fixtures/cma-deeplink.html', await page.content().catch(() => ''));
    console.log('★★ 深链出数据！fixture 已存');
    await ctx.close().catch(() => {});
    process.exit(0);
  }
}

// B. 表单提交 + 轮询（最长 60s）
console.log('— 表单路径 —');
await page.goto('https://www.cma-cgm.com/eBusiness/Tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(7000);
await page.fill('#Reference', BL).catch(() => {});
await sleep(900);
await page.click('#btnTracking', { timeout: 12000 }).catch((e) => console.log('clickErr', String(e).slice(0, 80)));
let ok = false;
for (let i = 0; i < 20; i++) {
  await sleep(3000);
  const s = await page.evaluate(() => ({
    details: /Tracking details/i.test(document.body ? document.body.innerText : ''),
    notfound: /was not found/i.test(document.body ? document.body.innerText : ''),
  })).catch(() => ({}));
  if (s.details || s.notfound) { console.log(`命中@${(i + 1) * 3}s details=${s.details} notfound=${s.notfound}`); ok = s.details; break; }
}
if (ok) {
  const html = await page.content().catch(() => '');
  fs.writeFileSync('qa/fixtures/cma-search-result.html', html);
  console.log('fixture saved:', html.length, 'bytes');
  const st = await page.evaluate(() => {
    const t = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ');
    const i = t.indexOf('Tracking details');
    return { seg: t.slice(i, i + 900), containers: (t.match(/[A-Z]{4}\d{7}/g) || []).slice(0, 8) };
  }).catch(() => ({}));
  console.log(JSON.stringify(st, null, 1));
}
await ctx.close().catch(() => {});

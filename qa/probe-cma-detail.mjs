// CMA 真单明细：点 Display Details 展开柜级明细 + fixture 保存（无头、只读）
import fs from 'node:fs';
import { launch, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'NGP3170431';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

await page.goto('https://www.cma-cgm.com/eBusiness/Tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(6000);
await page.fill('#Reference', BL).catch(() => {});
await sleep(800);
await page.click('#btnTracking', { timeout: 12000 }).catch(() => {});
await sleep(14000);
console.log('search url:', page.url().slice(0, 150));

// 保存结果页 HTML
const html = await page.content().catch(() => '');
fs.mkdirSync('qa/fixtures', { recursive: true });
fs.writeFileSync('qa/fixtures/cma-tracking-NGP3170431.html', html);
console.log('fixture saved:', html.length, 'bytes');

// 找 Display Details 入口
const btns = await page.evaluate(() => [...document.querySelectorAll('a, button')]
  .map((x) => ({ tag: x.tagName, t: (x.innerText || '').trim().slice(0, 40), cls: String(x.className || '').slice(0, 60), id: x.id || '' }))
  .filter((x) => /display details|details/i.test(x.t)).slice(0, 6));
console.log('details buttons:', JSON.stringify(btns));

// 点第一个
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('a, button')].find((x) => /display details/i.test((x.innerText || '')));
  if (b) { b.click(); return true; }
  return false;
});
console.log('clicked:', clicked);
await sleep(12000);

const detail = await page.evaluate(() => {
  const t = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ');
  const i = t.indexOf('Tracking details');
  return {
    around: t.slice(Math.max(0, i), i + 1500),
    tables: [...document.querySelectorAll('table')].map((tb) => [...tb.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim())).filter((r) => r.filter(Boolean).length)).filter((t2) => t2.length > 1).slice(0, 4),
  };
}).catch(() => ({}));
console.log('══ 明细 ══');
console.log(JSON.stringify(detail).slice(0, 2500));

// 保存展开后的 HTML
const html2 = await page.content().catch(() => '');
fs.writeFileSync('qa/fixtures/cma-detail-NGP3170431.html', html2);
console.log('detail fixture saved:', html2.length, 'bytes');
console.log('detail url:', page.url().slice(0, 160));

await ctx.close().catch(() => {});

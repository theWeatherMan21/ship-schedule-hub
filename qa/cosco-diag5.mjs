// COSCO 诊断 5：修 dropdown 挂载——先 focus，再点击可见的下拉项；含运输模式子选项
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({});
const page = await ctx.newPage();
const xhr = [];
page.on('response', async (r) => {
  try { const u = r.url(); if (/schedule|sailing|search|voyage|route|cargo|common/i.test(u) && !/\.(js|css|png|jpg|woff|svg)/.test(u)) { const b = await r.text().catch(() => ''); if (b.length > 50) xhr.push({ m: r.request().method(), u, s: r.status(), len: b.length, head: b.slice(0, 500) }); } } catch {}
});

await page.goto('https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(4000);
await dismissCookies(page);
await sleep(1000);

async function pickPort(textboxRe, word, label) {
  const f = page.getByRole('textbox', { name: textboxRe }).first();
  await f.waitFor({ state: 'visible', timeout: 10000 });
  await f.click();
  await f.fill('');
  await f.type(word, { delay: 70 });
  await sleep(2500);
  // 只点可见的下拉项
  const items = page.locator('.ivu-select-item');
  const n = await items.count().catch(() => 0);
  let picked = null;
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    if (await it.isVisible().catch(() => false)) {
      const t = (await it.textContent()).replace(/\s+/g, ' ').trim();
      if (!picked) console.log(`${label} 可见候选: ${t.slice(0, 80)}`);
      if (t.toLowerCase().startsWith(word.toLowerCase()) && !picked) { picked = t; await it.click({ timeout: 3000 }); console.log(`  → 已点: ${t.slice(0, 70)}`); break; }
    }
  }
  if (!picked) { console.log(`${label}: 无可见候选（n=${n}）`); return false; }
  await sleep(800);
  return true;
}

await pickPort(/origin city/i, 'Ningbo', '起运');
await pickPort(/destination city/i, 'Istanbul', '目的');

// 日期
const date = page.getByRole('textbox', { name: /earliest departure/i }).first();
if (await date.isVisible().catch(() => false)) {
  await date.click(); await sleep(500);
  await date.fill('2026-09-28'); await sleep(300);
  await page.keyboard.press('Escape');
  console.log('日期值:', await date.inputValue().catch(() => '?'));
}

// 按钮 dump + 点击 Search（searchByCity 表单内的那个）
const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => {
  const r = b.getBoundingClientRect();
  if (r.width === 0) return null;
  return { t: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), y: Math.round(r.y) };
}).filter(Boolean));
console.log('按钮:', JSON.stringify(btns));

await page.screenshot({ path: 'evidence/m4-cosco-filled.png' });
// 点表单 Search（y 最大的？不，取可见 Search 中 y 最小的表单区——先全部枚举再点 y 在表单区的）
for (const b of btns.filter(x => /search/i.test(x.t))) {
  const btn = page.locator('button').filter({ hasText: 'Search' });
  break;
}
const searchBtns = page.locator('button').filter({ hasText: /^Search$/ });
const sn = await searchBtns.count().catch(() => 0);
console.log('Search 按钮数:', sn);
for (let i = 0; i < sn; i++) {
  const bb = searchBtns.nth(i);
  if (await bb.isVisible().catch(() => false)) {
    const box = await bb.boundingBox();
    console.log(`  [${i}] y=${Math.round(box.y)}`);
  }
}
// 点 y 最小的可见 Search（表单上方那个主按钮）
let target = -1, minY = 1e9;
for (let i = 0; i < sn; i++) {
  const bb = searchBtns.nth(i);
  if (await bb.isVisible().catch(() => false)) {
    const box = await bb.boundingBox();
    if (box.y < minY) { minY = box.y; target = i; }
  }
}
if (target >= 0) { await searchBtns.nth(target).click(); console.log('已点 Search #' + target); }
// 再试坐标点击 y≈575 的 Search（DOM dump 里有而 role 枚举漏掉的）
await sleep(2500);
let txt2 = await page.evaluate(() => document.body.innerText);
if (txt2.length < 1500) {
  const allBtns = page.locator('button').filter({ hasText: 'Search' });
  const nn = await allBtns.count().catch(() => 0);
  for (let i = 0; i < nn; i++) {
    const box = await allBtns.nth(i).boundingBox().catch(() => null);
    if (box && Math.abs(box.y - 575) < 60) { await allBtns.nth(i).click(); console.log('已点 y≈575 Search #' + i); break; }
  }
}

await sleep(20000);
const text = await page.evaluate(() => document.body.innerText);
console.log('结果文本长度:', text.length, 'URL:', page.url());
const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
lines.slice(0, 50).forEach(l => console.log('  ', l.slice(0, 140)));
console.log('---- XHR ----');
xhr.forEach(x => console.log(' ', x.m, x.s, x.len, x.u.slice(0, 120), '|', x.head.replace(/\s+/g, ' ').slice(0, 120)));
await page.screenshot({ path: 'evidence/m4-cosco-result.png' });
fs.writeFileSync('qa/cosco-result.txt', text);
await ctx.close().catch(() => {});
process.exit(0);

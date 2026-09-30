// COSCO 诊断 4：完整跑通 searchByCity——日期控件 + Search 按钮 + 结果
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({});
const page = await ctx.newPage();
const xhr = [];
page.on('response', async (r) => {
  try { const u = r.url(); if (/schedule|sailing|search|voyage|route|common|cargo/i.test(u) && !/\.(js|css|png|jpg|woff|svg)/.test(u)) { const b = await r.text().catch(() => ''); if (b.length > 50) xhr.push({ m: r.request().method(), u, s: r.status(), len: b.length, head: b.slice(0, 400) }); } } catch {}
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
  const items = page.locator('.ivu-select-item');
  const n = await items.count().catch(() => 0);
  console.log(`${label} 候选 ${n} 个:`);
  for (let i = 0; i < Math.min(n, 8); i++) console.log('  ', (await items.nth(i).textContent()).replace(/\s+/g, ' ').trim().slice(0, 80));
  if (n) { await items.first().click(); await sleep(800); return true; }
  return false;
}

await pickPort(/origin city/i, 'Ningbo', '起运');
await pickPort(/destination city/i, 'Istanbul', '目的');

// 日期：可能是 input 或要点开的控件，枚举所有 input
const inputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input')).map((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    return { ph: el.placeholder, name: el.name, id: el.id, type: el.type, val: el.value, aria: el.getAttribute('aria-label') };
  }).filter(Boolean);
});
console.log('页面 inputs:', JSON.stringify(inputs, null, 1).slice(0, 1500));

// 试日期字段
const date = page.getByRole('textbox', { name: /earliest departure/i }).first();
if (await date.isVisible().catch(() => false)) {
  await date.click();
  await sleep(600);
  await date.fill('2026-09-28');
  await page.keyboard.press('Escape');
  await sleep(400);
  console.log('日期值:', await date.inputValue().catch(() => '?'));
}

// 枚举按钮（可见）
const btnDump = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button')).map((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    return { t: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), y: Math.round(r.y), x: Math.round(r.x) };
  }).filter(Boolean).slice(0, 15);
});
console.log('按钮:', JSON.stringify(btnDump));

await page.screenshot({ path: 'evidence/m4-cosco-filled.png' });
await ctx.close().catch(() => {});
process.exit(0);

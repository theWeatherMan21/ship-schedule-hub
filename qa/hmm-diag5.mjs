// HMM 诊断 5：Haydarpasa 0 结果 → 试 Ambarli 等变体 + Retrieve 再查
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();
await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);

async function pick(word, nth, prefix) {
  const f = page.getByRole('textbox', { name: /input a location name/i }).nth(nth);
  await f.click(); await f.fill(''); await f.type(word, { delay: 80 });
  await sleep(3000);
  const items = page.locator('ul:not([class]) li, ul[class=""] li');
  const n = await items.count().catch(() => 0);
  const found = [];
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    if (await it.isVisible().catch(() => false)) {
      let t = ''; try { t = await it.textContent(); } catch {}
      t = t.replace(/\s+/g, ' ').trim();
      if (t && t.length < 90) found.push(t);
      if (prefix && t.toUpperCase().startsWith(prefix.toUpperCase())) { await it.click({ timeout: 3000 }); await sleep(1000); return t; }
    }
  }
  console.log(`${word} 候选:`, JSON.stringify(found.slice(0, 8)));
  return null;
}

// 记录 Istanbul 系全部变体
await pick('Ningbo', 0, 'NINGBO, CHINA');
const dests = await pick('Istanbul', 1, null);
console.log('Istanbul 候选全录:', dests);
// 也试 Ambarli
await page.getByRole('textbox', { name: /input a location name/i }).nth(1).click();
const amb = await pick('Ambarli', 1, null);
console.log('Ambarli 候选全录:', amb);

// 用第一个 Istanbul 变体跑
await page.getByRole('textbox', { name: /input a location name/i }).nth(1).click();
await page.getByRole('textbox', { name: /input a location name/i }).nth(1).fill('');
await page.getByRole('textbox', { name: /input a location name/i }).nth(1).type('Istanbul', { delay: 80 });
await sleep(3000);
const items = page.locator('ul:not([class]) li, ul[class=""] li');
const n = await items.count().catch(() => 0);
for (let i = 0; i < n; i++) {
  const it = items.nth(i);
  if (await it.isVisible().catch(() => false)) {
    let t = ''; try { t = await it.textContent(); } catch {}
    if (t && t.toUpperCase().startsWith('ISTANBUL')) { await it.click(); console.log('选:', t.trim()); break; }
  }
}
await page.locator('input[type="date"]').first().fill('2026-09-28');
await page.getByRole('button', { name: /^search$/i }).first().click();
await page.waitForURL(/ScheduleMainPost/, { timeout: 30000 }).catch(() => {});
await sleep(10000);
let t = await page.evaluate(() => document.body.innerText);
console.log('结果页文本长度:', t.length);
// 0 结果时点 Retrieve 再试
if (/Search Results \(0\)/.test(t)) {
  const ret = page.getByRole('button', { name: /retrieve/i }).first();
  if (await ret.isVisible().catch(() => false)) { await ret.click(); await sleep(10000); t = await page.evaluate(() => document.body.innerText); console.log('Retrieve 后文本长度:', t.length); }
}
fs.writeFileSync('qa/hmm-post2.txt', t);
const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
const idx = lines.findIndex(l => /Sailing Schedule Result/.test(l));
lines.slice(Math.max(0, idx), idx + 40).forEach(l => console.log('  ', l.slice(0, 140)));
await ctx.close().catch(() => {});
process.exit(0);

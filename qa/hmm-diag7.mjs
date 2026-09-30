// HMM 诊断 7：Ningbo → AMBARLI (TRAMB) 搜索
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();
await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);

async function pickInput(word, nth, prefix) {
  const f = page.getByRole('textbox', { name: /input a location name/i }).nth(nth);
  await f.click(); await f.fill(''); await f.type(word, { delay: 80 });
  await sleep(2800);
  const items = page.locator('ul:not([class]) li, ul[class=""] li');
  const n = await items.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    if (await it.isVisible().catch(() => false)) {
      let t = ''; try { t = await it.textContent(); } catch {}
      if (t && t.replace(/\s+/g, ' ').toUpperCase().startsWith(prefix.toUpperCase())) { await it.click({ timeout: 3000 }); await sleep(1000); return t.replace(/\s+/g, ' ').trim(); }
    }
  }
  return null;
}

console.log('From:', await pickInput('Ningbo', 0, 'NINGBO'));
console.log('To:', await pickInput('Ambarli', 1, 'AMBARLI'));
await page.locator('input[type="date"]').first().fill('2026-09-28');
await page.getByRole('button', { name: /^search$/i }).first().click();
await page.waitForURL(/ScheduleMainPost/, { timeout: 30000 }).catch(() => {});
await sleep(10000);
const t = await page.evaluate(() => document.body.innerText);
console.log('文本长度:', t.length);
fs.writeFileSync('qa/hmm-ambarli.txt', t);
const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
const idx = lines.findIndex(l => /Sailing Schedule Result/.test(l));
lines.slice(Math.max(0, idx), idx + 50).forEach(l => console.log('  ', l.slice(0, 150)));
await page.screenshot({ path: 'evidence/m4-hmm-ambarli.png' });
await ctx.close().catch(() => {});
process.exit(0);

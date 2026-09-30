// HMM 诊断 8：T/S 结果是否被折叠——看 XHR/表格 DOM（可能渲染但 innerText 抓不到）
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
      if (t && t.replace(/\s+/g, ' ').toUpperCase().startsWith(prefix.toUpperCase())) { await it.click({ timeout: 3000 }); await sleep(1000); return true; }
    }
  }
  return false;
}

await pickInput('Ningbo', 0, 'NINGBO');
await pickInput('Ambarli', 1, 'AMBARLI');
await page.locator('input[type="date"]').first().fill('2026-09-28');
await page.getByRole('button', { name: /^search$/i }).first().click();
await page.waitForURL(/ScheduleMainPost/, { timeout: 30000 }).catch(() => {});
await sleep(8000);
// T/S 优先级切换为 All（已是 All 默认）→ 检查结果区 DOM
const dom = await page.evaluate(() => {
  const out = { tables: 0, rows: 0, texts: [] };
  document.querySelectorAll('table').forEach(tb => { out.tables++; out.rows += tb.rows.length; });
  document.querySelectorAll('[class*="schedule"], [class*="result"], [class*="sailing"]').forEach(el => {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length > 20 && t.length < 300) out.texts.push(t.slice(0, 150));
  });
  return out;
});
console.log('tables:', dom.tables, 'rows:', dom.rows);
console.log('结果区片段:', JSON.stringify(dom.texts.slice(0, 10), null, 1));
await ctx.close().catch(() => {});
process.exit(0);

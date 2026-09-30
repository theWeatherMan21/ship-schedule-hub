// COSCO 诊断 6：处理 Search 后的 modal——先截图 + 读 modal 文本
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
  await f.click(); await f.fill(''); await f.type(word, { delay: 70 });
  await sleep(2500);
  const items = page.locator('.ivu-select-item');
  const n = await items.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    if (await it.isVisible().catch(() => false)) {
      const t = (await it.textContent()).replace(/\s+/g, ' ').trim();
      if (t.toLowerCase().startsWith(word.toLowerCase())) { await it.click({ timeout: 3000 }); console.log(`${label} → ${t.slice(0, 60)}`); await sleep(800); return true; }
    }
  }
  console.log(`${label}: 无可见候选`); return false;
}

await pickPort(/origin city/i, 'Ningbo', '起运');
await pickPort(/destination city/i, 'Istanbul', '目的');
const date = page.getByRole('textbox', { name: /earliest departure/i }).first();
await date.click(); await sleep(400);
await date.fill('2026-09-28'); await sleep(300);
await page.keyboard.press('Escape');
console.log('日期:', await date.inputValue().catch(() => '?'));

// 用真实表单按钮（submit-btn btnSearch）
const search = page.locator('button.btnSearch, .submit-btn').first();
console.log('btnSearch 可见:', await search.isVisible().catch(() => false));
await search.click({ timeout: 5000 }).catch(e => console.log('click err:', String(e).slice(0, 100)));
await sleep(3000);

// modal 内容
const modal = page.locator('.ivu-modal-wrap, .ivu-modal');
const mn = await modal.count().catch(() => 0);
if (mn) {
  const mt = await modal.first().innerText().catch(() => '');
  console.log('---- MODAL 文本 ----');
  console.log(mt.slice(0, 800));
  await page.screenshot({ path: 'evidence/m4-cosco-modal.png' });
}
await sleep(15000);
const text = await page.evaluate(() => document.body.innerText);
console.log('结果文本长度:', text.length);
const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
lines.slice(0, 40).forEach(l => console.log('  ', l.slice(0, 140)));
console.log('---- XHR ----');
xhr.forEach(x => console.log(' ', x.m, x.s, x.len, x.u.slice(0, 120)));
await page.screenshot({ path: 'evidence/m4-cosco-result.png' });
fs.writeFileSync('qa/cosco-result.txt', text);
await ctx.close().catch(() => {});
process.exit(0);

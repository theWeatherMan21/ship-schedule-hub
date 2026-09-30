// COSCO 诊断：探 Sailing Schedule 表单的真实入口
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({});
const page = await ctx.newPage();
await page.goto('https://elines.coscoshipping.com/ebusiness/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(4000);
await dismissCookies(page);
await sleep(1000);

// 点 Sailing Schedule 菜单
const menu = page.getByText('Sailing Schedule', { exact: false }).first();
console.log('Sailing Schedule 菜单可见:', await menu.isVisible().catch(() => false));
await menu.click({ timeout: 3000 }).catch(e => console.log('click err', String(e).slice(0, 80)));
await sleep(4000);
console.log('URL:', page.url());

const snap = await page.locator('body').ariaSnapshot().catch(() => 'FAIL');
fs.writeFileSync('qa/aria-cosco-live.txt', snap);
console.log(snap.split('\n').filter(l => /textbox|combobox|button|search/i.test(l)).slice(0, 25).join('\n'));

// 尝试 Origin
const origin = page.getByRole('textbox', { name: /origin city/i }).first();
if (await origin.isVisible().catch(() => false)) {
  await origin.click(); await origin.type('Ningbo', { delay: 70 });
  await sleep(2500);
  const opts = page.locator('[role="option"], .autocomplete li, [class*="dropdown"] li, li');
  const n = await opts.count().catch(() => 0);
  console.log('Ningbo 候选数:', n);
  for (let i = 0; i < Math.min(n, 8); i++) {
    let t = '';
    try { t = await opts.nth(i).ariaSnapshot(); } catch {}
    if (!t) { try { t = await opts.nth(i).textContent(); } catch {} }
    console.log('  [' + i + ']', String(t).replace(/\s+/g, ' ').trim().slice(0, 90));
  }
} else {
  console.log('origin 不可见；页面文本头：');
  const t = await page.evaluate(() => document.body.innerText);
  console.log(t.split('\n').slice(0, 25).join('\n'));
}
await ctx.close().catch(() => {});
process.exit(0);

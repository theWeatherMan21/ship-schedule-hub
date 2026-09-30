// CMA 诊断：拿 schedules 表单的 aria 结构
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('goto err', String(e).slice(0, 100)));
await sleep(6000);
await dismissCookies(page);
await sleep(1500);

console.log('title:', await page.title());
const snap = await page.locator('body').ariaSnapshot().catch(() => 'FAIL');
fs.writeFileSync('qa/aria-cma-live.txt', snap);
console.log(snap.split('\n').filter(l => /textbox|combobox|button|search|listbox/i.test(l)).slice(0, 40).join('\n'));

// 交互测试：Origin 字段
const origin = page.getByRole('textbox', { name: /origin|place of loading/i }).first();
if (await origin.isVisible().catch(() => false)) {
  await origin.click(); await origin.type('Ningbo', { delay: 70 });
  await sleep(3000);
  const opts = page.locator('[role="option"], [role="listbox"] li, .autocomplete li, li.ui-menu-item');
  const n = await opts.count().catch(() => 0);
  console.log('Ningbo 候选数:', n);
  for (let i = 0; i < Math.min(n, 8); i++) {
    let t = '';
    try { t = await opts.nth(i).textContent(); } catch {}
    console.log('  [' + i + ']', String(t).replace(/\s+/g, ' ').trim().slice(0, 80));
  }
} else {
  console.log('origin 字段不可见');
}
await ctx.close().catch(() => {});
process.exit(0);

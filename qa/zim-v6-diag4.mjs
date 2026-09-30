import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(6000); await dismissCookies(page); await sleep(1000);
await page.getByRole('tab', { name: /^schedules$/i }).first().click({ timeout: 8000 });
await sleep(2500);
const origin = page.getByRole('combobox', { name: /^origin$/i }).first();
await origin.click();
await sleep(1500);
// ariaSnapshot of the whole panel after click
const snap = await page.locator('body').ariaSnapshot().catch(() => 'ERR');
console.log(snap.split('\n').filter(l => /combobox|option|listbox|textbox|Origin|Destination/i.test(l)).join('\n').slice(0, 2000));
// 找 listbox
const info = await page.evaluate(() => {
  const q = document.querySelectorAll('[role="listbox"], [class*="listbox" i], [class*="combo"]');
  return Array.from(q).map(e => ({ tag: e.tagName, cls: String(e.className).slice(0,80), role: e.getAttribute('role'), txt: (e.innerText||'').slice(0,150) }));
});
console.log(JSON.stringify(info, null, 1).slice(0, 1500));
await ctx.close().catch(()=>{}); process.exit(0);

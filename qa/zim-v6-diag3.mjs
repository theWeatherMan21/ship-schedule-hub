import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(6000); await dismissCookies(page); await sleep(1000);
await page.getByRole('tab', { name: /^schedules$/i }).first().click({ timeout: 8000 });
await sleep(2500);
// 点开 Origin combobox 后看 DOM 结构（输入框在弹层里）
const origin = page.getByRole('combobox', { name: /^origin$/i }).first();
console.log('visible:', await origin.isVisible().catch(()=>false));
await origin.click().catch(e => console.log('click err', String(e).slice(0,80)));
await sleep(1200);
const dump = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input')).map(i => ({ ph: i.placeholder, label: i.getAttribute('aria-label'), type: i.type, cls: String(i.className).slice(0,60) }));
  const lists = Array.from(document.querySelectorAll('[role="listbox"], [class*="dropdown"], [class*="popup"]')).map(e => ({ cls: String(e.className).slice(0,80), txt: (e.innerText||'').slice(0,120) }));
  return { active: `${document.activeElement?.tagName}.${String(document.activeElement?.className).slice(0,60)}`, inputs, lists };
});
console.log(JSON.stringify(dump, null, 1).slice(0, 2500));
await ctx.close().catch(()=>{}); process.exit(0);

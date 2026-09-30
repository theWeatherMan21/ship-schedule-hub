// 只诊断 CMA 目的港：group Destination combobox 点击→打字→TRAVC 行→点击→回读各 input 值
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);

// 先起运（复刻配方，已验证 OK）
const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.click(); await sleep(500);
await page.keyboard.type('ningbo', { delay: 80 }); await sleep(2500);
await page.locator('li.place-suggestion').filter({ hasText: /CNNGB/ }).filter({ hasText: /port/i }).first().click({ timeout: 5000 }).catch(e=>console.log('o click err', String(e).slice(0,60)));
await sleep(2000);

// 目的
const dest = page.getByRole('group', { name: /^destination$/i }).getByRole('combobox').first();
console.log('dest count:', await dest.count().catch(()=>-1));
console.log('dest aria/role check:', await dest.evaluate(e => [e.tagName, e.getAttribute('role'), e.getAttribute('aria-label'), e.getAttribute('id')]).catch(e=>'ERR '+String(e).slice(0,50)));
await dest.click({ timeout: 8000 }).catch(e => console.log('dest click err', String(e).slice(0,80)));
await sleep(800);
console.log('active after dest click:', await page.evaluate(() => { const a=document.activeElement; return a ? (a.id||a.tagName||a.className||'') : null; }));
await page.keyboard.type('istanbul', { delay: 80 }); await sleep(3000);
const dItems = page.locator('li.place-suggestion').filter({ hasText: /TRAVC/i });
let dn = 0; for (let i = 0; i < 20; i++) { dn = await dItems.count().catch(() => 0); if (dn > 0) break; await sleep(500); }
console.log('TRAVC rows:', dn);
for (let i = 0; i < Math.min(dn,3); i++) console.log('  row', JSON.stringify((await dItems.nth(i).innerText().catch(()=>'')).replace(/\n/g,' ').slice(0,80)));
await dItems.filter({ hasText: /port/i }).first().click({ timeout: 6000 }).catch(e => console.log('d click err', String(e).slice(0,80)));
await sleep(2000);
// 全量 input 值回读
const vals = await page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('input')) {
    if (el.value && (el.id || el.name)) out[el.id || el.name] = el.value.slice(0, 80);
  }
  return out;
});
console.log('ALL input values:', JSON.stringify(vals, null, 1));
await ctx.close().catch(()=>{}); process.exit(0);

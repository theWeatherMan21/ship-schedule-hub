// 确认：row click 后 #AutoCompletePOL / dest input 的真实 value（用 DOM id 回读，定位配方的验证 bug）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);

// 页面全部 input 的 id 清单
const ids = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ id: i.id, name: i.name, aria: i.getAttribute('aria-label'), role: i.getAttribute('role') })).filter(x => x.id || x.aria));
console.log('inputs:', JSON.stringify(ids.slice(0, 12)));

const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.click(); await sleep(500);
await page.keyboard.type('ningbo', { delay: 80 }); await sleep(2500);
const li = page.locator('li.place-suggestion').filter({ hasText: /CNNGB/ }).filter({ hasText: /port/i }).first();
await li.click({ timeout: 5000 }).catch(e => console.log('click err', String(e).slice(0,80)));
await sleep(2000);
console.log('POL by id:', JSON.stringify(await page.evaluate(() => document.getElementById('AutoCompletePOL')?.value)));
console.log('POL by locator inputValue:', JSON.stringify(await box.inputValue().catch(e=>'ERR:'+String(e).slice(0,40))));

// 目的：找到 dest input 的 id（同页第二个 AutoCompletePOD?）
const destIds = await page.evaluate(() => [...document.querySelectorAll('input[id*="AutoComplete"]|| input[id*="POD"]|| input[id*="Dest"]')].map(i => i.id));
console.log('autocomplete ids:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i=>i.id).filter(Boolean))));
const dest = page.getByRole('group', { name: /^destination$/i }).getByRole('combobox').first();
console.log('dest tagname:', await dest.evaluate(e => e.tagName).catch(e=>'ERR'));
await dest.click({ timeout: 8000 }).catch(e => console.log('dest click err', String(e).slice(0,80)));
await sleep(500);
console.log('focused element:', await page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : null; }));
await page.keyboard.type('istanbul', { delay: 80 }); await sleep(3000);
const dItems = page.locator('li.place-suggestion').filter({ hasText: /TRAVC/i });
let dn = 0; for (let i = 0; i < 20; i++) { dn = await dItems.count().catch(() => 0); if (dn > 0) break; await sleep(500); }
console.log('dest TRAVC rows:', dn);
for (let i = 0; i < Math.min(dn, 3); i++) console.log('  ', JSON.stringify((await dItems.nth(i).innerText().catch(()=>'')).replace(/\n/g,' ').slice(0,80)));
await dItems.filter({ hasText: /port/i }).first().click({ timeout: 6000 }).catch(e => console.log('dest click err', String(e).slice(0,80)));
await sleep(2000);
const destVal = await page.evaluate(() => { const el = [...document.querySelectorAll('input')].find(i => /istanbul|TRAVC|ambarli/i.test(i.value||'')); return el ? [el.id, el.value] : null; });
console.log('dest value found:', JSON.stringify(destVal));
await ctx.close().catch(()=>{}); process.exit(0);

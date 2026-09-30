// 复刻 cma.mjs pickRow 逐步诊断：找出配方失败与 diag6 成功的分叉点
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
console.log('HTTP', await page.evaluate(()=>location.href).catch(()=>''));
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);

const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.waitFor({ state: 'visible', timeout: 20000 });
console.log('box visible ok');

// === 配方 pickRow 逐步 ===
await box.click({ timeout: 8000 }).catch(()=>{});
await sleep(500);
await page.keyboard.type('ningbo', { delay: 80 });
await sleep(2500);
const items = page.locator('li.place-suggestion').filter({ hasText: new RegExp('\\(CNNGB\\)', 'i') });
let n = 0;
for (let i = 0; i < 20; i++) { n = await items.count().catch(() => 0); if (n > 0) break; await sleep(500); }
console.log('recipe-style filtered count:', n);
const all = page.locator('li.place-suggestion');
console.log('all place-suggestion count:', await all.count().catch(()=>-1));
let row = items.filter({ hasText: /port/i }).first();
console.log('port-row count:', await row.count().catch(()=>-1));
await row.click({ timeout: 6000 }).catch(e => console.log('click err', String(e).slice(0,100)));
await sleep(1500);
const conf = await box.inputValue().catch(() => 'NO-VALUE');
console.log('origin inputValue:', JSON.stringify(conf));

// === 目的港 ===
const dest = page.getByRole('group', { name: /^destination$/i }).getByRole('combobox').first();
const dCount = await dest.count().catch(()=>-1);
console.log('dest group combobox count:', dCount);
await dest.click({ timeout: 8000 }).catch(e => console.log('dest click err', String(e).slice(0,100)));
await sleep(500);
await page.keyboard.type('istanbul', { delay: 80 });
await sleep(3000);
const dItems = page.locator('li.place-suggestion').filter({ hasText: new RegExp('\\(TRAVC\\)', 'i') });
let dn = 0;
for (let i = 0; i < 20; i++) { dn = await dItems.count().catch(() => 0); if (dn > 0) break; await sleep(500); }
console.log('dest TRAVC filtered count:', dn);
const dAll = page.locator('li.place-suggestion');
const dnAll = await dAll.count().catch(()=>-1);
console.log('dest all count:', dnAll);
for (let i=0;i<Math.min(dnAll,8);i++) console.log('  dest row', i, JSON.stringify((await dAll.nth(i).innerText().catch(()=>'')).replace(/\n/g,' ').slice(0,80)));
await dItems.first().click({ timeout: 6000 }).catch(e => console.log('dest click err', String(e).slice(0,100)));
await sleep(1500);
const dConf = await dest.inputValue().catch(() => 'NO-VALUE');
console.log('dest inputValue:', JSON.stringify(dConf));
await page.screenshot({ path: '../evidence/diag-cma-v6b.png' }).catch(()=>{});
await ctx.close().catch(()=>{}); process.exit(0);

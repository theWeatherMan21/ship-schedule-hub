// 复刻配方 pickRow 全流程（含 Escape），逐步打印目的港失败点
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const H = { sleep: (ms) => sleep(ms) };

const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);

const pickRow = async (field, word, locode, label, hiddenId) => {
  console.log(`--- pickRow ${label}: click`);
  await field.click({ timeout: 8000 }).catch(e => console.log('  click err', String(e).slice(0,60)));
  await H.sleep(500);
  console.log('  active:', await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
  console.log(`  typing "${word}"`);
  await page.keyboard.type(String(word), { delay: 80 });
  await H.sleep(2500);
  const items = page.locator('li.place-suggestion').filter({ hasText: new RegExp(`\\(${locode}\\)`, 'i') });
  let n = 0;
  for (let i = 0; i < 20; i++) { n = await items.count().catch(() => 0); if (n > 0) break; await H.sleep(500); }
  console.log(`  filtered rows(${locode}):`, n);
  console.log('  all place-suggestion:', await page.locator('li.place-suggestion').count().catch(()=>-1));
  if (!n) return false;
  let row = items.filter({ hasText: /port/i }).first();
  if (!(await row.count().catch(() => 0))) row = items.first();
  await row.click({ timeout: 6000 }).catch(e => console.log('  row click err', String(e).slice(0,60)));
  await H.sleep(1500);
  await page.keyboard.press('Escape').catch(() => {});
  console.log('  after Escape, active:', await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
  const conf = await page.evaluate((hid) => {
    const ids = [hid, 'AutoCompletePOL', 'AutoCompletePOD'];
    for (const id of ids) { const el = document.getElementById(id); if (el?.value) return el.value; }
    return '';
  }, hiddenId).catch(() => '');
  console.log(`  conf(${hiddenId}):`, JSON.stringify(conf));
  const ok = new RegExp(`;\\s*${locode}`, 'i').test(conf) || new RegExp(`\\b${locode}\\b`, 'i').test(conf);
  console.log(`  ok=${ok}`);
  return ok;
};

const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.waitFor({ state: 'visible', timeout: 20000 });
const okO = await pickRow(box, 'ningbo', 'CNNGB', '起运', 'RoutingFinderViewModel_DeparturePlaceCode');
if (!okO) await pickRow(box, 'ningbo', 'CNNGB', '起运-retry', 'RoutingFinderViewModel_DeparturePlaceCode');
let dest = page.getByRole('group', { name: /^destination$/i }).getByRole('combobox').first();
const dcount = await dest.count().catch(() => 0);
console.log('dest group combobox count:', dcount);
if (!dcount) dest = page.getByRole('combobox', { name: /port, city, country name or code/i }).nth(1);
const okD = await pickRow(dest, 'istanbul', 'TRAVC', '目的', 'RoutingFinderViewModel_ArrivalPlaceCode');
if (!okD) { console.log('RETRY'); await pickRow(dest, 'istanbul', 'TRAVC', '目的-retry', 'RoutingFinderViewModel_ArrivalPlaceCode'); }
const vals = await page.evaluate(() => ({ POL: document.getElementById('AutoCompletePOL')?.value, POD: document.getElementById('AutoCompletePOD')?.value }));
console.log('FINAL:', JSON.stringify(vals));
await ctx.close().catch(()=>{}); process.exit(0);

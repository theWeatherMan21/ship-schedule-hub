
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
const ctx = await chromium.launchPersistentContext('/tmp/qp-cma', { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 70000 });
await page.waitForTimeout(9000);
try { const b = page.locator('#onetrust-accept-btn-handler'); if (await b.count()) { await b.click({ timeout: 3000 }); await page.waitForTimeout(900); } } catch {}
const inputs = page.locator('input[placeholder*="rigin"], input[placeholder*="estination"], input[role="combobox"]');
const n = await inputs.count();
const phs = [];
for (let i = 0; i < n; i++) phs.push((await inputs.nth(i).getAttribute('placeholder')) || '');
console.log('  输入框(' + n + '):', JSON.stringify(phs.slice(0, 8)));
const fillOne = async (idx, word) => {
  const inp = inputs.nth(idx);
  await inp.click({ timeout: 8000 }).catch(()=>{});
  await inp.fill('').catch(()=>{});
  await inp.type(word, { delay: 120 }).catch(()=>{});
  await page.waitForTimeout(5000);
  const cands = await page.evaluate(() => [...document.querySelectorAll('li, [role=option], [class*=suggestion], [class*=autocomplete] li')].filter((e) => e.offsetParent).map((e) => (e.innerText||'').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0, 5));
  return cands;
};
console.log('  起运候选(shanghai):', JSON.stringify(await fillOne(0, 'shanghai')));
console.log('  目的候选(ashdod):', JSON.stringify(await fillOne(1, 'ashdod')));
const state = await page.evaluate(() => ({
  fields: [...document.querySelectorAll('input')].filter((i) => i.offsetParent).map((i) => ({ ph: i.placeholder || '', v: (i.value || '').slice(0, 34) })).filter((x) => x.v),
  searchBtns: [...document.querySelectorAll('button')].filter((b) => b.offsetParent && /search/i.test(b.innerText || '')).map((b) => ({ t: (b.innerText||'').trim().slice(0,18), cls: (b.className||'').toString().slice(0,36), dis: b.disabled })),
}));
console.log('  字段值:', JSON.stringify(state.fields).slice(0, 400));
console.log('  Search 按钮:', JSON.stringify(state.searchBtns).slice(0, 300));
await ctx.close(); process.exit(0);

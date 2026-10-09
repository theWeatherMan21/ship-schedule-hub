
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
const ctx = await chromium.launchPersistentContext('/tmp/mk-probe-profile', { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, viewport: { width: 1440, height: 900 }, args: ['--disable-blink-features=AutomationControlled'], ignoreDefaultArgs: ['--enable-automation'] });
const page = await ctx.newPage();
await page.goto('https://www.maersk.com/schedules/pointToPoint', { waitUntil: 'domcontentloaded', timeout: 70000 });
await page.waitForTimeout(9000);
const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
console.log('  表单可见:', await from.waitFor({ state: 'visible', timeout: 25000 }).then(()=>true).catch(()=>false));
for (const word of ['tianjin', 'xingang']) {
  await from.click({ timeout: 8000 }).catch(()=>{});
  await from.fill('').catch(()=>{});
  await from.type(word, { delay: 90 }).catch(()=>{});
  await page.waitForTimeout(5500);
  const cands = page.getByRole('option', { name: /.+/ });
  const n = await cands.count().catch(()=>0);
  const out = [];
  for (let k = 0; k < Math.min(n, 8); k++) { let s=''; try { s = await cands.nth(k).ariaSnapshot(); } catch {} out.push((s||'').replace(/\s+/g,' ').slice(0,70)); }
  console.log('  「' + word + '」候选数=' + n + ':', JSON.stringify(out));
}
await ctx.close(); process.exit(0);

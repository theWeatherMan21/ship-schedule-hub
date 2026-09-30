import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(6000); await dismissCookies(page); await sleep(1000);
await page.getByRole('tab', { name: /^schedules$/i }).first().click({ timeout: 8000 });
await sleep(2500);
const box = page.getByRole('combobox', { name: /^origin$/i }).first();
await box.click({ timeout: 5000 }); await sleep(1000);
const html = await page.evaluate(() => {
  const el = document.querySelector('[role="combobox"][aria-label="Origin"]') || Array.from(document.querySelectorAll('[role="combobox"]')).find(e => /origin/i.test(e.getAttribute('aria-label')||''));
  return el ? el.outerHTML.slice(0, 2000) : 'NOT FOUND';
});
console.log(html);
const active = await page.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}.${document.activeElement?.className} ph=${document.activeElement?.placeholder}`);
console.log('active element:', active);
await ctx.close().catch(()=>{}); process.exit(0);

import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(6000); await dismissCookies(page); await sleep(1000);
await page.getByRole('tab', { name: /^schedules$/i }).first().click({ timeout: 8000 });
await sleep(2500);
const info = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('[role="combobox"]'));
  return els.map(e => ({ label: e.getAttribute('aria-label') || (e.innerText||'').slice(0,30), cls: String(e.className).slice(0,80), id: e.id, html: e.outerHTML.slice(0,300) }));
});
console.log(JSON.stringify(info, null, 1).slice(0, 3000));
await ctx.close().catch(()=>{}); process.exit(0);

import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(6000); await dismissCookies(page); await sleep(1000);
await page.getByRole('tab', { name: /^schedules$/i }).first().click({ timeout: 8000 });
await sleep(2500);
// 找 Origin combobox 的真实 DOM（aria role 由哪来）
const dom = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('*')).filter(e => {
    const r = e.getAttribute && e.getAttribute('role');
    return r === 'combobox';
  });
  return els.map(e => ({ tag: e.tagName, cls: String(e.className).slice(0,100), label: e.getAttribute('aria-label'), html: e.outerHTML.slice(0, 500) }));
});
console.log(JSON.stringify(dom, null, 1).slice(0, 4000));
await ctx.close().catch(()=>{}); process.exit(0);

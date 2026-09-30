// Evergreen 诊断：shipmentlink.com 首页 Origin/Destination 表单
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({});
const page = await ctx.newPage();
await page.goto('https://www.shipmentlink.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);
await dismissCookies(page);
await sleep(1000);

const snap = await page.locator('body').ariaSnapshot().catch(() => 'FAIL');
fs.writeFileSync('qa/aria-evergreen-live.txt', snap);
console.log(snap.split('\n').filter(l => /textbox|combobox|button|listitem/i.test(l)).slice(0, 30).join('\n'));

const origin = page.getByRole('textbox', { name: /^origin$/i }).first();
if (await origin.isVisible().catch(() => false)) {
  await origin.click(); await origin.fill(''); await origin.type('Ningbo', { delay: 70 });
  await sleep(3000);
  // 全面扫可见候选
  const dump = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('li, [role="option"], [class*="autocomplete"] *, [class*="suggestion"] *, [class*="dropdown"] li').forEach((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && st.display !== 'none') {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 100 && /ningbo/i.test(t)) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 50), t });
      }
    });
    return out.slice(0, 10);
  });
  console.log('Ningbo 相关可见节点:', JSON.stringify(dump, null, 1));
}
await ctx.close().catch(() => {});
process.exit(0);

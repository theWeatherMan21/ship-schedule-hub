
// 抓 ZIM Schedules tab 表单的真实结构（谁是谁、怎么定位）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const { ctx, mode } = await launchHeadedQuiet();
console.log('模式:', mode);
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(4000);
await H.dismissCookies(page); await sleep(1500);  // 本次故意不清遮罩：验证是不是被自己删了
const tab = page.getByRole('tab', { name: /^schedules$/i }).first();
for (let i = 0; i < 10; i++) { if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) { await tab.click({ timeout: 5000 }).catch(() => {}); break; } await sleep(2000); }
await sleep(3000);
await sleep(1000);
const info = await page.evaluate(() => {
  const out = { url: location.href, inputs: [], comboboxes: [], buttons: [], overlays: [] };
  for (const el of document.querySelectorAll('input, [role="combobox"], select')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out.inputs.push({
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', type: el.getAttribute('type') || '',
      id: el.id || '', name: el.getAttribute('name') || '', ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '', title: el.getAttribute('title') || '',
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      labelledBy: (el.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean).map((i2) => (document.getElementById(i2)?.textContent || '').trim()).join('|'),
      nearText: (el.closest('div,fieldset,form')?.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
    });
  }
  for (const b of document.querySelectorAll('button, [role="button"], a[class*="search"]')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0) continue;
    out.buttons.push({ text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), aria: b.getAttribute('aria-label') || '', disabled: !!b.disabled, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
  }
  // 谁盖在最上层（视口中心）
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const top = document.elementFromPoint(cx, cy);
  out.overlays.push({ topEl: top ? (top.tagName + '.' + (top.className || '').toString().slice(0, 60)) : 'none' });
  return out;
});
console.log(JSON.stringify(info, null, 1).slice(0, 3600));
await ctx.close().catch(() => {});

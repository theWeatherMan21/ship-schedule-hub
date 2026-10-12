// MSC 追踪表单微观诊断（为什么 fill 超时）
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.msc.com/en/track-a-shipment', { waitUntil: 'domcontentloaded', timeout: 50000 });
await sleep(6000);

const d = await page.evaluate(() => {
  const el = document.getElementById('trackingNumber');
  const r = el ? el.getBoundingClientRect() : null;
  const cs = el ? getComputedStyle(el) : null;
  const at = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
  const form = el ? el.closest('form') : null;
  return {
    exists: !!el,
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    disabled: el ? el.disabled : null, readOnly: el ? el.readOnly : null,
    vis: cs ? { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pe: cs.pointerEvents } : null,
    outer: el ? el.outerHTML.slice(0, 300) : null,
    atPoint: at ? (at.tagName + '#' + (at.id || '') + '.' + (at.className || '').toString().slice(0, 40)) : null,
    formHtml: form ? form.outerHTML.replace(/\s+/g, ' ').slice(0, 1200) : null,
    frames: [...document.querySelectorAll('iframe')].map((f) => (f.src || '').slice(0, 80)),
    shadowHosts: [...document.querySelectorAll('*')].filter((e) => e.shadowRoot).map((e) => e.tagName + '.' + (e.className || '').toString().slice(0, 40)).slice(0, 10),
  };
});
console.log('MAIN FRAME:', JSON.stringify(d, null, 1).slice(0, 2200));

for (const [i, f] of page.frames().entries()) {
  console.log(`frame[${i}] ${f.url().slice(0, 100)}`);
  if (i === 0) continue;
  const has = await f.evaluate(() => !!document.getElementById('trackingNumber')).catch(() => false);
  console.log('   has trackingNumber:', has);
}

console.log('locator count #trackingNumber =', await page.locator('#trackingNumber').count());
console.log('locator count input[type=text] =', await page.locator('input[type=text]').count());
console.log('locator count :visible text    =', await page.locator('input[type=text]:visible').count());
// 逐条试 index
for (let i = 0; i < await page.locator('input[type=text]').count(); i++) {
  const L = page.locator('input[type=text]').nth(i);
  console.log(`  nth(${i}) visible=${await L.isVisible().catch(() => '?')} id=${await L.getAttribute('id').catch(() => '?')} ph=${(await L.getAttribute('placeholder').catch(() => '') || '').slice(0, 40)}`);
}
await ctx.close().catch(() => {});
process.exit(0);

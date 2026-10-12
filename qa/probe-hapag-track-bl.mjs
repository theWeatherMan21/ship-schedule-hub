// Hapag 追踪：定位 B/L 字段 → 填真单号 → 提交 → dump 结果
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const BL = process.env.BL || 'HLCU2B9E986E7C5E';
const BOOKING = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html';

const ctx = await launch({ headless: false });
await quietWindow(ctx, 'minimized');
const page = ctx.pages()[0] || (await ctx.newPage());

async function open(u) {
  for (let i = 0; i < 4; i++) {
    try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { console.log('goto err ' + String(e).slice(0, 70)); }
    for (let j = 0; j < 12; j++) {
      await sleep(2500);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => 0);
      if (!(await isBlockPage(page).catch(() => true)) && len > 200) { await sleep(3000); return true; }
    }
    console.log('  过盾重试 ' + (i + 1));
  }
  return false;
}

console.log('打开 booking: ' + await open(BOOKING));
const fields = await page.evaluate(() => {
  const vis = (e) => e.offsetParent !== null;
  const labelFor = (e) => {
    if (e.id) { const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (l) return l.innerText.replace(/\s+/g, ' ').trim().slice(0, 40); }
    let p = e.closest('div,td,tr,span');
    for (let i = 0; i < 4 && p; i++, p = p.parentElement) { const t = (p.innerText || '').replace(/\s+/g, ' ').trim(); if (t && t.length < 80) return t.slice(0, 50); }
    return '';
  };
  return [...document.querySelectorAll('form input')].filter(vis).map((e) => ({
    id: e.id, name: e.name, type: e.type, maxlength: e.maxLength, aria: e.getAttribute('aria-label') || '', ph: e.placeholder || '', label: labelFor(e), disabled: e.disabled,
  }));
});
console.log('可见字段:\n' + JSON.stringify(fields, null, 1));

const blField = fields.find((f) => /bill of lading|lading/i.test(f.label + ' ' + f.aria + ' ' + f.id));
console.log('B/L 字段 = ' + JSON.stringify(blField));
if (!blField) { await ctx.close(); process.exit(3); }

await page.fill('#' + blField.id.replace(/([:.])/g, '\\$1'), BL).then(() => console.log('已填 ' + BL)).catch(async (e) => {
  console.log('fill 失败 ' + String(e).slice(0, 60) + ' → 退 type');
  await page.locator(`input[id="${blField.id}"]`).fill(BL).catch((e2) => console.log('再失败 ' + String(e2).slice(0, 60)));
});
console.log('回读 = ' + await page.locator(`input[id="${blField.id}"]`).inputValue().catch(() => '?'));

await page.getByRole('button', { name: /^\s*find\s*$/i }).first().click({ timeout: 10000 }).catch((e) => console.log('点 Find 失败 ' + String(e).slice(0, 80)));
await sleep(15000);
console.log('URL ' + page.url().slice(0, 200));
console.log('title ' + await page.title().catch(() => '?'));
const body = await page.evaluate(() => (document.body.innerText || '').replace(/\n{2,}/g, '\n')).catch(() => '?');
console.log('==== BODY ====\n' + body.slice(0, 3500));
await ctx.close().catch(() => {});
process.exit(0);

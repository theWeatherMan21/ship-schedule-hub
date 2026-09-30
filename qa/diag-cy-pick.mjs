// 决定性探针：type → 等候选 → 读每个候选的多种文本来源 → 点 CY 那个 → 验证输入框值保留
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({});
await quietWindow(ctx, 'minimized');
const page = await ctx.newPage();
await page.goto('https://www.maersk.com/schedules/pointToPoint', { waitUntil: 'domcontentloaded', timeout: 45000 });
await dismissCookies(page);

const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
await from.waitFor({ state: 'visible', timeout: 20000 });
await from.click();
await from.type('Shanghai', { delay: 80 });
await sleep(2500);

const cands = page.getByRole('option', { name: /shanghai/i });
const n = await cands.count();
console.log('候选数:', n);
for (let i = 0; i < n; i++) {
  const el = cands.nth(i);
  const info = await el.evaluate((e) => {
    const txt = (e.textContent || '').trim().slice(0, 70);
    const aria = e.getAttribute('aria-label') || '';
    const inner = e.innerText?.trim().slice(0, 70) || '';
    // 找子元素里的所有文本节点
    const allText = Array.from(e.querySelectorAll('*')).map(c => (c.textContent || '').trim()).filter(Boolean).slice(0, 5);
    return { tag: e.tagName, txt: JSON.stringify(txt), aria: JSON.stringify(aria), inner: JSON.stringify(inner), allText };
  }).catch(e => ({ err: String(e).slice(0, 80) }));
  console.log(`[${i}]`, JSON.stringify(info));
}

// 点 CY 的那个（若没有 aria/文本可判，就点第 2 个 —— 诊断截图显示第2个是 CY）
let target = -1;
for (let i = 0; i < n; i++) {
  const aria = (await cands.nth(i).getAttribute('aria-label').catch(() => '')) || '';
  const tc = (await cands.nth(i).evaluate(e => e.textContent || '').catch(() => '')) || '';
  if (/\bCY\b/i.test(aria) || /\bCY\b/i.test(tc)) { target = i; break; }
}
if (target < 0 && n >= 2) target = 1; // 诊断截图：第2个是 Shanghai (Shanghai), China CY
console.log('点第', target, '个候选');
if (target >= 0) {
  await cands.nth(target).click();
  await sleep(1500);
  console.log('点击后输入框值:', JSON.stringify(await from.inputValue().catch(() => '<err>')));
  // 看表单区是否有 SD/CY 标识出现
  const badge = await page.evaluate(() => {
    const t = document.body.innerText;
    return { hasSD: /store door/i.test(t), hasCY: /container yard/i.test(t) };
  });
  console.log('表单区 SD/CY:', JSON.stringify(badge));
}

await page.screenshot({ path: 'evidence/diag-cy-pick.png' });
await ctx.close().catch(() => {});
process.exit(0);

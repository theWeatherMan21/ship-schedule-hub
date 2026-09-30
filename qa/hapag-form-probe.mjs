// Hapag 有头表单探测：过 CF 后页面长什么样、表单在哪（婉宜 9-23）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();
const URL = 'https://www.hapag-lloyd.com/en/online-business/schedules/schedules-by-geography.html';
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

// 等 CF 过（最多 40s）
let ok = false;
for (let i = 0; i < 8; i++) {
  await sleep(5000);
  const st = await page.evaluate(() => ({
    t: document.title.slice(0, 60),
    len: document.body.innerText.length,
    ch: /just a moment|security check|checking your browser/i.test(document.body.innerText),
  })).catch(() => ({ t: '?', len: -1, ch: true }));
  console.log(`${(i + 1) * 5}s: "${st.t}" len=${st.len} 挑战=${st.ch}`);
  if (!st.ch && st.len > 1500) { ok = true; break; }
}
if (!ok) { console.log('❌ 未通过 CF'); await ctx.close(); process.exit(1); }
console.log('✅ CF 通过');

await sleep(3000);
console.log('URL:', page.url().slice(0, 100));

// dump 表单元素
const form = await page.evaluate(() => {
  const out = { inputs: [], buttons: [], links: [] };
  document.querySelectorAll('input, select, textarea').forEach((e) => {
    if (!e.offsetParent) return;
    out.inputs.push({
      tag: e.tagName, type: e.type || '', id: e.id || '',
      name: e.name || '', ph: e.placeholder || '',
      aria: e.getAttribute('aria-label') || '',
      cls: (e.className || '').toString().slice(0, 40),
    });
  });
  document.querySelectorAll('button, [role=button]').forEach((e) => {
    if (!e.offsetParent) return;
    const t = (e.innerText || '').trim().slice(0, 30);
    if (t) out.buttons.push({ txt: t, cls: (e.className || '').toString().slice(0, 40) });
  });
  document.querySelectorAll('a').forEach((e) => {
    if (!e.offsetParent) return;
    const t = (e.innerText || '').trim().slice(0, 40);
    if (/schedule|vessel|route|point|tariff/i.test(t)) out.links.push({ txt: t, href: (e.href || '').slice(0, 80) });
  });
  return out;
});
console.log('可见 inputs:', JSON.stringify(form.inputs.slice(0, 12), null, 1));
console.log('可见 buttons:', JSON.stringify(form.buttons.slice(0, 10)));
console.log('相关 links:', JSON.stringify(form.links.slice(0, 8), null, 1));
console.log('页面文本头 300:', (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n+/g, ' | '));

await ctx.close().catch(() => {});
process.exit(0);

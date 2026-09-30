// Hapag 有头导航探测：从主页找真正的 Schedules 入口 + 表单（婉宜 9-23）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();
await page.goto('https://www.hapag-lloyd.com/en/home.html', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

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
if (!ok) { console.log('❌ 未过 CF'); await ctx.close(); process.exit(1); }
console.log('✅ CF 通过, URL:', page.url().slice(0, 90));

// 找 Schedules 相关链接
const links = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('a').forEach((e) => {
    const t = (e.innerText || '').trim();
    if (/schedul|vessel|route finder|point to point|tariff/i.test(t + ' ' + e.href) && t.length < 50) {
      out.push({ txt: t.slice(0, 40), href: (e.href || '').slice(0, 100) });
    }
  });
  const seen = new Set();
  return out.filter((x) => { const k = x.href; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
});
console.log('Schedules 链接:');
links.forEach((l) => console.log(`  "${l.txt}" → ${l.href}`));

// 试进第一个船期页并 dump 表单
const target = links.find((l) => /schedule/i.test(l.href)) || links[0];
if (target) {
  console.log('\n进入:', target.href);
  await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(8000);
  const st2 = await page.evaluate(() => ({
    t: document.title.slice(0, 60), len: document.body.innerText.length,
    ch: /just a moment|security check/i.test(document.body.innerText),
  }));
  console.log('页面:', JSON.stringify(st2));
  const form = await page.evaluate(() => {
    const out = { inputs: [], buttons: [] };
    document.querySelectorAll('input, select').forEach((e) => {
      if (!e.offsetParent) return;
      out.inputs.push({ tag: e.tagName, type: e.type || '', id: e.id || '', name: e.name || '', ph: e.placeholder || '', aria: e.getAttribute('aria-label') || '' });
    });
    document.querySelectorAll('button').forEach((e) => {
      if (!e.offsetParent) return;
      const t = (e.innerText || '').trim().slice(0, 30);
      if (t) out.buttons.push(t);
    });
    return out;
  });
  console.log('inputs:', JSON.stringify(form.inputs.slice(0, 14)));
  console.log('buttons:', JSON.stringify(form.buttons.slice(0, 10)));
  console.log('文本头 250:', (await page.evaluate(() => document.body.innerText)).slice(0, 250).replace(/\n+/g, ' | '));
}
await ctx.close().catch(() => {});
process.exit(0);

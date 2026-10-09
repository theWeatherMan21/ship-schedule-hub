// ⚠️ 10-09 爹地红线：探针不得弹窗。需要真指纹破反爬时，请照 qa/headed-minimized-probe.mjs
//   那套做（headless:false + CDP Browser.setWindowBounds 最小化 + 回读 AXMinimized 验证）。
// HMM 诊断 2：输入 Ningbo 后的下拉 DOM 结构
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: true });
const page = await ctx.newPage();
await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);

const from = page.getByRole('textbox', { name: /input a location name/i }).first();
await from.waitFor({ state: 'visible', timeout: 10000 });
await from.click();
await from.type('Ningbo', { delay: 80 });
await sleep(3500);

const dump = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('li, [role="option"], [class*="autocomplete"] *, [class*="suggestion"] *, [class*="result"] *, ul > div, [class*="listbox"] *').forEach((el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden') {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && /ningbo|china|CNNGB/i.test(t) && t.length < 120 && !out.some(x => x.t === t)) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), t: t.slice(0, 90) });
    }
  });
  return out.slice(0, 10);
});
console.log('Ningbo 相关可见节点:', JSON.stringify(dump, null, 1));

// XHR：location 搜索请求
const xhr = [];
page.on('response', async (r) => {
  try { const u = r.url(); if (/location|port|autocomplete|search/i.test(u) && !/\.(js|css|png|jpg)/.test(u)) { const b = await r.text().catch(() => ''); xhr.push({ m: r.request().method(), u: u.slice(0, 120), len: b.length, head: b.slice(0, 200) }); } } catch {}
});
// 再敲一个字符触发
await from.type('a', { delay: 80 });
await sleep(2500);
console.log('XHR:', JSON.stringify(xhr, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

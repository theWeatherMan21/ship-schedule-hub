// COSCO 诊断 3：Origin City 输入后下拉结构（ariaSnapshot 采不到时的 DOM 层排查）
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({});
const page = await ctx.newPage();
await page.goto('https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(4000);
await dismissCookies(page);
await sleep(1000);

const origin = page.getByRole('textbox', { name: /origin city/i }).first();
await origin.waitFor({ state: 'visible', timeout: 10000 });
await origin.click();
await origin.type('Ningbo', { delay: 70 });
await sleep(3000);

// 全面 DOM 扫描：所有可见的 li / option / autocomplete 节点
const dump = await page.evaluate(() => {
  const out = [];
  const sels = ['li', '[role="option"]', '[class*="autocomplete"]', '[class*="dropdown"]', '[class*="suggestion"]', '[class*="select"] li', '.el-select-dropdown__item'];
  for (const s of sels) {
    document.querySelectorAll(s).forEach((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden') {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 120 && !out.some(x => x.t === t)) out.push({ sel: s, t, tag: el.tagName, cls: String(el.className).slice(0, 60) });
      }
    });
  }
  return out.slice(0, 40);
});
dump.forEach(d => console.log(d.sel, '|', d.tag, '|', d.cls, '|', d.t.slice(0, 80)));
fs.writeFileSync('qa/cosco-dom-dump.json', JSON.stringify(dump, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

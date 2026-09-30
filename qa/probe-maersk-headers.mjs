// 探针：抓 Maersk 页面 geography 请求的【请求头】（找出让接口 200 的关键头）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launch, openPage, sleep } from '../engine/browser.mjs';

const ctx = await launch({});
try {
  const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
  await sleep(8000);

  await page.evaluate(() => {
    window.__hdr = [];
    const h2o = (h) => {
      if (!h) return {};
      if (h instanceof Headers) { const o = {}; h.forEach((v, k) => (o[k] = v)); return o; }
      if (Array.isArray(h)) return Object.fromEntries(h);
      return { ...h };
    };
    const of = window.fetch;
    window.fetch = async (...a) => {
      const url = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || '';
      if (/geography|routing|locations/i.test(url)) window.__hdr.push({ url: String(url).slice(0, 160), headers: h2o(a[1] && a[1].headers) });
      return of(...a);
    };
    const oo = XMLHttpRequest.prototype.open;
    const os = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      this.__h = this.__h || {};
      this.__h[k] = v;
      return os.apply(this, arguments);
    };
    XMLHttpRequest.prototype.open = function (m, u) {
      if (/geography|routing/i.test(String(u))) window.__hdr.push({ url: String(u).slice(0, 160), headers: this.__h || {} });
      return oo.apply(this, arguments);
    };
  });

  const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
  await from.click({ timeout: 8000 }).catch(() => {});
  await from.type(' ningbo', { delay: 120 }).catch(() => {});
  await sleep(2000);
  await page.keyboard.press('Backspace').catch(() => {});
  await sleep(3000);

  const hdrs = await page.evaluate(() => window.__hdr || []);
  console.log(`抓到 ${hdrs.length} 条请求头记录:`);
  for (const h of hdrs) {
    console.log(`\n  URL: ${h.url}`);
    console.log('  headers:', JSON.stringify(h.headers));
  }
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 200));
} finally {
  await ctx.close().catch(() => {});
}

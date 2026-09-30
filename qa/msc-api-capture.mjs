// 抓 MSC 船期查询的请求参数（独立无痕 context，不碰爹地的 browser-profile）
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--window-position=-32000,-32000'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
const page = await ctx.newPage();

let captured = null;
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('SearchSailingRoutes')) {
    captured = {
      url: u,
      method: req.method(),
      headers: Object.fromEntries(Object.entries(req.headers()).filter(([k]) =>
        ['content-type', 'accept', 'origin', 'referer', 'x-requested-with'].includes(k))),
      body: req.postData(),
    };
    console.log('✅ 抓到请求:', req.method(), u);
    console.log('headers:', JSON.stringify(captured.headers));
    console.log('body:', (captured.body || '').slice(0, 600));
  }
});

try {
  await page.goto('https://www.msc.com/en/search-a-schedule', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);
  const blocked = await page.evaluate(() => document.title).catch(() => '?');
  console.log('页面标题:', blocked);
  if (captured === null) {
    // 试着直接在页面上下文里 fetch（带站点 cookie），常见参数格式
    const r = await page.evaluate(async () => {
      const tryBody = (o) => JSON.stringify(o);
      const candidates = [
        { FromLocation: 'CNNGB', ToLocation: 'TRIST' },
        { portOfLoadId: null, portOfDischargeId: null, fromLocation: 'CNNGB', toLocation: 'TRIST' },
      ];
      const out = [];
      for (const b of candidates) {
        try {
          const resp = await fetch('/api/feature/tools/SearchSailingRoutes', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: tryBody(b),
          });
          const t = await resp.text();
          out.push({ sent: tryBody(b), status: resp.status, len: t.length, head: t.slice(0, 300) });
        } catch (e) { out.push({ sent: tryBody(b), err: String(e).slice(0, 100) }); }
      }
      return out;
    }).catch((e) => [{ err: String(e).slice(0, 200) }]);
    console.log('页面上下文 fetch 尝试:');
    r.forEach((x, i) => console.log(`  [${i}]`, JSON.stringify(x).slice(0, 400)));
    fs.writeFileSync('docs/msc-api-probe.json', JSON.stringify(r, null, 1));
  }
  if (captured) fs.writeFileSync('docs/msc-api-captured.json', JSON.stringify(captured, null, 1));
} finally {
  await browser.close().catch(() => {});
}
console.log('DONE');
process.exit(0);

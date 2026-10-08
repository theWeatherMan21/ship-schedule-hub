// 用真实浏览器打开各家船司的船期页，读它们自己发的 XHR/资源，找出「港口名录」类接口。
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
const TARGETS = [
  ['hapag', 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html'],
  ['one', 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule'],
  ['zim', 'https://www.zim.com/schedules'],
  ['cosco', 'https://elines.coscoshipping.com/ebusiness/schedules'],
  ['cma', 'https://www.cma-cgm.com/ebusiness/schedules'],
  ['hmm', 'https://www.hmm21.com/'],
  ['yangming', 'https://www.yangming.com/esolution/schedule/point_to_point_search?lang=en-us'],
  ['evergreen', 'https://www.shipmentlink.com/'],
];
const RX = /port|location|place|code|terminal|combo|autocomplete|suggest|search-?term/i;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1400, height: 900 } });
const report = {};
for (const [name, url] of TARGETS) {
  const page = await ctx.newPage();
  const urls = new Set();
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http') && RX.test(u) && !/\.(js|css|png|jpg|svg|woff2?)($|\?)/i.test(u)) urls.add(r.method() + ' ' + u.slice(0, 190)); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(9000);
  } catch (e) { /* 超时也继续看已收集的 */ }
  report[name] = [...urls].slice(0, 12);
  console.log(`── ${name}: ${report[name].length} 个候选`);
  for (const u of report[name]) console.log('   ' + u);
  await page.close();
}
await browser.close();

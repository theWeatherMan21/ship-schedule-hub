
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
const ctx = await chromium.launchPersistentContext('/tmp/qp-wy2', { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
for (const url of ['https://www.jctrans.com/', 'https://www.sofreight.com/', 'https://www.searates.com/schedule/']) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    const s = await page.evaluate(() => ({
      title: (document.title || '').slice(0, 46),
      inputs: [...document.querySelectorAll('input')].filter((i) => i.offsetParent).map((i) => (i.placeholder || '').slice(0, 18)).filter(Boolean).slice(0, 6),
      hasSchedule: /船期|schedule/i.test(document.body?.innerText || ''),
    }));
    console.log('  ' + url + '  ->  ' + s.title + ' | 输入框: ' + JSON.stringify(s.inputs) + ' | 有船期字样: ' + s.hasSchedule);
  } catch (e) { console.log('  ' + url + '  ->  失败 ' + String(e.message).slice(0, 50)); }
}
await ctx.close(); process.exit(0);

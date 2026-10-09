
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
const ctx = await chromium.launchPersistentContext('/tmp/qp-hmm2', { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const resp = [];
page.on('response', (r) => { if (r.status() >= 400) resp.push(r.status() + ' ' + r.url().slice(0, 90)); });
await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'load', timeout: 60000 }).catch((e) => console.log('  goto 报错:', String(e.message).slice(0, 60)));
for (const w of [5, 10, 15, 20]) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => ({ len: (document.body?.innerText || '').length, has: !!document.querySelector('#srchPointFrom'), t: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 160) }));
  console.log('  +' + w + 's: len=' + s.len + ' 有字段=' + s.has + ' | ' + s.t);
  if (s.has) break;
}
console.log('  4xx/5xx 响应:', JSON.stringify(resp.slice(0, 5)));
await ctx.close(); process.exit(0);

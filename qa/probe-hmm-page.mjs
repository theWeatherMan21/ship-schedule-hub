
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
// 找我们打包的 Chromium
const base = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub';
let exe = '';
for (const root of [process.env.HOME + '/Library/Caches/ms-playwright', '/Applications']) {
  try {
    for (const d of readdirSync(root)) {
      if (d.startsWith('chromium') || d.includes('Chrome')) { exe = root + '/' + d; break; }
    }
  } catch {}
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
try {
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    hasFrom: !!document.querySelector('#srchPointFrom'),
    inputs: [...document.querySelectorAll('input,select')].slice(0, 25).map((e) => (e.id || e.name || e.className || '?') + ':' + (e.type || e.tagName)),
    textHead: (document.body.innerText || '').slice(0, 300).replace(/\n+/g, ' | '),
  }));
  console.log(JSON.stringify(info, null, 1));
} catch (e) { console.log('ERR', String(e).slice(0, 200)); }
await browser.close();

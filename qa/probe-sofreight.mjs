
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
const ctx = await chromium.launchPersistentContext('/tmp/qp-sf', { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.goto('https://www.sofreight.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(7000);
const links = await page.evaluate(() => [...document.querySelectorAll('a')]
  .filter((a) => a.offsetParent && /船期|schedule/i.test(a.innerText || ''))
  .map((a) => ({ t: (a.innerText || '').trim().slice(0, 16), href: a.href })).slice(0, 8));
console.log('  船期相关链接:', JSON.stringify(links).slice(0, 600));
for (const l of links.slice(0, 3)) {
  if (!l.href || l.href.includes('javascript')) continue;
  try {
    await page.goto(l.href, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => ({
      url: location.href.slice(0, 100),
      title: (document.title || '').slice(0, 40),
      inputs: [...document.querySelectorAll('input')].filter((i) => i.offsetParent).map((i) => (i.placeholder || '').slice(0, 20)).filter(Boolean).slice(0, 8),
    }));
    console.log('  → ' + l.t + ': ' + s.url + ' | ' + s.title + ' | 输入框 ' + JSON.stringify(s.inputs));
  } catch (e) { console.log('  → ' + l.t + ' 打不开: ' + String(e.message).slice(0, 40)); }
}
await ctx.close(); process.exit(0);

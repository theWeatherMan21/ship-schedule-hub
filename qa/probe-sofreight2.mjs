
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
const ctx = await chromium.launchPersistentContext('/tmp/qp-sf2', { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();
await page.goto('https://www.sofreight.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(8000);
const all = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => a.offsetParent && a.href && !a.href.includes('javascript')).map((a) => ((a.innerText || '').trim().slice(0, 14) + ' :: ' + a.href.replace('https://www.sofreight.com', ''))).slice(0, 60));
console.log('  可见链接（前 40）:');
for (const l of all.slice(0, 40)) if (!/^\s*:: /.test(l)) console.log('    ' + l);
await ctx.close(); process.exit(0);

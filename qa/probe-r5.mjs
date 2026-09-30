// Round 5: find real schedule pages for Yang Ming & ZIM from homepage HTML
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const TARGETS = [
  ['yangming-links', 'https://www.yangming.com/'],
  ['zim-links', 'https://www.zim.com/'],
];
const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
  userAgent: UA,
});
try {
  for (const [key, url] of TARGETS) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const links = await page.evaluate(() => {
        const out = [];
        for (const a of document.querySelectorAll('a[href]')) {
          const text = (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
          const href = a.href;
          if (/schedul|e-service|eservice|ocean|route|sailing|freight/i.test(text + ' ' + href)) {
            out.push(text.slice(0, 50) + ' => ' + href.slice(0, 140));
          }
        }
        return [...new Set(out)].slice(0, 30);
      });
      fs.writeFileSync(`qa/links-${key}.txt`, links.join('\n'));
      console.log(JSON.stringify({ key, n: links.length }));
      links.forEach(l => console.log('  ' + l));
    } catch (e) {
      console.log(JSON.stringify({ key, error: String(e).slice(0, 140) }));
    }
    await page.close();
    await new Promise(r => setTimeout(r, 3000));
  }
} finally { await ctx.close(); }

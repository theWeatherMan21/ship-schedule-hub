// ARIA snapshot probe — pierces shadow DOM, best for custom-component pages
// Usage: node qa/probe3.mjs <url> [out.txt]
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const url = process.argv[2];
const outPath = process.argv[3];
if (!url) { console.error('usage: node probe3.mjs <url> [out.txt]'); process.exit(2); }

const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1440, height: 1000 },
});
try {
  const page = await ctx.newPage();
  const resp = await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const snap = await page.locator('body').ariaSnapshot();
  console.log('===', resp?.status(), page.url());
  console.log(snap.slice(0, 6000));
  if (outPath) fs.writeFileSync(outPath, snap);
  await page.close();
} finally { await ctx.close(); }

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

const tpl = fs.readFileSync('/Users/russospencer/.hermes/cache/scratch/glass-draft-template.html', 'utf8');
const data = JSON.parse(fs.readFileSync('/Users/russospencer/.hermes/cache/scratch/mock-data.json', 'utf8'));
const html = tpl.replace('/*__DATA__*/[]', JSON.stringify(data));

const OUT = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/docs/design';
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'glass-3-variants.html');
fs.writeFileSync(file, html);
console.log('设计稿:', file, (html.length / 1024).toFixed(0) + 'KB');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('file://' + file, { waitUntil: 'load' });
await page.waitForTimeout(400);

const shots = [];
async function shot(name) {
  const p = path.join(OUT, `variant-${name}.png`);
  await page.screenshot({ path: p });
  shots.push(p);
}
await shot('A');
for (const v of ['B', 'C']) {
  await page.click(`#segVariant button[data-v="${v}"]`);
  await page.waitForTimeout(600);
  await shot(v);
}
// 回 A，测交互：点第二张卡片展开 + 点第一条船期行
await page.click('#segVariant button[data-v="A"]');
await page.waitForTimeout(400);
await page.click('#cards .card[data-i="1"] .crow');
await page.waitForTimeout(350);
await page.click('#cards .card[data-i="0"] .trow-wrap .trow');
await page.waitForTimeout(350);
const state = await page.evaluate(() => ({
  cards: document.querySelectorAll('.card').length,
  openCards: document.querySelectorAll('.card.open').length,
  openRows: document.querySelectorAll('.trow-wrap.open').length,
  badge: document.querySelector('#cards .badge')?.textContent.trim(),
  pill: document.querySelector('#sumPill')?.textContent.trim(),
  days: [...document.querySelectorAll('#cards .card[data-i="0"] .trow')].slice(0, 3).map((r) => r.children[3].textContent.trim()),
}));
await shot('A-interaction');
console.log('交互断言:', JSON.stringify(state));
console.log('页面错误:', errs.length ? errs.slice(0, 5) : '0');
console.log('截图:', shots.join(' | '));
await browser.close();

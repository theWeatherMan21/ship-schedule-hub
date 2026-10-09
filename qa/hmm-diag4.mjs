// ⚠️ 10-09 爹地红线：探针不得弹窗。需要真指纹破反爬时，请照 qa/headed-minimized-probe.mjs
//   那套做（headless:false + CDP Browser.setWindowBounds 最小化 + 回读 AXMinimized 验证）。
// HMM 诊断 4：POST 结果页（ScheduleMainPost.do）文本 + 可能的懒加载
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: true });
const page = await ctx.newPage();
await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);

async function pick(word, nth) {
  const f = page.getByRole('textbox', { name: /input a location name/i }).nth(nth);
  await f.click(); await f.fill(''); await f.type(word, { delay: 80 });
  await sleep(3000);
  const items = page.locator('ul:not([class]) li, ul[class=""] li');
  const n = await items.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    if (await it.isVisible().catch(() => false)) {
      let t = ''; try { t = await it.textContent(); } catch {}
      t = t.replace(/\s+/g, ' ').trim();
      if (t.toUpperCase().startsWith(word.toUpperCase())) { await it.click({ timeout: 3000 }); await sleep(1000); return t; }
    }
  }
  return null;
}

await pick('Ningbo', 0);
await pick('Istanbul', 1);
await page.locator('input[type="date"]').first().fill('2026-09-28');

await page.getByRole('button', { name: /^search$/i }).first().click();
// 等待导航到 ScheduleMainPost.do 并渲染
await page.waitForURL(/ScheduleMainPost/, { timeout: 30000 }).catch(() => console.log('URL 未变'));
await sleep(10000);
console.log('URL:', page.url());
const t = await page.evaluate(() => document.body.innerText);
console.log('文本长度:', t.length);
fs.writeFileSync('qa/hmm-post.txt', t);
const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
lines.slice(0, 70).forEach(l => console.log('  ', l.slice(0, 150)));
await page.screenshot({ path: 'evidence/m4-hmm-post.png' });
await ctx.close().catch(() => {});
process.exit(0);

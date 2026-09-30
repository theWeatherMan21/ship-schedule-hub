// HMM 诊断 3：Search 后等更久 + 监听新 tab（结果页可能是 POST 新窗口）
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();
await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);
await dismissCookies(page).catch(() => {});

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
      if (t.toUpperCase().startsWith(word.toUpperCase())) { await it.click({ timeout: 3000 }); console.log(`${word} → ${t.slice(0, 60)}`); await sleep(1000); return true; }
    }
  }
  console.log(`${word}: 无候选（n=${n}）`); return false;
}

await pick('Ningbo', 0);
await pick('Istanbul', 1);

// 日期
const date = page.locator('input[type="date"]').first();
if (await date.isVisible().catch(() => false)) {
  await date.fill('2026-09-28');
  console.log('日期:', await date.inputValue());
} else {
  // aria 是 textbox: 2026-09-21
  const dt = page.getByRole('textbox').filter({ hasText: /2026/ }).first();
  console.log('date alt visible:', await dt.isVisible().catch(() => false));
}

// 监听新页面
ctx.on('page', async (p) => {
  console.log('>> 新 tab 打开:', p.url());
  await sleep(8000);
  const t = await p.evaluate(() => document.body.innerText).catch(() => '');
  console.log('新 tab 文本长度:', t.length);
  fs.writeFileSync('qa/hmm-newtab.txt', t);
  const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
  lines.slice(0, 60).forEach(l => console.log('  ', l.slice(0, 140)));
});

await page.getByRole('button', { name: /^search$/i }).first().click();
console.log('已点 Search，等 25s…');
await sleep(25000);

// 当前页也再读一次
const t = await page.evaluate(() => document.body.innerText);
console.log('当前页文本长度:', t.length, 'URL:', page.url());
if (t.length > 3000) {
  fs.writeFileSync('qa/hmm-result.txt', t);
  const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
  lines.slice(0, 50).forEach(l => console.log('  ', l.slice(0, 140)));
}
const pages = ctx.pages();
console.log('打开的页面数:', pages.length);
pages.forEach((p, i) => console.log(' ', i, p.url().slice(0, 100)));
await ctx.close().catch(() => {});
process.exit(0);

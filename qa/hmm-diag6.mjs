// HMM 诊断 6：目的港输入 Ambarli / Gebze / Marda / Izmit 找其它 Istanbul 系变体
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();
await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);

// 先选 Ningbo
const from = page.getByRole('textbox', { name: /input a location name/i }).nth(0);
await from.click(); await from.fill(''); await from.type('Ningbo', { delay: 80 });
await sleep(3000);
const items1 = page.locator('ul:not([class]) li, ul[class=""] li');
const n1 = await items1.count().catch(() => 0);
for (let i = 0; i < n1; i++) {
  const it = items1.nth(i);
  if (await it.isVisible().catch(() => false)) {
    let t = ''; try { t = await it.textContent(); } catch {}
    if (t && t.toUpperCase().startsWith('NINGBO')) { await it.click(); break; }
  }
}
console.log('Ningbo 已选');

const to = page.getByRole('textbox', { name: /input a location name/i }).nth(1);
const variants = {};
for (const word of ['Istanbul', 'Ambarli', 'Gebze', 'Izmit', 'Marda', 'Haydarpasa', 'Korfezi', 'Turkey']) {
  await to.click(); await to.fill(''); await to.type(word, { delay: 80 });
  await sleep(2800);
  const items = page.locator('ul:not([class]) li, ul[class=""] li');
  const n = await items.count().catch(() => 0);
  const found = [];
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    if (await it.isVisible().catch(() => false)) {
      let t = ''; try { t = await it.textContent(); } catch {}
      t = t.replace(/\s+/g, ' ').trim();
      if (t && t.length < 90 && !/^(COMPANY|IR |CONTACT|Schedule$|Track)/.test(t)) found.push(t);
    }
  }
  variants[word] = found;
  console.log(word, '→', JSON.stringify(found));
}
fs.writeFileSync('qa/hmm-dest-variants.json', JSON.stringify(variants, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

// 探针10：Maersk 纯词填表 + 抓船期 XHR/结果页（验证 geography 404 是否纯词也发生）（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge } from '../engine/lib/utils.mjs';

const [origin = 'Ningbo', destination = 'Ambarli'] = process.argv.slice(2);
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
  const page = opened.page;
  await sleep(3000);
  await dismissCookies(page);
  if (await isBlockPage(page)) await waitThroughChallenge(page, 12000);

  const xhrs = [];
  page.on('response', (r) => {
    const u = r.url();
    if (/geography|sail|schedule|route/i.test(u) && !/\.(png|jpg|css|js|woff|map)/.test(u) && !/optimizely|analytics/i.test(u)) {
      xhrs.push(`${r.status()} ${r.request().method()} ${u.slice(0, 180)}`);
    }
  });

  const pickWord = async (roleName, word, wantRe) => {
    const field = page.getByRole('combobox', { name: roleName }).first();
    await field.waitFor({ state: 'visible', timeout: 20000 });
    await field.click().catch(() => {});
    await field.fill('').catch(() => {});
    await field.type(word, { delay: 80 }).catch(() => {});
    // 等候选
    let picked = null;
    const cands = page.getByRole('option', { name: /.+/ });
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const n = await cands.count().catch(() => 0);
      if (n > 0) {
        const texts = [];
        for (let k = 0; k < Math.min(n, 10); k++) {
          let s = ''; try { s = await cands.nth(k).ariaSnapshot(); } catch {}
          texts.push((s || '').replace(/\s+/g, ' ').trim());
        }
        console.log(`  [${word}] 候选:`, JSON.stringify(texts.slice(0, 6)));
        let idx = wantRe ? texts.findIndex((t) => wantRe.test(t)) : -1;
        if (idx < 0) idx = 0;
        try { await cands.nth(idx).click(); picked = texts[idx]; } catch {}
        break;
      }
    }
    return picked;
  };

  console.log('== origin:', await pickWord(/from \(city/i, origin, /ningbo|china/i));
  await sleep(800);
  console.log('== dest:', await pickWord(/to \(city/i, destination, /ambarli|turkey|cy/i));
  await sleep(800);
  // 回读
  const vals = await page.evaluate(() => [...document.querySelectorAll('input')].filter((i) => i.value && i.type === 'text').map((i) => i.value.slice(0, 50)));
  console.log('INPUT VALUES:', JSON.stringify(vals));
  // 日期填今天+7
  const d = new Date(Date.now() + 7 * 864e5);
  const ds = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const date = page.locator('input[placeholder="DD/MM/YYYY"]').first();
  if (await date.isVisible().catch(() => false)) { await date.click().catch(() => {}); await date.fill('').catch(() => {}); await date.type(ds, { delay: 60 }).catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); }
  // Search
  await page.getByRole('button', { name: /^\s*search\s*$/i }).first().click().catch(() => {});
  console.log('clicked search');
  let text = '';
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/vessel\/voyage|transit time|no schedules/i.test(text)) break;
  }
  console.log('XHRS:', JSON.stringify(xhrs.slice(-12), null, 0));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync(`qa/probe-out/maersk2-${destination.toLowerCase()}.txt`, `URL: ${page.url()}\n\n${text}`);
  console.log('text len:', text.length, 'has Vessel/Voyage:', /vessel\/voyage/i.test(text));
  await shot(page, `probe-maersk2-${destination.toLowerCase()}`);
} catch (e) {
  console.error('FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 500));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);

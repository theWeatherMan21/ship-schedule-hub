
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const pick = async (sel, word, want) => {
  const box = page.locator(sel).first();
  await box.click({ timeout: 8000 }).catch(() => {});
  await sleep(400);
  await box.fill('').catch(() => {});
  await page.keyboard.type(word, { delay: 90 });
  await sleep(3200);
  const opts = page.locator('li, .ac_results li, div[role="option"]');
  const n = await opts.count().catch(() => 0);
  for (let i = 0; i < Math.min(n, 15); i++) {
    const t = ((await opts.nth(i).textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (t && t.toUpperCase().includes(want)) {
      await opts.nth(i).click({ timeout: 5000 }).catch(() => {});
      console.log('PICK ' + JSON.stringify(t.slice(0, 60)));
      return true;
    }
  }
  console.log('PICK-MISS ' + word + ' want=' + want);
  return false;
};
try {
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  const ok1 = await pick('#srchPointFrom', 'Xingang', 'CNTXG');
  const ok2 = await pick('#srchPointTo', 'Ashdod', 'ASHDOD');
  console.log('FILLS ' + ok1 + '/' + ok2);
  const btn = page.locator('a:has-text("Search"), button:has-text("Search"), input[value*="Search"]').first();
  await btn.click({ timeout: 8000 }).catch((e) => console.log('BTN ' + String(e).slice(0, 80)));
  await sleep(9000);
  const txt = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
  const m = txt.match(/Search Results \((\d+)\)/i);
  console.log('RESULT ' + (m ? m[1] : '未捕获计数') + ' | ' + txt.slice(0, 180));
} catch (e) { console.log('ERR ' + String(e).slice(0, 150)); }
await ctx.close();

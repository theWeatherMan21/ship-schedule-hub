
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const ymd = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const one = async (fromWord, codeW, dateVal, tag) => {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3000);
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  const pick = async (sel, word, code) => {
    const inp = page.locator(sel);
    if (!(await inp.isVisible({ timeout: 8000 }).catch(() => false))) return false;
    await inp.click(); await sleep(300);
    await inp.type(word.toLowerCase(), { delay: 90 });
    for (let i = 0; i < 12; i++) {
      await sleep(900);
      const li = page.locator('li:has-text("[' + code + ']")').first();
      if (await li.isVisible({ timeout: 300 }).catch(() => false)) { await li.click({ timeout: 3000 }).catch(() => {}); await sleep(500); return true; }
    }
    return false;
  };
  const ok1 = await pick('#srchPointFrom', fromWord, codeW);
  const ok2 = await pick('#srchPointTo', 'ashdod', 'ILASH');
  if (dateVal) { await page.locator('#srchSailDate').fill(dateVal).catch(() => {}); await sleep(300); }
  console.log(tag + ' 填=' + ok1 + '/' + ok2 + ' 日期=' + (dateVal || '默认'));
  if (ok1 && ok2) {
    await page.locator('#btnRetrieve').click({ timeout: 8000 }).catch(() => {});
    await sleep(9000);
    const txt = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
    const m = txt.match(/Search Results \((\d+)\)/i);
    const cards = (txt.match(/days/gi) || []).length;
    console.log(tag + ' 结果=' + (m ? m[1] : '?') + ' 卡片线索=' + cards);
  }
};
try { await one('xingang', 'CNTXG', ymd(7), 'A[CNTXG+日期]'); } catch (e) { console.log('A ERR ' + String(e).slice(0, 100)); }
await ctx.close();

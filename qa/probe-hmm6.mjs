
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const doSearch = async (fromWord, toWord, tag) => {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  const pick = async (sel, word) => {
    const inp = page.locator(sel);
    if (!(await inp.isVisible({ timeout: 8000 }).catch(() => false))) { console.log(tag + ' 表单没出现'); return false; }
    await inp.click(); await sleep(300);
    await inp.type(word.toLowerCase(), { delay: 90 });   // ★ 照引擎：小写
    for (let i = 0; i < 12; i++) {
      await sleep(900);
      const li = page.locator('li:has-text("[' + (sel === '#srchPointFrom' ? 'CNTXG' : 'ILASH') + ']")').first();
      if (await li.isVisible({ timeout: 300 }).catch(() => false)) {
        const t = ((await li.textContent().catch(() => '')) || '').trim();
        await li.click({ timeout: 3000 }).catch(() => {}); await sleep(600);
        const code = await page.evaluate((id) => document.getElementById(id)?.value || '', sel === '#srchPointFrom' ? 'srchPointFrom_code' : 'srchPointTo_code');
        console.log(tag + ' PICKED ' + t.slice(0, 50) + ' code=' + code);
        return true;
      }
    }
    console.log(tag + ' 候选没出现(' + word + ')');
    return false;
  };
  const ok1 = await pick('#srchPointFrom', fromWord);
  const ok2 = await pick('#srchPointTo', toWord);
  if (!ok1 || !ok2) return;
  await page.locator('#btnRetrieve').click({ timeout: 8000 }).catch((e) => console.log(tag + ' 按钮 ' + String(e).slice(0, 60)));
  await sleep(9000);
  const txt = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
  const m = txt.match(/Search Results \((\d+)\)/i);
  console.log(tag + ' 结果=' + (m ? m[1] : '没捕获') + ' | ' + txt.slice(0, 140));
};
try { await doSearch('xingang', 'ashdod', 'A[CNTXG]'); } catch (e) { console.log('A ERR ' + String(e).slice(0, 120)); }
await ctx.close();

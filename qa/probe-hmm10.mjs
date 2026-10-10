
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2500);
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000);
  const has = await page.locator('#srchPointFrom').isVisible({ timeout: 3000 }).catch(() => false);
  console.log('FORM ' + has);
  if (has) {
    const box = page.locator('#srchPointFrom');
    await box.click();            // 成功那次的姿势：click → 直接键盘打
    await sleep(500);
    await page.keyboard.type('qingdao', { delay: 100 });
    await sleep(4000);
    const dump = await page.evaluate(() => {
      const out = { ul: [], ac: '' };
      document.querySelectorAll('ul li').forEach((e) => { const t = (e.innerText || '').replace(/\s+/g, ' ').trim(); if (t && t.length < 90) out.ul.push(t); });
      const ac = document.querySelector('.ac_results');
      out.ac = ac ? (ac.innerText || '').replace(/\s+/g, ' ').slice(0, 200) : '(no .ac_results)';
      return out;
    });
    console.log('QINGDAO-UL ' + JSON.stringify([...new Set(dump.ul)].slice(0, 10)));
    console.log('QINGDAO-AC ' + JSON.stringify(dump.ac));
    // 再等 4 秒看是否迟到
    await sleep(4000);
    const ul2 = await page.evaluate(() => [...new Set([...document.querySelectorAll('ul li')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 90))].slice(0, 10));
    console.log('QINGDAO-UL2 ' + JSON.stringify(ul2));
  }
} catch (e) { console.log('ERR ' + String(e).slice(0, 130)); }
await ctx.close();

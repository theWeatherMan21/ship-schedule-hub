
import { launch, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  // 先回首页，接受任何 cookie，再进船期页
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000); await H.dismissCookies(page).catch(() => {}); await sleep(1000);
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  for (let i = 0; i < 6; i++) {
    await sleep(3000);
    const st = await page.evaluate(() => ({
      hasFrom: !!document.querySelector('#srchPointFrom'),
      nInputs: document.querySelectorAll('input').length,
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 150),
    }));
    console.log('T' + i, JSON.stringify(st));
    if (st.hasFrom) break;
  }
  const fin = await page.evaluate(() => ({
    hasFrom: !!document.querySelector('#srchPointFrom'),
    ids: [...document.querySelectorAll('input,select')].map((e) => e.id).filter(Boolean).slice(0, 20),
  }));
  console.log('FINAL ' + JSON.stringify(fin));
  if (fin.hasFrom) {
    // 抄它的天津候选
    const box = page.locator('#srchPointFrom');
    await box.click(); await sleep(500);
    await page.keyboard.type('Tianjin', { delay: 100 }); await sleep(3500);
    const opts = await page.evaluate(() => [...document.querySelectorAll('li,div[role="option"],.ac_results li')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t && /tianjin|xingang|天津/i.test(t)).slice(0, 10));
    console.log('HMM-OPTS ' + JSON.stringify(opts));
  }
} catch (e) { console.log('ERR ' + String(e).slice(0, 150)); }
await ctx.close();

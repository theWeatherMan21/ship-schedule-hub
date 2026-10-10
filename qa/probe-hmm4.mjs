
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  for (let i = 0; i < 5; i++) {
    await sleep(3000);
    const st = await page.evaluate(() => ({ hasFrom: !!document.querySelector('#srchPointFrom'), text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120) }));
    console.log('T' + i + ' ' + JSON.stringify(st));
    if (st.hasFrom) break;
  }
  const has = await page.evaluate(() => !!document.querySelector('#srchPointFrom'));
  if (has) {
    const box = page.locator('#srchPointFrom');
    await box.click(); await sleep(500);
    await page.keyboard.type('Tianjin', { delay: 100 }); await sleep(4000);
    const opts = await page.evaluate(() => [...document.querySelectorAll('li,.ac_results li,div[role="option"],ul li')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t && /tianjin|xingang|天津/i.test(t)).slice(0, 12));
    console.log('HMM-OPTS ' + JSON.stringify(opts));
  }
  console.log('DONE hasFrom=' + has);
} catch (e) { console.log('ERR ' + String(e).slice(0, 150)); }
await ctx.close();


import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2500);
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  for (let i = 0; i < 8; i++) {
    await sleep(2500);
    const has = await page.locator('#srchPointFrom').isVisible({ timeout: 2000 }).catch(() => false);
    if (has) break;
  }
  const has = await page.locator('#srchPointFrom').isVisible({ timeout: 2000 }).catch(() => false);
  console.log('FORM ' + has);
  if (has) {
    const box = page.locator('#srchPointFrom');
    for (const w of ['qingdao', 'xiamen']) {
      await box.click().catch(() => {});
      await box.fill('').catch(() => {});
      await page.keyboard.type(w, { delay: 90 });
      await sleep(4000);
      const cands = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('li, .ac_results li, div[role="option"], ul li').forEach((e) => {
          const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
          if (t && t.length < 90) out.push(t);
        });
        return [...new Set(out)].slice(0, 12);
      });
      console.log('HMM-' + w + ' ' + JSON.stringify(cands));
    }
  }
} catch (e) { console.log('ERR ' + String(e).slice(0, 130)); }
await ctx.close();

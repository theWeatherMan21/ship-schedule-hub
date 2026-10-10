
import { launch, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

// ── A. 长荣：xiamen 候选
try {
  await page.goto('https://ss.shipmentlink.com/tvs2/jsp/TVS2_InteractiveSchedule.jsp', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000); await H.dismissCookies(page).catch(() => {});
  const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].slice(0, 14).map((e) => (e.id || e.name || '?') + '/' + (e.type || '')));
  console.log('EG-INPUTS ' + JSON.stringify(inputs));
  // 找起运港输入框：通常 id 含 From/Origin/port
  const box = page.locator('input[id*="From"], input[id*="Origin"], input[name*="From"], input[name*="Origin"], #srchPortFrom, input[type="text"]').first();
  await box.click({ timeout: 8000 }).catch(() => {});
  await page.keyboard.type('xiamen', { delay: 100 });
  await sleep(4000);
  const cands = await page.evaluate(() => [...document.querySelectorAll('li,div[role="option"],ul li,tr')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 90 && /xiamen|XIAMEN|CNX/i.test(t)).slice(0, 10));
  console.log('EG-XIAMEN ' + JSON.stringify(cands));
  await sleep(1000);
  const box2 = page.locator('input[id*="From"], input[id*="Origin"], input[name*="From"], input[name*="Origin"], #srchPortFrom, input[type="text"]').first();
  await box2.fill('').catch(() => {});
  await box2.click({ timeout: 6000 }).catch(() => {});
  await page.keyboard.type('Xiamen', { delay: 100 });
  await sleep(3500);
  const cands2 = await page.evaluate(() => [...document.querySelectorAll('li,div[role="option"],ul li,tr')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 90 && /xiamen|XIAMEN|CNX/i.test(t)).slice(0, 10));
  console.log('EG-XIAMEN2 ' + JSON.stringify(cands2));
} catch (e) { console.log('EG-ERR ' + String(e).slice(0, 130)); }

// ── B. HMM：qingdao / xiamen 候选
try {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2500);
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  const has = await page.locator('#srchPointFrom').isVisible({ timeout: 6000 }).catch(() => false);
  console.log('HMM-FORM ' + has);
  if (has) {
    const box = page.locator('#srchPointFrom');
    for (const w of ['qingdao', 'xiamen']) {
      await box.click().catch(() => {});
      await box.fill('').catch(() => {});
      await page.keyboard.type(w, { delay: 90 });
      await sleep(3500);
      const cands = await page.evaluate(() => [...document.querySelectorAll('li')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t && /\[CN/i.test(t)).slice(0, 8));
      console.log('HMM-' + w.toUpperCase() + ' ' + JSON.stringify(cands));
    }
  }
} catch (e) { console.log('HMM-ERR ' + String(e).slice(0, 130)); }
await ctx.close();

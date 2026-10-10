
// 双站侦察（无头静默）：阳明的关联想框里 Tianjin 的码 + HMM 首页现状
import { launch, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const ctx = await launch({ headless: true });   // launch() 直接返回 ctx
const page = ctx.pages()[0] || (await ctx.newPage());

// ── A. 阳明 P2P 搜索页
try {
  await page.goto('https://www.yangming.com/esolution/schedule/point_to_point_search?lang=en-us', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000); await H.dismissCookies(page).catch(() => {}); await sleep(1000);
  const info = await page.evaluate(() => ({
    title: document.title,
    inputs: [...document.querySelectorAll('input')].slice(0, 14).map((e) => (e.id || '') + '|' + (e.placeholder || e.getAttribute('aria-label') || e.name || e.type || '?')),
  }));
  console.log('YM-PAGE ' + JSON.stringify(info));
  // 试着往第一个可见文本框打 "Tianjin"
  const boxes = page.locator('input[type="text"], input:not([type]), input[type="search"]');
  const n = await boxes.count();
  let typed = false;
  for (let i = 0; i < Math.min(n, 6); i++) {
    const b = boxes.nth(i);
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {}); await sleep(400);
      await page.keyboard.type('Tianjin', { delay: 80 }); typed = true; break;
    }
  }
  console.log('YM-TYPED ' + typed);
  await sleep(3500);
  const drop = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('li,div[role="option"],[class*="drop"],[class*="auto"],[class*="suggest"]').forEach((el) => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t && t.length < 120 && /tianjin|天津/i.test(t)) out.push(t);
    });
    return [...new Set(out)].slice(0, 12);
  });
  console.log('YM-DROP ' + JSON.stringify(drop));
} catch (e) { console.log('YM-ERR ' + String(e).slice(0, 160)); }

// ── B. HMM 首页
try {
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  const info = await page.evaluate(() => ({
    title: document.title, url: location.href,
    hasFrom: !!document.querySelector('#srchPointFrom'),
    inputs: [...document.querySelectorAll('input,select')].slice(0, 22).map((e) => (e.id || e.name || '?') + ':' + (e.tagName)),
    text: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 260),
  }));
  console.log('HMM-PAGE ' + JSON.stringify(info));
} catch (e) { console.log('HMM-ERR ' + String(e).slice(0, 160)); }

await ctx.close();

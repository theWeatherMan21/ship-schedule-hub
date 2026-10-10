
import { launch, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

// ── A. 阳明：抓输入时的联想请求（react-select 的 suggest API）
const hits = [];
page.on('request', (r) => { const u = r.url(); if (/suggest|location|search|autocomplete|p2p|port/i.test(u) && !/\.(js|css|png|svg|woff)/.test(u)) hits.push(u); });
try {
  await page.goto('https://www.yangming.com/esolution/schedule/point_to_point_search?lang=en-us', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000); await H.dismissCookies(page).catch(() => {}); await sleep(800);
  const box = page.locator('input[type="text"]').first();
  await box.click().catch(() => {}); await sleep(500);
  await page.keyboard.type('Tianjin', { delay: 120 }); await sleep(4500);
  console.log('YM-REQS ' + JSON.stringify([...new Set(hits)].slice(0, 10)));
  // 再读 react-select 的菜单
  const menu = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[class*="react-select__option"],[class*="menu"] div,li').forEach((el) => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t && t.length < 100 && /tianjin/i.test(t)) out.push(t);
    });
    return [...new Set(out)].slice(0, 15);
  });
  console.log('YM-MENU ' + JSON.stringify(menu));
} catch (e) { console.log('YM-ERR ' + String(e).slice(0, 150)); }

// ── B. HMM：找导航里的 schedule 链接
try {
  await page.goto('https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(5000);
  const links = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.href).filter((h) => /schedule/i.test(h)).slice(0, 15));
  console.log('HMM-LINKS ' + JSON.stringify([...new Set(links)]));
} catch (e) { console.log('HMM-ERR ' + String(e).slice(0, 150)); }
await ctx.close();

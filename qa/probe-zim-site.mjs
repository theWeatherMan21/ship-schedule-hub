
// 开真浏览器：在 zim.com 站点里搜 上海→鹿特丹，抓它自己发的 PointToPoint 请求（含码）
import { launch, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const hits = [];
page.on('request', (r) => { const u = r.url(); if (/PointToPoint/i.test(u)) hits.push(u); });
try {
  await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000); await H.dismissCookies(page).catch(() => {}); await sleep(1200);
  const fill = async (word, wantRe) => {
    const boxes = page.locator('input[type="text"], input:not([type])');
    const n = await boxes.count();
    for (let i = 0; i < Math.min(n, 8); i++) {
      const b = boxes.nth(i);
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {}); await sleep(300);
        await page.keyboard.type(word, { delay: 80 }); await sleep(2600);
        const opts = page.locator('[role="option"], li');
        const m = await opts.count().catch(() => 0);
        for (let j = 0; j < Math.min(m, 12); j++) {
          const t = ((await opts.nth(j).textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
          if (t && wantRe.test(t)) { await opts.nth(j).click({ timeout: 3000 }).catch(() => {}); console.log('PICK', word, '->', t.slice(0, 50)); return true; }
        }
      }
    }
    return false;
  };
  const ok1 = await fill('Shanghai', /shanghai/i);
  const ok2 = await fill('Rotterdam', /rotterdam/i);
  console.log('FILLS', ok1, ok2);
  const btn = page.locator('button:has-text("Search"), a:has-text("Search")').first();
  await btn.click({ timeout: 8000 }).catch((e) => console.log('BTN', String(e).slice(0, 70)));
  await sleep(9000);
  const txt = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300));
  console.log('TEXT', txt);
  console.log('REQS ' + JSON.stringify([...new Set(hits)].slice(0, 4)));
} catch (e) { console.log('ERR ' + String(e).slice(0, 140)); }
await ctx.close();

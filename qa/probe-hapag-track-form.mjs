// Hapag 追踪：booking 页表单结构 + 提交取结果（有头最小化）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const BL = process.env.BL || 'HLCUTS12609DETN4';
const BOOKING = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html';
const CONTAINER = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html';

const ctx = await launch({ headless: false });
await quietWindow(ctx, 'minimized');
const page = ctx.pages()[0] || (await ctx.newPage());
const xhr = [];
page.on('request', (r) => { const rt = r.resourceType(); if (rt === 'xhr' || rt === 'fetch' || rt === 'document') xhr.push({ rt, m: r.method(), u: r.url().slice(0, 200), b: String(r.postData() || '').slice(0, 300) }); });

async function open(u) {
  for (let i = 0; i < 4; i++) {
    try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { console.log('goto err ' + String(e).slice(0, 70)); }
    for (let j = 0; j < 12; j++) {
      await sleep(2500);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => 0);
      if (!(await isBlockPage(page).catch(() => true)) && len > 200) return true;
    }
    console.log('  过盾重试 ' + (i + 1));
  }
  return false;
}

console.log('== 打开 booking 页: ' + await open(BOOKING));
const form = await page.evaluate(() => {
  const f = document.querySelector('form');
  if (!f) return { err: 'no form' };
  return {
    action: f.getAttribute('action') || '', method: (f.getAttribute('method') || 'get').toUpperCase(),
    inputs: [...f.querySelectorAll('input, select, button')].map((e) => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', name: e.name || '', v: (e.value || '').slice(0, 40), txt: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20) })),
    html: f.outerHTML.slice(0, 2500),
  };
});
console.log('FORM ' + JSON.stringify(form, null, 1));

// 提交：填单号 + 点 Find
const sel = 'input[type=text]';
const okf = await page.locator(sel).first().fill(BL, { timeout: 10000 }).then(() => true).catch((e) => String(e).slice(0, 60));
console.log('填 ' + BL + ' => ' + okf);
xhr.length = 0;
await page.getByRole('button', { name: /find/i }).first().click({ timeout: 10000 }).catch((e) => console.log('点 Find 失败 ' + String(e).slice(0, 80)));
await sleep(12000);
console.log('提交后 URL ' + page.url().slice(0, 200));
console.log('提交后 title ' + await page.title().catch(() => '?'));
console.log('提交后 body: ' + (await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 2500)).catch(() => '?')));
console.log('提交后请求: ' + JSON.stringify(xhr.slice(-12), null, 1));

// 直接 GET（借页面 cookie / cf_clearance）看等价形态
const guess = `${BOOKING}?tracing_by_booking%3Ahl12=${BL}`;
const r = await page.request.get(guess, { timeout: 40000 }).catch((e) => ({ status: () => -1, text: async () => String(e) }));
console.log('page.request GET ' + r.status() + ' ' + guess);
console.log((await r.text()).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200));

await ctx.close().catch(() => {});
process.exit(0);

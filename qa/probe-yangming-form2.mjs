// YM 表单细探：看清 3 个输入的归属 + 用原生 fill/click 走一次柜号搜索（无头、只读）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);

const info = await page.evaluate(() => [...document.querySelectorAll('input[type="text"]')].map((x, i) => ({
  i, id: x.id, aria: x.getAttribute('aria-label') || '', ph: x.placeholder || '',
  near: (x.closest('div') && x.closest('div').innerText || '').replace(/\s+/g, ' ').slice(0, 90),
  vis: x.offsetParent !== null,
})));
console.log('inputs:', JSON.stringify(info, null, 1));

// 找第一个可见 text 输入（搜索框应为 "Container No. or B/L No. or Booking No."）
const firstId = info.find((x) => x.vis)?.id;
if (firstId) {
  await page.fill('#' + firstId.replace(/([^\w-])/g, '\\$1'), 'YMLU4794134').catch((e) => console.log('fillErr', String(e).slice(0, 100)));
  await sleep(800);
  // 点 Search 按钮
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^search$/i.test((x.innerText || '').trim()));
    if (b) { b.click(); return true; }
    return false;
  });
  console.log('clicked search:', clicked);
  await sleep(10000);
  console.log('url after:', page.url().slice(0, 180));
  console.log('rows:', await page.evaluate(() => document.querySelectorAll('table tr').length).catch(() => -1));
  console.log('text:', await page.evaluate(() => (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(50, 400)).catch(() => ''));
}

await ctx.close().catch(() => {});

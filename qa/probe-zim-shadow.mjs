
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
await H.dismissCookies(page); await sleep(1500);
console.log('URL: ' + page.url());
console.log('标题: ' + (await page.title()).slice(0, 60));
console.log('Playwright 视角（能穿影子 DOM）:');
console.log('   input 数:', await page.locator('input').count());
console.log('   combobox 数:', await page.getByRole('combobox').count());
console.log('   按钮数:', await page.getByRole('button').count());
for (let i = 0; i < Math.min(await page.getByRole('combobox').count(), 6); i++) {
  const c = page.getByRole('combobox').nth(i);
  const a = await c.getAttribute('aria-label').catch(() => '');
  const ph = await c.getAttribute('placeholder').catch(() => '');
  const vis = await c.isVisible().catch(() => false);
  console.log(`   combo#${i} aria=${a} ph=${ph} 可见=${vis}`);
}
for (let i = 0; i < Math.min(await page.getByRole('button').count(), 12); i++) {
  const b = page.getByRole('button').nth(i);
  const t = ((await b.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 26);
  if (t) console.log(`   btn#${i} "${t}" 可见=${await b.isVisible().catch(() => false)}`);
}
console.log('页面可见文本(前 500): ' + (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 500));
await ctx.close().catch(() => {});

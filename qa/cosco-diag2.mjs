// COSCO 诊断 2：点 Sailing Schedule listitem（上次 getByText 定位挂了）→ 看跳转到哪
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({});
const page = await ctx.newPage();
await page.goto('https://elines.coscoshipping.com/ebusiness/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(4000);
await dismissCookies(page);
await sleep(1000);

// 用精确 listitem 定位
const li = page.locator('li').filter({ hasText: 'Sailing Schedule' }).first();
console.log('li 可见:', await li.isVisible().catch(() => false));
await li.click({ timeout: 5000, force: true }).catch(e => console.log('li click err:', String(e).slice(0, 100)));
await sleep(5000);
console.log('URL after click:', page.url());

let snap = await page.locator('body').ariaSnapshot().catch(() => 'FAIL');
fs.writeFileSync('qa/aria-cosco-live2.txt', snap);
console.log(snap.split('\n').filter(l => /textbox|combobox|button/i.test(l)).slice(0, 20).join('\n'));

// 若还没出现表单，试直接访问常见路径
const origin = page.getByRole('textbox', { name: /origin city/i }).first();
if (!(await origin.isVisible().catch(() => false))) {
  for (const path of ['/ebusiness/schedule/', '/ebusiness/sailingSchedule/', '/ebusiness/schedule/search/']) {
    await page.goto('https://elines.coscoshipping.com' + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await sleep(4000);
    const vis = await page.getByRole('textbox', { name: /origin city/i }).first().isVisible().catch(() => false);
    console.log(path, '→ origin visible:', vis, 'URL:', page.url());
    if (vis) {
      snap = await page.locator('body').ariaSnapshot().catch(() => '');
      fs.writeFileSync('qa/aria-cosco-live3.txt', snap);
      console.log(snap.split('\n').filter(l => /textbox|combobox|button/i.test(l)).slice(0, 20).join('\n'));
      break;
    }
  }
}
await ctx.close().catch(() => {});
process.exit(0);

// COSCO 起运港候选探测：试多种输入串，看哪个能出候选（婉宜 9-22）
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({});
const page = await ctx.newPage();
await page.goto('https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { waitUntil: 'domcontentloaded', timeout: 45000 });
await dismissCookies(page);
await sleep(4000);
console.log('title:', await page.title());

const o = page.getByRole('textbox', { name: /origin city/i }).first();
const vis = await o.isVisible({ timeout: 15000 }).catch(() => false);
console.log('origin 输入框可见:', vis);
if (!vis) { await ctx.close(); process.exit(1); }

for (const w of ['ningbo', 'ningbo china', 'CNNGB', 'NINGBO, CHINA', 'Ningbo']) {
  await o.click({ timeout: 8000 }).catch(() => {});
  await o.fill('', { timeout: 3000 }).catch(() => {});
  await o.type(w, { delay: 70 }).catch(() => {});
  // 轮询 30s 找候选
  let n = 0, sample = '';
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const items = await page.locator('.ivu-select-item').all().catch(() => []);
    if (items.length) {
      n = items.length;
      sample = (await items[0].innerText().catch(() => '')).slice(0, 50);
      break;
    }
  }
  console.log(`输入 "${w}" → 候选 ${n} 个${n ? ` 首个: ${sample.replace(/\n/g, ' ')}` : ''}`);
  // 清空准备下一轮
  await o.fill('', { timeout: 3000 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(1200);
}
await ctx.close().catch(() => {});
process.exit(0);

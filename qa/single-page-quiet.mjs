// ⚠️ 10-09 爹地红线：探针不得弹窗。需要真指纹破反爬时，请照 qa/headed-minimized-probe.mjs
//   那套做（headless:false + CDP Browser.setWindowBounds 最小化 + 回读 AXMinimized 验证）。
// 单页复用模式：最小化后只用 goto（不 newPage）能否保持不可见？（婉宜 9-23）
import { launch, quietWindow, sleep, windowBounds } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
// 复用首个页面（launchPersistentContext 自带 about:blank 页）
const page = ctx.pages()[0] || (await ctx.newPage());
const q0 = await quietWindow(ctx, 'minimized');
console.log('t=0:', q0.windowState);

const targets = [
  ['hapag', 'https://www.hapag-lloyd.com/en/home.html'],
  ['zim', 'https://www.zim.com/schedules'],
  ['msc', 'https://www.msc.com/en/track-a-shipment'],
];
for (const [name, url] of targets) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(6000);
  const b = await windowBounds(ctx);
  const st = await page.evaluate(() => ({ t: document.title.slice(0, 45), len: document.body.innerText.length })).catch(() => ({ t: '?', len: -1 }));
  console.log(`${name}: windowState=${b.windowState}  "${st.t}" len=${st.len}`);
}

// 填表 + 截图后是否仍最小化
await page.locator('input').first().fill('ningbo', { timeout: 8000 }).catch(() => {});
await page.screenshot({ path: '/tmp/single-page.png', timeout: 15000 }).catch(() => {});
await sleep(3000);
const b2 = await windowBounds(ctx);
console.log(`填表+截图后: windowState=${b2.windowState}`);

await ctx.close().catch(() => {});
process.exit(0);

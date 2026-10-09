// ⚠️ 10-09 爹地红线：探针不得弹窗。需要真指纹破反爬时，请照 qa/headed-minimized-probe.mjs
//   那套做（headless:false + CDP Browser.setWindowBounds 最小化 + 回读 AXMinimized 验证）。
// 找「不打扰爸爸」的最优窗口策略：负坐标强移 vs 极小尺寸 vs 最小化
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

const PROFILE = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile';
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: true, viewport: null,
  args: ['--window-position=-2400,-2400', '--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
});
const page = await ctx.newPage();
await page.goto('about:blank');
const s = await ctx.newCDPSession(page);
const { windowId } = await s.send('Browser.getWindowForTarget');
const read = async () => (await s.send('Browser.getWindowBounds', { windowId })).bounds;

const attempts = [
  ['negative-offscreen', { left: -3000, top: -3000 }],
  ['tiny-1x1', { width: 80, height: 60 }],
  ['normal-restore', { windowState: 'normal' }],
  ['minimized', { windowState: 'minimized' }],
];
for (const [label, bounds] of attempts) {
  try {
    await s.send('Browser.setWindowBounds', { windowId, bounds });
  } catch (e) {
    console.log(JSON.stringify({ label, setError: String(e).slice(0, 140) }));
  }
  await new Promise((r) => setTimeout(r, 800));
  console.log(JSON.stringify({ label, after: await read().catch((e) => String(e).slice(0, 100)) }));
}
await ctx.close();

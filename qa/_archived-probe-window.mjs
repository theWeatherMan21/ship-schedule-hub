// 窗口可见性诊断：CDP 读真实窗口 bounds（客观数字证据），测 4 种策略
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

const PROFILE = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile';

async function boundsOf(page, label) {
  const s = await page.context().newCDPSession(page);
  const { windowId } = await s.send('Browser.getWindowForTarget');
  const { bounds } = await s.send('Browser.getWindowBounds', { windowId });
  console.log(JSON.stringify({ label, windowId, ...bounds }));
  return { s, windowId, bounds };
}

for (const [label, args] of [
  ['pos=-2400', ['--window-position=-2400,-2400']],
  ['pos=-10000', ['--window-position=-10000,-10000']],
]) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome', headless: false, viewport: null,
    args: [...args, '--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = await ctx.newPage();
  await page.goto('about:blank');
  const { s, windowId } = await boundsOf(page, label);
  // 再试 CDP 强移 + 最小化
  try {
    await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
  } catch (e) { console.log(JSON.stringify({ label, minimizeError: String(e).slice(0, 120) })); }
  await new Promise((r) => setTimeout(r, 1200));
  try {
    const { bounds } = await s.send('Browser.getWindowBounds', { windowId });
    console.log(JSON.stringify({ label: label + '+minimized', ...bounds }));
  } catch (e) { console.log(JSON.stringify({ label, readbackError: String(e).slice(0, 120) })); }
  await ctx.close();
  await new Promise((r) => setTimeout(r, 800));
}

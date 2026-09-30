// 最小化稳定性测试：窗口会不会自己恢复可见？（决定「完美」是否成立，婉宜 9-23）
import { launch, quietWindow, sleep, windowBounds } from '../engine/browser.mjs';

const ctx = await launch({ headless: false });
const q0 = await quietWindow(ctx, 'minimized');
console.log('t=0 最小化:', q0.windowState);

const page = await ctx.newPage();
await page.goto('https://www.hapag-lloyd.com/en/home.html', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

const checks = [
  ['goto 后 5s', 5000],
  ['等 CF 时 15s', 10000],
  ['填表操作后', 8000],
  ['截图后', 5000],
  ['新开页面后', 8000],
];
for (const [label, ms] of checks) {
  await sleep(ms);
  const b = await windowBounds(ctx);
  console.log(`${label}: windowState=${b.windowState} left=${b.left} top=${b.top}`);
}

// 主动做一次截图 + 页面交互，再检查
await page.screenshot({ path: '/tmp/min-stab.png', timeout: 15000 }).catch(() => {});
await sleep(3000);
const b2 = await windowBounds(ctx);
console.log(`截图+3s: windowState=${b2.windowState}`);

// 再等 20s 看是否稳定
await sleep(20000);
const b3 = await windowBounds(ctx);
console.log(`再过 20s: windowState=${b3.windowState}  ← 若仍 minimized 则方案完美`);

await ctx.close().catch(() => {});
process.exit(0);

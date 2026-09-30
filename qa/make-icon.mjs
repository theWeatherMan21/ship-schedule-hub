// 生成 App 图标：SVG → 1024×1024 PNG（用引擎自带的 playwright-core + 系统 Chrome 渲染）
// 用法：cd engine && node ../qa/make-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

const OUT = process.argv[2] || '/tmp/ssh-icon.png';

// 设计：圆角方 + 深蓝→青渐变底（和 App 浅色界面同族色），主体是白色集装箱船 + 右下一条「时间轴」
// —— 时间轴是 App 的核心视觉语言（按船司分组的时间轴卡片），和船期这件事都能一眼读懂。
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#14307a"/>
      <stop offset="60%" stop-color="#1560c9"/>
      <stop offset="100%" stop-color="#1ea7e8"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a2a63" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0a2a63" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#dfe9ff"/>
    </linearGradient>
  </defs>

  <!-- 圆角底（系统自己会裁，这里给足安全边） -->
  <rect x="0" y="0" width="1024" height="1024" rx="228" fill="url(#bg)"/>

  <!-- 海面：明显更深的色带，和底色拉开 -->
  <path d="M0 636 Q 256 596 512 636 T 1024 636 L1024 1024 L0 1024 Z" fill="url(#sea)"/>

  <!-- 船体（整体上移，收紧顶部留白） -->
  <g transform="translate(0,-58)">
    <!-- 货柜：只留 3 个大块，小尺寸不糊 -->
    <g fill="#ffffff">
      <rect x="300" y="392" width="176" height="92" rx="16"/>
      <rect x="500" y="392" width="176" height="92" rx="16"/>
      <rect x="400" y="284" width="176" height="92" rx="16"/>
    </g>
    <!-- 驾驶楼 -->
    <rect x="700" y="330" width="150" height="154" rx="20" fill="url(#hull)"/>
    <rect x="742" y="366" width="30" height="42" rx="7" fill="#14307a"/>
    <rect x="792" y="366" width="30" height="42" rx="7" fill="#14307a"/>
    <!-- 船身 -->
    <path d="M180 500 L880 500 L820 640 Q 810 660 788 660 L272 660 Q 250 660 240 640 Z" fill="url(#hull)"/>
  </g>

  <!-- 时间轴：加粗 + 实心节点（三个节点 = 逐家船司的船期） -->
  <g transform="translate(0,-26)">
    <rect x="196" y="782" width="632" height="46" rx="23" fill="#7dd3fc"/>
    <circle cx="196" cy="805" r="62" fill="#ffffff"/>
    <circle cx="512" cy="805" r="50" fill="#ffffff"/>
    <circle cx="828" cy="805" r="50" fill="#ffffff"/>
  </g>
</svg>`;

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;padding:0">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: OUT, omitBackground: true });
  console.log('✅ 图标已生成:', OUT, fs.statSync(OUT).size, 'bytes');
} finally {
  await browser.close().catch(() => {});
}

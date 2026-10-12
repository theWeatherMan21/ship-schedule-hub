// COSCO 追踪页 · 到底哪一步挂了？（无头，零窗口）—— 2026-10-10（婉宜 · COSCO 卡）
// 现象（前两个探针）：页面壳（页头/页脚/菜单）能渲染，但 /cargoTracking 视图不挂载、不发 /ebtracking/ 查询。
// 本探针看：静态 chunk 有没有请求成功、有没有 console 报错 / 请求失败，从而给出「页面路线为什么不通」的实据。
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const chunks = [], failed = [], consoleMsgs = [];
page.on('request', (r) => { const u = r.url(); if (/\.chunk\.js|\.js\?/.test(u)) chunks.push(u.replace('https://elines.coscoshipping.com', '')); });
page.on('requestfailed', (r) => failed.push(`${r.url().replace('https://elines.coscoshipping.com', '')} :: ${r.failure()?.errorText || '?'}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${String(m.text()).slice(0, 160)}`); });
page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${String(e).slice(0, 160)}`));

await page.goto('https://elines.coscoshipping.com/ebusiness/cargoTracking?number=6469105960&trackingType=BILLOFLADING', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(15000);
const dom = await page.evaluate(() => ({
  appChildren: (document.getElementById('app')?.children.length) || 0,
  hasResultBox: !!document.querySelector('.cargoTrackingResult'),
  hasTracker: !!document.querySelector('.cargoTrackType'),
  bodyLen: (document.body?.innerText || '').length,
  chunksLoaded: [...document.querySelectorAll('script[src]')].map((x) => x.getAttribute('src')),
})).catch((e) => ({ error: String(e).slice(0, 120) }));

console.log(JSON.stringify({
  dom,
  jsRequests: [...new Set(chunks)].slice(0, 20),
  failed: failed.slice(0, 14),
  console: consoleMsgs.slice(0, 14),
}, null, 1));
await ctx.close().catch(() => {});
process.exit(0);

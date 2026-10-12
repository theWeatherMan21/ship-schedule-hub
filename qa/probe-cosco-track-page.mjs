// COSCO 追踪页现状探针（无头，零窗口）—— 2026-10-10（婉宜 · COSCO 卡）
// 目的：把「页面侧到底怎么了」和「页面自己发的是哪些接口」一次性留证，别只凭转述。
// 用法：node qa/probe-cosco-track-page.mjs [单号]
// 输出：落地 URL / 标题 / 正文片段 / 页面自发的 /ebtracking/ 请求（证明接口路线 = 页面自己的路线）
import { launch, sleep } from '../engine/browser.mjs';

const num = process.argv[2] || 'COSU6469105960';
const digit = String(num).replace(/^[A-Za-z]{4}/, '');
const ctx = await launch({ headless: true });          // 无头新档：屏幕不留窗口
const page = ctx.pages()[0] || (await ctx.newPage());
const hits = [];
page.on('response', (r) => {
  const u = r.url();
  if (/\/ebtracking\/|\/ebbase\/|\/ebschedule\//.test(u)) hits.push(`${r.status()} ${u.replace('https://elines.coscoshipping.com', '')}`);
});

for (const url of [
  `https://elines.coscoshipping.com/ebusiness/cargoTracking?number=${digit}&trackingType=BILLOFLADING`,
  `https://elines.coscoshipping.com/ebusiness/cargoTracking?number=${num}&trackingType=BILLOFLADING`,
  'https://elines.coscoshipping.com/ebusiness/cargoTracking',
]) {
  hits.length = 0;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(9000);
    const st = await page.evaluate(() => ({
      href: location.href.slice(0, 120),
      title: document.title.slice(0, 60),
      text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
    }));
    console.log(JSON.stringify({ probe: url.replace('https://elines.coscoshipping.com', ''), ...st, xhr: [...new Set(hits)].slice(0, 8) }, null, 1));
  } catch (e) {
    console.log(JSON.stringify({ probe: url, error: String(e).slice(0, 140) }));
  }
  await sleep(1000);
}
await ctx.close().catch(() => {});
process.exit(0);

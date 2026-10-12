// COSCO 追踪页 · 深链到底会不会自动查？（无头，零窗口）—— 2026-10-10（婉宜 · COSCO 卡）
// 上一版探针（probe-cosco-track-page.mjs）发现：页面本身现在是好的（不再跳 error404，/ebbase/* 公共接口全 200），
// 但带 ?number=&trackingType= 进页面时**没有发出 /ebtracking/ 查询**。
// 本探针把三种「进入方式」各跑一次，逐步加码，看谁能让页面真正发起查询：
//   A 深链 + 等 25s（纯等，不碰页面）
//   B 首页热身 → 深链 + 等 25s
//   C 深链 + 手动点「立即查询/search」按钮
// 输出：每次的 URL/结果区文本/页面自发的 /ebtracking/ 请求。
import { launch, sleep } from '../engine/browser.mjs';

const num = process.argv[2] || '6469105960';
const digit = String(num).replace(/^[A-Za-z]{4}/, '');
const DEEP = `https://elines.coscoshipping.com/ebusiness/cargoTracking?number=${digit}&trackingType=BILLOFLADING`;
const HOME = 'https://elines.coscoshipping.com/ebusiness/';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
let hits = [];
page.on('response', (r) => { const u = r.url(); if (/\/ebtracking\//.test(u)) hits.push(`${r.status()} ${u.replace('https://elines.coscoshipping.com', '')}`); });

const snap = async (tag, extra = {}) => {
  const st = await page.evaluate(() => {
    const rs = document.querySelector('.cargoTrackingResult');
    return {
      href: location.href.replace('https://elines.coscoshipping.com', '').slice(0, 110),
      result: (rs ? rs.innerText : (document.body?.innerText || '')).replace(/\s+/g, ' ').slice(0, 200),
      hasForm: !!document.querySelector('.cargoTrackType, .cargoTrackingSearch, input[type=text]'),
    };
  }).catch((e) => ({ error: String(e).slice(0, 100) }));
  console.log(JSON.stringify({ tag, ...st, ...extra, xhr: [...new Set(hits)].slice(0, 10) }, null, 1));
  hits = [];
};

// A 深链纯等
try { await page.goto(DEEP, { waitUntil: 'domcontentloaded', timeout: 45000 }); await sleep(25000); await snap('A-深链等25s'); } catch (e) { console.log(JSON.stringify({ tag: 'A', error: String(e).slice(0, 120) })); }

// B 首页热身 → 深链
try {
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000);
  await page.goto(DEEP, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(25000);
  await snap('B-首页热身+深链等25s');
} catch (e) { console.log(JSON.stringify({ tag: 'B', error: String(e).slice(0, 120) })); }

// C 深链 + 点查询按钮
try {
  const clicked = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('button, .btnSearch, a')];
    const b = cands.find((x) => /search|查询/i.test(x.innerText || ''));
    if (!b) return false;
    b.click();
    return true;
  }).catch(() => false);
  await sleep(20000);
  await snap('C-点查询按钮', { clicked });
} catch (e) { console.log(JSON.stringify({ tag: 'C', error: String(e).slice(0, 120) })); }

await ctx.close().catch(() => {});
process.exit(0);

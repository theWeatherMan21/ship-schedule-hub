
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
const ctx = await chromium.launchPersistentContext('/tmp/qp-wy', { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.goto('https://www.weiyun001.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
const s = await page.evaluate(() => ({
  url: location.href.slice(0, 90),
  title: (document.title || '').slice(0, 60),
  inputs: [...document.querySelectorAll('input')].filter((i) => i.offsetParent).map((i) => i.placeholder || i.id || '').filter(Boolean).slice(0, 12),
  // 找「船期查询」这类入口
  entries: [...document.querySelectorAll('a,button,li,div[class*=nav]')].filter((e) => e.offsetParent && /船期|schedule|航线查询|港到港/i.test(e.innerText || '') && (e.innerText || '').length < 30)
    .map((e) => ({ tag: e.tagName, t: (e.innerText || '').trim().slice(0, 20), href: e.getAttribute('href') || '', cls: (e.className || '').toString().slice(0, 30) })).slice(0, 10),
}));
console.log('  页面:', JSON.stringify({ url: s.url, title: s.title }, null, 0));
console.log('  可见输入框:', JSON.stringify(s.inputs));
console.log('  船期入口候选:', JSON.stringify(s.entries).slice(0, 700));
// 试着点第一个"船期"入口，看落到哪个页面
try {
  const link = page.locator('a', { hasText: /船期查询|港到港|船期/ }).first();
  if (await link.count()) {
    const href = await link.getAttribute('href');
    console.log('  入口 href =', href);
    await link.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(7000);
    console.log('  点击后 URL =', page.url().slice(0, 120));
    const has = await page.evaluate(() => ({ inputs: [...document.querySelectorAll('input')].filter((i) => i.offsetParent).length, txt: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200) }));
    console.log('  落地页输入框数 =', has.inputs, '| 片段:', has.txt.slice(0, 150));
  }
} catch (e) { console.log('  点击失败:', String(e.message).slice(0, 80)); }
await ctx.close(); process.exit(0);

import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const page = await ctx.newPage();
// 首页 → 点「船期查询」
await page.goto('https://www.weiyun001.com/?regionredirected=true', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(12000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Runtime.enable');
const { result } = await cdp.send('Runtime.evaluate', { expression: `
  JSON.stringify({
    url: location.href.slice(0, 80),
    anchors: [...document.querySelectorAll('a')].filter(a => /船期/.test(a.textContent||'')).map(a => ({ t: a.textContent.trim().slice(0,15), h: a.getAttribute('href') })).slice(0, 5),
  })
`, returnByValue: true });
console.log(result.value);
// 点第一个船期查询入口
const { result: r2 } = await cdp.send('Runtime.evaluate', { expression: `
  (() => { const a = [...document.querySelectorAll('a')].find(a => /船期/.test(a.textContent||'')); if (a) { a.click(); return a.getAttribute('href'); } return null; })()
`, returnByValue: true });
console.log('点击:', r2.value);
await sleep(10000);
const { result: r3 } = await cdp.send('Runtime.evaluate', { expression: 'location.href.slice(0, 100) + " || " + document.title', returnByValue: true });
console.log('现在:', r3.value);
await ctx.close().catch(() => {});
process.exit(0);

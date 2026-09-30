import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const page = await ctx.newPage();
await page.goto('https://www.weiyun001.com/?regionredirected=true', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(14000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Runtime.enable');
// 首页顶部 tab：点击「船期查询」
const { result } = await cdp.send('Runtime.evaluate', { expression: `
  (() => {
    const els = [...document.querySelectorAll('a, span, div, li')].filter(e => e.offsetParent !== null && e.textContent.trim() === '船期查询');
    if (!els.length) return 'none';
    els[0].click();
    return 'clicked:' + els[0].tagName + '.' + (els[0].className||'').toString().slice(0,30);
  })()
`, returnByValue: true });
console.log(result.value);
await sleep(8000);
const { result: r2 } = await cdp.send('Runtime.evaluate', { expression: 'location.href.slice(0, 120)', returnByValue: true });
console.log('路由:', r2.value);
// 看查询表单
const { result: r3 } = await cdp.send('Runtime.evaluate', { expression: `
  JSON.stringify({
    selects: [...document.querySelectorAll('.ant-select')].filter(e=>e.offsetParent!==null).length,
    inputs: [...document.querySelectorAll('input')].filter(e=>e.offsetParent!==null).slice(0,8).map(i=>i.placeholder||i.id||'?'),
    btns: [...document.querySelectorAll('button')].filter(e=>e.offsetParent!==null).slice(0,8).map(b=>b.textContent.trim().slice(0,10)),
  })
`, returnByValue: true });
console.log('表单:', r3.value);
await ctx.close().catch(() => {});
process.exit(0);

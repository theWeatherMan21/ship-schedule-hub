import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.weiyun001.com/NewRoute', { reuse: true });
await sleep(16000);
// CDP evaluate（可能绕过检测）
const cdp = await ctx.newCDPSession(page);
await cdp.send('Runtime.enable');
const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText.slice(0, 400)', returnByValue: true });
console.log('CDP 看到:', (result.value || '').replace(/\s+/g, ' ').slice(0, 350));
const { result: r2 } = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify([...document.querySelectorAll('.ant-select')].map(e=>e.offsetParent!==null).slice(0,10))`, returnByValue: true });
console.log('ant-select 可见数:', r2.value);
await ctx.close().catch(() => {});
process.exit(0);

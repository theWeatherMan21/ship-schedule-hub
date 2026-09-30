// CMA Search 按钮 onClick handler 在页面 JS 里。在浏览器里直接看按钮的事件 + window 里的函数
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Search');
  return btns.map((b) => ({
    id: b.id, cls: b.className.slice(0, 60),
    form: b.form ? b.form.id || b.form.action : null,
    onclick: (b.getAttribute('onclick') || '').slice(0, 200),
    type: b.type,
    parentForm: b.closest('form') ? { action: b.closest('form').action, method: b.closest('form').method } : null,
  }));
});
console.log(JSON.stringify(info, null, 1).slice(0, 900));
// 看 window 上的 schedule 相关对象
const win = await page.evaluate(() => Object.keys(window).filter((k) => /sched|route|ebiz/i.test(k)).slice(0, 10));
console.log('window 相关键:', win);
await ctx.close().catch(() => {});
process.exit(0);

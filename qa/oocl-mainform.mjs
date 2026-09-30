import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input').length).catch(() => 0); if (n > 10) break; }
const st = await page.evaluate(() => {
  // 主表单：form 里不在 advanced-search-scrollbar 内的元素
  const form = document.querySelector('form.ng-pristine, form');
  const groups = [...form.querySelectorAll('.form-group')].filter((g) => g.offsetParent !== null && !g.closest('.advanced-search-scrollbar'));
  return groups.slice(0, 8).map((g) => ({
    label: (g.querySelector('label, .label')?.textContent || '').trim().slice(0, 30),
    html: g.outerHTML.replace(/\s+/g, ' ').slice(0, 260),
  }));
}).catch((e) => ({ err: String(e).slice(0, 90) }));
console.log(JSON.stringify(st, null, 1).slice(0, 2200));
await ctx.close().catch(() => {});
process.exit(0);

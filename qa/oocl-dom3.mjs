import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
await sleep(18000);
// dump 表单区域的 html 结构（截断输出）
const st = await page.evaluate(() => {
  const form = document.querySelector('form, .search-panel, [class*=search], [class*=panel]');
  const region = form || document.body;
  const inputs = [...region.querySelectorAll('input')].map((i) => ({ id: i.id, name: i.name, cls: (i.className || '').slice(0, 40), ph: i.placeholder, ngmodel: i.getAttribute('ng-model') }));
  const labels = [...region.querySelectorAll('label, .label, [class*=title]')].map((l) => (l.textContent || '').trim().slice(0, 30)).filter(Boolean).slice(0, 12);
  return { inputs, labels, bodyCls: document.body.className.slice(0, 50) };
}).catch((e) => ({ err: String(e).slice(0, 100) }));
console.log(JSON.stringify(st, null, 1).slice(0, 1600));
await ctx.close().catch(() => {});
process.exit(0);

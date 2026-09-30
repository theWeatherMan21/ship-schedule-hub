import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input').length).catch(() => 0); if (n > 10) break; }
const html = await page.evaluate(() => {
  // 找 Origin 文本节点所在的容器
  const all = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /^Origin:?$/.test((e.textContent || '').trim()));
  if (!all.length) return { none: true };
  let el = all[0];
  let parent = el.closest('div') || el.parentElement;
  for (let i = 0; i < 3 && parent && parent.querySelectorAll('input').length === 0; i++) parent = parent.parentElement;
  return { html: (parent ? parent.outerHTML : '').slice(0, 2200) };
}).catch((e) => ({ err: String(e).slice(0, 100) }));
console.log(JSON.stringify(html, null, 1).slice(0, 2400));
await ctx.close().catch(() => {});
process.exit(0);

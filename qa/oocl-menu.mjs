import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.oocl.com/eng/Pages/default.aspx', { reuse: true });
await sleep(16000);
await page.evaluate(() => { const b = document.getElementById('allowAll'); if (b) b.click(); }).catch(() => {});
await sleep(1500);
// hover/点击 Sailing Schedule 展开子菜单
const expanded = await page.evaluate(() => {
  const els = [...document.querySelectorAll('a, span, li')].filter((e) => (e.textContent || '').trim() === 'Sailing Schedule');
  if (els.length) { els[0].click(); return els.length; }
  return 0;
}).catch(() => 0);
await sleep(3000);
const links = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => a.offsetParent !== null && /p2p|point|vss|interactive|search/i.test((a.textContent || '') + a.href)).map((a) => ({ t: (a.textContent || '').trim().slice(0, 25), h: (a.href || '').slice(0, 100) })).slice(0, 8)).catch(() => []);
console.log('展开:', expanded, JSON.stringify(links, null, 1).slice(0, 800));
await ctx.close().catch(() => {});
process.exit(0);

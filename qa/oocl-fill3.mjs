import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input[ng-model="user.origin"]').length).catch(() => 0); if (n >= 1) break; }
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/oocl/.test(u) && !/\.(js|css|png|woff|gif|jpg)/.test(u)) reqs.push({ m: r.method(), u: u.slice(0, 170), body: (r.postData() || '').slice(0, 400) });
});
const pol = page.locator('input[ng-model="user.origin"]');
await pol.click({ timeout: 15000 });
await page.keyboard.type('ningbo', { delay: 90 });
await sleep(6000);
const cand = await page.evaluate(() => {
  const lists = [...document.querySelectorAll('ul')].filter((l) => l.offsetParent !== null && l.querySelectorAll('li').length > 0 && /ningbo/i.test(l.textContent || ''));
  if (lists.length) {
    return { cls: lists[0].className.slice(0, 40), items: [...lists[0].querySelectorAll('li')].slice(0, 5).map((li) => (li.textContent || '').trim().slice(0, 45)) };
  }
  return { none: true };
});
console.log('POL 候选:', JSON.stringify(cand).slice(0, 350));
console.log('输入时 API:', reqs.length);
reqs.slice(0, 3).forEach((r) => console.log(`[${r.m}] ${r.u}`));
await ctx.close().catch(() => {});
process.exit(0);

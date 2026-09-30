import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input[ng-model*=port_of]').length).catch(() => 0); if (n >= 2) break; }
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/oocl/.test(u) && !/\.(js|css|png|woff|gif|jpg)/.test(u)) reqs.push({ m: r.method(), u: u.slice(0, 160), body: (r.postData() || '').slice(0, 350) });
});
// 填 POL
const pol = page.locator('input[ng-model="user.port_of_Load"]:visible');
await pol.click({ timeout: 12000 });
await page.keyboard.type('ningbo', { delay: 90 });
await sleep(6000);
// 抓候选（angular typeahead 常见结构）
const cand = await page.evaluate(() => {
  const lists = [...document.querySelectorAll('ul[class*=typeahead], ul[class*=dropdown], .autocomplete, [class*=suggestion]')].filter((l) => l.offsetParent !== null);
  if (lists.length) {
    const items = [...lists[0].querySelectorAll('li')].slice(0, 5).map((li) => (li.textContent || '').trim().slice(0, 50));
    return { cls: lists[0].className.slice(0, 40), items };
  }
  return { none: true, visLists: [...document.querySelectorAll('ul')].filter((u) => u.offsetParent !== null).length };
});
console.log('候选:', JSON.stringify(cand).slice(0, 400));
console.log('输入时 API:', reqs.length);
reqs.slice(0, 4).forEach((r) => console.log(`[${r.m}] ${r.u}`, r.body || ''));
await ctx.close().catch(() => {});
process.exit(0);

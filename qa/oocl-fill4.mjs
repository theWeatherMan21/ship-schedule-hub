import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input[ng-model="user.origin"]').length).catch(() => 0); if (n >= 1) break; }
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/oocl/.test(u) && !/\.(js|css|png|woff|gif|jpg)/.test(u)) reqs.push({ m: r.method(), u: u.slice(0, 180), body: (r.postData() || '').slice(0, 450) });
});
const pick = async (ngModel, word, kw) => {
  const inp = page.locator(`input[ng-model="${ngModel}"]`);
  await inp.click({ timeout: 15000 });
  await page.keyboard.type(word, { delay: 90 });
  await sleep(5500);
  const ok = await page.evaluate((kw) => {
    const lists = [...document.querySelectorAll('ul')].filter((l) => l.offsetParent !== null && /th-dropdown-menu/.test(l.className) && l.querySelectorAll('li').length);
    if (!lists.length) return null;
    const li = [...lists[0].querySelectorAll('li')].find((x) => kw.test((x.textContent || '')));
    if (!li) return null;
    const t = (li.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    li.querySelector('a, span')?.click() || li.click();
    return t;
  }, kw);
  await sleep(2500);
  return ok;
};
console.log('POL:', await pick('user.origin', 'ningbo', /ningbo/i));
console.log('POD:', await pick('user.destination', 'istanbul', /istanbul/i));
await sleep(2000);
// 点 Search
await page.evaluate(() => { [...document.querySelectorAll('button, a')].find((b) => /^search$/i.test((b.textContent || '').trim()) && b.offsetParent !== null)?.click(); });
await sleep(22000);
console.log('查询 API:');
const seen = new Set();
for (const r of reqs) {
  const k = r.m + ' ' + r.u.split('?')[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`[${r.m}] ${r.u}`);
  if (r.body) console.log('   body:', r.body);
}
// 结果文本
const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 700)).catch(() => '?');
console.log('结果文本:', txt.slice(0, 500));
await ctx.close().catch(() => {});
process.exit(0);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
for (let i = 0; i < 12; i++) { await sleep(3000); const n = await page.evaluate(() => document.querySelectorAll('input[ng-model="user.origin"]').length).catch(() => 0); if (n >= 1) break; }
const pick = async (ngModel, word, kw) => {
  const inp = page.locator(`input[ng-model="${ngModel}"]`);
  await inp.click({ timeout: 15000 });
  await page.keyboard.type(word, { delay: 90 });
  await sleep(7000);
  await page.evaluate((kw) => {
    const lists = [...document.querySelectorAll('ul')].filter((l) => l.offsetParent !== null && /th-dropdown-menu/.test(l.className) && l.querySelectorAll('li').length);
    if (!lists.length) return null;
    const li = [...lists[0].querySelectorAll('li')].find((x) => kw.test(x.textContent || ''));
    if (!li) return null;
    (li.querySelector('a, span') || li).click();
    return true;
  }, kw);
  await sleep(2500);
};
await pick('user.origin', 'ningbo', /ningbo/i);
await pick('user.destination', 'istanbul', /istanbul/i);
await page.evaluate(() => { [...document.querySelectorAll('button, a')].find((b) => /^search$/i.test((b.textContent || '').trim()) && b.offsetParent !== null)?.click(); });
await sleep(15000);
const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
// 输出结果区原文（Search Result 之后 1600 字符）
const i = txt.indexOf('Search Result');
console.log(JSON.stringify(txt.slice(i >= 0 ? i : 0, (i >= 0 ? i : 0) + 1600)));
await ctx.close().catch(() => {});
process.exit(0);

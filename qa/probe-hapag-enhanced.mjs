// Hapag：找「Enhanced Search」入口 —— 可能是另一条后端通路（维护期的替代路线）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const BL = process.env.BL || 'HLCU2B9E986E7C5E';
const B = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html';
const r = await launchHeadedQuiet();
console.log('模式 ' + r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());
page.setDefaultTimeout(20000);

async function open(u) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch { /* 忽略 */ }
    for (let j = 0; j < 10; j++) {
      await sleep(2200);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => 0);
      if (!(await isBlockPage(page).catch(() => true)) && len > 150) { await sleep(2000); return true; }
    }
  }
  return false;
}
const banner = () => page.evaluate(() => {
  for (const e of document.querySelectorAll('.hal-info-box__title, .hal-info-box, #HlMessages *')) {
    const t = (e.textContent || '').trim();
    if (/maintenance|not available/i.test(t)) { const cs = getComputedStyle(e); if (cs.display !== 'none' && cs.visibility !== 'hidden') return t.slice(0, 200); }
  }
  return '';
}).catch(() => '');

console.log('打开 booking ' + await open(B));
const nav = await page.evaluate(() => [...document.querySelectorAll('a,button,[role=tab]')]
  .map((e) => ({ t: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40), h: e.href || e.getAttribute('data-url') || '' }))
  .filter((x) => x.t));
console.log('页面导航项: ' + JSON.stringify(nav.filter((x) => /enhanced|search|booking|container/i.test(x.t))));

const cand = nav.find((x) => /enhanced search/i.test(x.t));
console.log('增强检索候选: ' + JSON.stringify(cand));
if (cand && cand.h) {
  console.log('\n打开增强检索 ' + cand.h);
  console.log('过盾 ' + await open(cand.h) + ' 横幅: ' + JSON.stringify(await banner()));
  console.log(JSON.stringify(await page.evaluate(() => ({
    url: location.href.slice(0, 130),
    inputs: [...document.querySelectorAll('form input')].filter((e) => e.offsetParent).map((e) => ({ id: e.id, type: e.type, maxlength: e.maxLength })),
    buttons: [...document.querySelectorAll('button')].filter((e) => e.offsetParent).map((e) => (e.innerText || '').trim().slice(0, 20)),
  }))));
}
// 页面 HTML 里 "Enhanced Search" 附近的链接
console.log('\nHTML 线索: ' + JSON.stringify((await page.content().catch(() => '')).split('\n').filter((l) => /[Ee]nhanced/.test(l)).slice(0, 6).map((l) => l.replace(/\s+/g, ' ').slice(0, 300))));
await ctx.close().catch(() => {});
process.exit(0);

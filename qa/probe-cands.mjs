// 探针：dump 某家船司「候选项」真实文本（诊断目的港关键词）—— 婉宜 9-29
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';

const [carrier = 'hmm', originWord = 'ningbo', destWord = 'istanbul'] = process.argv.slice(2);

const ENTRY = {
  hmm: 'https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do',
  maersk: 'https://www.maersk.com/schedules/pointToPoint',
  one: 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule',
};

const FIELDS = {
  hmm: { o: '#srchPointFrom', d: '#srchPointTo' },
  maersk: { o: 'input[placeholder*="From" i]', d: 'input[placeholder*="To" i]' },
  one: { o: 'input[placeholder*="Origin" i]', d: 'input[placeholder*="Destination" i]' },
};

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const { page } = await openPage(ctx, ENTRY[carrier]);
  await sleep(6000);
  await dismissCookies(page).catch(() => {});
  if (await isBlockPage(page)) { console.log('!! 被拦截'); }

  const dump = async (sel, word, label) => {
    const inp = page.locator(sel).first();
    const vis = await inp.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`\n=== ${label}  选择器=${sel}  可见=${vis}`);
    if (!vis) return;
    await inp.click({ timeout: 5000 }).catch(() => {});
    await inp.fill('').catch(() => {});
    await inp.type(String(word).toLowerCase(), { delay: 90 }).catch(() => {});
    await sleep(5000);
    const cands = await page.evaluate(() => {
      const out = [];
      const sels = 'li, [role="option"], [class*="suggest"] *, [class*="autocomplete"] *, [class*="dropdown"] *, [class*="result"] *, [class*="item"]';
      for (const el of document.querySelectorAll(sels)) {
        if (!el.offsetParent) continue;
        const t = (el.innerText || '').trim().replace(/\s+/g, ' ');
        if (!t || t.length > 90) continue;
        if (/^(li|ul|div|span)$/i.test(el.tagName) && el.children.length > 2) continue;
        if (!out.includes(t)) out.push(t);
      }
      return out.slice(0, 40);
    });
    console.log(`候选(${cands.length}):`);
    cands.forEach((t) => console.log('   ', t));
    return cands;
  };

  await dump(FIELDS[carrier].o, originWord, `${carrier} 起运港`);
  await dump(FIELDS[carrier].d, destWord, `${carrier} 目的港`);
} catch (e) {
  console.log('!! 探针异常:', String(e).slice(0, 300));
} finally {
  console.log('(关闭浏览器)');
  await ctx.browser().close().catch(() => {});
}

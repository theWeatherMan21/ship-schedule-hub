// 探针：完整复现 HMM 配方流程并 dump 中间状态（诊断为何 Search Results 0）—— 婉宜 9-29
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';

const [origin = 'Ningbo', destination = 'Istanbul', isoDate = ''] = process.argv.slice(2);
const oR = await resolvePort('hmm', origin);
const dR = await resolvePort('hmm', destination);
console.log('词典:', JSON.stringify(oR), JSON.stringify(dR));

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const { page } = await openPage(ctx, 'https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do');
  await sleep(7000);
  await dismissCookies(page).catch(() => {});
  if (await isBlockPage(page)) console.log('!! 被拦截');

  const pick = async (sel, word, locode) => {
    const inp = page.locator(sel);
    await inp.click({ timeout: 8000 }).catch(() => {});
    await inp.fill('').catch(() => {});
    await inp.type(String(word).toLowerCase(), { delay: 80 }).catch(() => {});
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const hit = await page.evaluate(({ want }) => {
        const wantU = String(want).toUpperCase();
        const els = [...document.querySelectorAll('li, [class*="suggest"] li, [class*="autocomplete"] li, [class*="dropdown"] li')]
          .filter((el) => el.offsetParent && (el.innerText || '').includes('[') && (el.innerText || '').toUpperCase().includes(`[${wantU}]`));
        if (els.length) { const t = els[0].innerText.trim().replace(/\s+/g, ' ').slice(0, 70); els[0].click(); return t; }
        return null;
      }, { want: locode }).catch(() => null);
      if (hit) return hit;
    }
    return null;
  };

  const pO = await pick('#srchPointFrom', oR.text || origin, oR.locode);
  console.log('起点候选点中:', pO);
  await sleep(900);
  const pD = await pick('#srchPointTo', dR.text || destination, dR.locode);
  console.log('终点候选点中:', pD);

  const state = await page.evaluate(() => {
    const v = (id) => document.getElementById(id)?.value ?? '(无)';
    const vis = (id) => { const e = document.getElementById(id); if (!e) return '(无元素)'; const r = e.getBoundingClientRect(); return `visible=${e.offsetParent !== null} rect=${Math.round(r.width)}x${Math.round(r.height)}`; };
    const selects = [...document.querySelectorAll('select')].map((s) => ({
      id: s.id, name: s.name, val: s.value, txt: (s.selectedOptions[0]?.text || '').trim().slice(0, 30), visible: s.offsetParent !== null,
    })).filter((s) => s.visible);
    return {
      from: v('srchPointFrom'), fromCode: v('srchPointFrom_code'),
      to: v('srchPointTo'), toCode: v('srchPointTo_code'),
      date: v('srchSailDate'), dateVis: vis('srchSailDate'),
      selects,
    };
  }).catch((e) => ({ err: String(e) }));
  console.log('填表后状态:', JSON.stringify(state, null, 1));

  await page.evaluate(() => { const b = document.getElementById('btnRetrieve'); if (b) b.click(); });
  let text = '';
  for (let i = 0; i < 14; i++) {
    await sleep(2500);
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/search results \(\d+\)/i.test(text)) break;
  }
  const m = text.match(/search results \((\d+)\)/i);
  console.log('Search Results =', m ? m[1] : '(未出现)');
  const i = text.search(/search results/i);
  console.log('结果区文本样本:\n', text.slice(Math.max(0, i - 200), i + 900));
} catch (e) {
  console.log('!! 探针异常:', String(e).slice(0, 400));
} finally {
  await ctx.browser().close().catch(() => {});
}

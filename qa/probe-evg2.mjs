// 探针12：Evergreen 主页小部件填 Origin/Destination → Search → 跟踪结果（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const [origin = 'Ningbo', destination = 'Istanbul'] = process.argv.slice(2);
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://www.shipmentlink.com/', { reuse: true });
  const page = opened.page;
  await sleep(4000);
  await dismissCookies(page);
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
  const popups = [];
  ctx.on('page', (p) => popups.push(p.url()));

  const fill = async (sel, word) => {
    const inp = page.locator(sel);
    await inp.click({ timeout: 8000 });
    await inp.fill('').catch(() => {});
    await inp.type(word.toLowerCase(), { delay: 80 }).catch(() => {});
    await sleep(2500);
    // 候选（TUF1_AutoCompleteServlet 下拉）——结构未知，抓可见 li
    const picked = await page.evaluate((want) => {
      const els = [...document.querySelectorAll('li, [class*=autocomplete] li, [class*=ui-menu] li, [class*=suggest] *')].filter((el) => {
        const t = (el.innerText || '').trim();
        return el.offsetParent && t.length > 3 && t.toUpperCase().includes(want.toUpperCase()) && el.children.length < 8;
      });
      // 最内层
      if (els.length) {
        let best = els[0];
        for (const e of els) { if (e.contains(best)) best = e; }
        const t = best.innerText.trim().replace(/\s+/g, ' ').slice(0, 60);
        best.click();
        return t;
      }
      return null;
    }, word).catch(() => null);
    console.log(`picked ${sel}:`, JSON.stringify(picked));
    return picked;
  };

  await fill('#txt_schedule_ori_name', origin);
  await sleep(800);
  await fill('#txt_schedule_dest_name', destination);
  await sleep(800);
  const vals = await page.evaluate(() => ({ o: document.getElementById('txt_schedule_ori_name')?.value, d: document.getElementById('txt_schedule_dest_name')?.value, oHid: [...document.querySelectorAll('input[type=hidden]')].map((h) => h.id + '=' + String(h.value).slice(0, 30)).filter((s) => /ori|dest|sched/i.test(s)).join('|') }));
  console.log('VALUES:', JSON.stringify(vals));
  // 点 Search（schedule_btn）
  await page.evaluate(() => document.getElementById('schedule_btn')?.click()).catch(() => {});
  // 等结果/新窗口
  let target = page;
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    if (popups.length) { target = ctx.pages().find((p) => p.url() === popups[popups.length - 1]) || page; }
    const st = await target.evaluate(() => ({ url: location.href, len: document.body?.innerText?.length || 0, has: /SHIP|ETD|ETA|Vessel|Voyage/i.test(document.body?.innerText || '') })).catch(() => null);
    console.log(`t+${(i + 1) * 2.5}s`, JSON.stringify(st).slice(0, 240));
    if (st && (st.len > 2500 && /ETD|Voyage/i.test(st.has ? 'x' : '') || /etd/i.test(st.has ? 'x' : '') || (st.has && st.len > 2500))) break;
  }
  console.log('NAVS:', navs, 'POPUPS:', popups);
  const text = await target.evaluate(() => document.body?.innerText || '').catch(() => '');
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync(`qa/probe-out/evg2-${destination.toLowerCase()}.txt`, `URL: ${target.url()}\n\n${text}`);
  console.log('dumped, len=', text.length);
  await shot(target, `probe-evg2-${destination.toLowerCase()}`);
} catch (e) {
  console.error('FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 500));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);

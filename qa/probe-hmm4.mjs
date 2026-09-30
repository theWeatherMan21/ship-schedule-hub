// 探针7：HMM e-service P2P 页 —— 表单结构 + 提交后监听导航/XHR/结果页（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';

const [origin = 'Ningbo', destination = 'Istanbul'] = process.argv.slice(2);
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { reuse: true });
  const page = opened.page;
  await sleep(5000);
  const xhrs = [];
  page.on('request', (r) => { const u = r.url(); if (/\.do|json|schedule/i.test(u) && !/\.(png|jpg|css|js|ico|woff)/.test(u)) xhrs.push(r.method() + ' ' + u.slice(0, 160)); });
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });

  // P2P 子菜单
  const dom = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input,select,textarea')].map((i) => ({ id: i.id, name: i.name, tag: i.tagName, type: i.type, ph: i.placeholder, val: String(i.value).slice(0, 25) })).filter((x) => x.type !== 'hidden' && x.type !== 'checkbox' && x.type !== 'radio');
    const hiddens = [...document.querySelectorAll('input[type=hidden]')].map((i) => ({ id: i.id, name: i.name, val: String(i.value).slice(0, 25) }));
    const btns = [...document.querySelectorAll('button, a.btn, input[type=submit], img')].map((b) => ({ tag: b.tagName, id: b.id, onclick: String(b.getAttribute('onclick') || '').slice(0, 80), text: (b.innerText || b.alt || '').trim().slice(0, 25) })).filter((x) => x.text || x.onclick);
    const scripts = [...document.querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n');
    const fns = [...scripts.matchAll(/function\s+(\w*[Pp]ortToPort\w*|\w*[Ss]earch\w*)\s*\([^)]*\)\s*\{[\s\S]{0,600}/g)].map((m) => m[0].slice(0, 600));
    const links = [...document.querySelectorAll('a')].map((a) => ({ text: a.innerText.trim().slice(0, 30), href: a.href })).filter((x) => /point|p2p/i.test(x.text + x.href)).slice(0, 8);
    return { url: location.href, title: document.title, inputs, hiddens: hiddens.slice(0, 30), btns: btns.slice(0, 20), fns, links };
  }).catch((e) => ({ err: String(e) }));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/hmm4-dom.json', JSON.stringify(dom, null, 1));
  console.log('URL:', dom.url, '\nINPUTS:', JSON.stringify(dom.inputs, null, 0).slice(0, 1500), '\nFNS:', JSON.stringify(dom.fns, null, 0).slice(0, 1500), '\nLINKS:', JSON.stringify(dom.links));
  console.log('BTNS:', JSON.stringify(dom.btns).slice(0, 1200));

  // 若有 From/To 输入框：填词触发候选
  const fromInp = page.locator('input[type=text]').nth(0);
  const cnt = await page.locator('input[type=text]').count().catch(() => 0);
  console.log('text inputs:', cnt);
  if (cnt >= 2) {
    await fromInp.click().catch(() => {});
    await fromInp.type(origin.toLowerCase(), { delay: 60 }).catch(() => {});
    await sleep(3000);
    const cands = await page.evaluate(() => {
      const lis = [...document.querySelectorAll('li, .ui-menu-item, [class*=suggest] li, ul li')].map((l) => l.innerText.trim().replace(/\s+/g, ' ')).filter((t) => t && t.length > 3 && /ningbo|istanbul/i.test(t));
      return [...new Set(lis)].slice(0, 10);
    }).catch(() => []);
    console.log('CANDS after typing ningbo:', JSON.stringify(cands));
    // 点含 NINGBO 的行
    const clicked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('li, .ui-menu-item, [class*=suggest] li')].find((l) => /ningbo/i.test(l.innerText) && l.offsetParent);
      if (el) { el.click(); return el.innerText.trim().slice(0, 60); }
      return null;
    }).catch(() => null);
    console.log('clicked:', JSON.stringify(clicked));
    await sleep(1500);
    // 第二个输入框
    const toInp = page.locator('input[type=text]').nth(1);
    await toInp.click().catch(() => {});
    await toInp.type(destination.toLowerCase(), { delay: 60 }).catch(() => {});
    await sleep(3000);
    const clicked2 = await page.evaluate(() => {
      const el = [...document.querySelectorAll('li, .ui-menu-item, [class*=suggest] li')].find((l) => /istanbul/i.test(l.innerText) && l.offsetParent);
      if (el) { el.click(); return el.innerText.trim().slice(0, 60); }
      return null;
    }).catch(() => null);
    console.log('clicked2:', JSON.stringify(clicked2));
    await sleep(1500);
    // 回读表单值
    const after = await page.evaluate(() => [...document.querySelectorAll('input')].filter((i) => i.type === 'text' || i.type === 'hidden').map((i) => `${i.id || i.name}=${String(i.value).slice(0, 30)}`).join(' | '));
    console.log('AFTER PICK:', after);
    // 找提交按钮并点（Retrieve/Search）
    xhrs.length = 0; navs.length = 0;
    const fired = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button, a, input[type=submit]')].find((x) => /^(retrieve|search)$/i.test((x.innerText || x.value || '').trim()));
      if (b) { b.click(); return (b.innerText || b.value).trim(); }
      return null;
    }).catch(() => null);
    console.log('submit clicked:', JSON.stringify(fired));
    // 等结果
    for (let i = 0; i < 12; i++) {
      await sleep(2500);
      const st = await page.evaluate(() => ({ url: location.href, len: document.body.innerText.length, hasRow: /\d{1,2}\/\d{1,2}|day|vessel|voyage/i.test(document.body.innerText) })).catch(() => null);
      console.log(`t+${(i + 1) * 2.5}s`, JSON.stringify(st));
      if (st && st.len > 3000) break;
    }
    console.log('XHRS:', JSON.stringify(xhrs.slice(-12), null, 0));
    console.log('NAVS:', JSON.stringify(navs));
    const dump = await page.evaluate(() => {
      const tables = [...document.querySelectorAll('table')].map((tb) => ({
        nRows: tb.querySelectorAll('tr').length,
        head: [...tb.querySelectorAll('tr')][0] ? [...tb.querySelectorAll('tr')[0].querySelectorAll('th,td')].map((c) => c.innerText.trim().slice(0, 22)) : [],
        row1: [...tb.querySelectorAll('tr')][1] ? [...tb.querySelectorAll('tr')[1].querySelectorAll('th,td')].map((c) => c.innerText.trim().replace(/\s+/g, ' ').slice(0, 22)) : [],
      })).filter((t) => t.nRows > 1);
      return { url: location.href, text: document.body.innerText.slice(0, 4000), tables };
    }).catch((e) => ({ err: String(e) }));
    fs.writeFileSync(`qa/probe-out/hmm4-esvc-${destination.toLowerCase()}.json`, JSON.stringify(dump, null, 1));
    console.log('TABLES:', JSON.stringify(dump.tables || []).slice(0, 1800));
    await shot(page, `probe-hmm4-${destination.toLowerCase()}`);
  }
} catch (e) {
  console.error('FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 400));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);

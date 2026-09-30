// 探针5：HMM 专用 —— 监听整页导航，dump 结果 .do 页表格（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { dateFormats, dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate } from '../engine/lib/utils.mjs';
import { setValue, setInputByValueShape, clickByText, fillAutocomplete } from '../engine/lib/dom.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';

const [origin = 'Ningbo', destination = 'Istanbul', isoDate = ''] = process.argv.slice(2);
const qDate = dateFormats(isoDate || new Date().toISOString().slice(0, 10));
const qBase = { date: qDate, skipDate: !isoDate, raw: { origin, destination, date: isoDate } };
const q = new Proxy(qBase, { get(t, k) { if (k === 'originText') return t._o?.text ?? origin; if (k === 'destText') return t._d?.text ?? destination; return t[k]; } });
qBase._o = await resolvePort('hmm', origin);
qBase._d = await resolvePort('hmm', destination);
console.error(`[probe] ports: o=${JSON.stringify(qBase._o)} d=${JSON.stringify(qBase._d)}`);

const H = { dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate, setValue, setInputByValueShape, clickByText, fillAutocomplete, sleep, shot };
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://www.hmm21.com/', { reuse: true });
  const page = opened.page;
  await sleep(2500);
  // 记录所有导航
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
  page.on('popup', (p) => navs.push('POPUP:' + p.url()));

  // ---- 手动逐步执行配方逻辑，加中间检查 ----
  await dismissCookies(page);
  const loc = page.getByRole('textbox', { name: /input a location name/i });
  await loc.first().waitFor({ state: 'visible', timeout: 20000 });
  const rO = await fillAutocomplete(page, loc.nth(0), q.originText, { pick: (t) => portPick(t, q, 'origin') });
  console.error(`[probe] origin picked: ${JSON.stringify(rO)}`);
  const rD = await fillAutocomplete(page, loc.nth(1), q.destText, { pick: (t) => portPick(t, q, 'dest') });
  console.error(`[probe] dest picked: ${JSON.stringify(rD)}`);

  // 表单状态：找 form / 隐藏域
  const formState = await page.evaluate(() => {
    const forms = [...document.querySelectorAll('form')].map((f) => ({ action: f.action, id: f.id, n: f.elements.length }));
    const btns = [...document.querySelectorAll('button, input[type=submit], a')].filter((x) => /gotoporttoport|porttoport/i.test(x.getAttribute('onclick') || '')).map((x) => ({ tag: x.tagName, onclick: x.getAttribute('onclick'), text: (x.innerText || x.value || '').trim().slice(0, 40) }));
    return { forms, btns, url: location.href };
  }).catch((e) => ({ err: String(e) }));
  console.error(`[probe] formState: ${JSON.stringify(formState).slice(0, 500)}`);

  // 点 gotoPortToPort 并等导航
  const navPromise = page.waitForNavigation({ timeout: 30000 }).catch(() => null);
  const fired = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, input[type=submit], a')].find((x) => /gotoPortToPort\(\)/.test(x.getAttribute('onclick') || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  console.error(`[probe] gotoPortToPort fired=${fired}`);
  await navPromise;
  console.error(`[probe] after nav: ${page.url()} navs=${JSON.stringify(navs)}`);
  await sleep(5000);

  const dump = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].map((tb) => ({
      id: tb.id || String(tb.className).slice(0, 40) || '',
      nRows: tb.querySelectorAll('tr').length,
      rows: [...tb.querySelectorAll('tr')].slice(0, 10).map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.innerText.trim().replace(/\s+/g, ' ').slice(0, 50))),
    })).filter((t) => t.nRows);
    return { url: location.href, title: document.title, text: document.body.innerText.slice(0, 6000), tables };
  }).catch((e) => ({ err: String(e) }));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync(`qa/probe-out/hmm2-${destination.toLowerCase()}-dump.json`, JSON.stringify({ navs, dump }, null, 1));
  console.error(`[probe] dumped hmm2 url=${(dump.url || '').slice(0, 130)} tables=${(dump.tables || []).length}`);
  await shot(page, `probe-hmm2-${destination.toLowerCase()}`);
} catch (e) {
  console.error('[probe] FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 400));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);

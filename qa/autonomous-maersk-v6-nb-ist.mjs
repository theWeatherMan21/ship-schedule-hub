// v6：ariaSnapshot 读候选（穿透 Shadow DOM）→ 按 CY 徽标点名 → GET+POST 全抓 → 结果取证
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const q = { origin: 'Ningbo', destination: 'Istanbul', date: '28/09/2026' };
function log(s) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`); }

const ctx = await launch({});
await quietWindow(ctx, 'minimized');

const xhrHits = [];
const page = await ctx.newPage();
page.on('response', async (resp) => {
  try {
    const url = resp.url();
    if (!/schedule|sailing|route|vessel|port-pair|point-to-point|search/i.test(url)) return;
    const body = await resp.text().catch(() => '');
    if (body.length > 50) xhrHits.push({ method: resp.request().method(), url, status: resp.status(), len: body.length, body: body.slice(0, 100000) });
  } catch { /* ignore */ }
});

log('打开 Maersk…');
const resp = await page.goto('https://www.maersk.com/schedules/pointToPoint', { waitUntil: 'domcontentloaded', timeout: 45000 });
log(`HTTP ${resp?.status()}`);
if (await isBlockPage(page)) await waitThroughChallenge(page, 12000);
if (await isBlockPage(page)) { log('❌ 被拦截'); process.exit(1); }
log(`cookie: ${await dismissCookies(page) ? '已接受' : '无弹窗'}`);

// 选候选：ariaSnapshot 解析每个候选全文（穿透 Shadow DOM），CY 徽标优先
async function pickCY(field, word, label) {
  const cands = page.getByRole('option', { name: new RegExp(word, 'i') });
  let n = 0;
  for (let i = 0; i < 24; i++) { n = await cands.count().catch(() => 0); if (n > 0) break; await sleep(500); }
  if (!n) { log(`  ❌ ${label}: 无候选`); return null; }
  let target = -1, targetTxt = '';
  for (let i = 0; i < n; i++) {
    let snap = '';
    try { snap = await cands.nth(i).ariaSnapshot(); } catch { snap = ''; }
    const txt = snap.replace(/\s+/g, ' ').trim();
    log(`  候选[${i}]: ${txt.slice(0, 80)}`);
    if (/CY\b/.test(txt) && target < 0) { target = i; targetTxt = txt; }
  }
  if (target < 0) { target = Math.min(1, n - 1); log(`  （未识别 CY 徽标，取[${target}]）`); }
  await cands.nth(target).click();
  await sleep(1200);
  const val = await field.inputValue().catch(() => '');
  const cyConfirmed = await page.getByText(/container yard/i).first().isVisible().catch(() => false);
  log(`  ✅ ${label} → "${val.slice(0, 45)}" | CY说明框可见=${cyConfirmed}`);
  return { val, cyConfirmed };
}

log('填表…');
const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
await from.waitFor({ state: 'visible', timeout: 20000 });
await from.click(); await from.fill(''); await from.type(q.origin, { delay: 80 });
const pf = await pickCY(from, q.origin, '起运港');

await sleep(800);
const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
await to.click(); await to.fill(''); await to.type(q.destination, { delay: 80 });
const pt = await pickCY(to, q.destination, '目的港');

const date = page.locator('input[placeholder="DD/MM/YYYY"], input[placeholder="dd/mm/yyyy"]').first();
if (await date.count().catch(() => 0)) {
  await date.click(); await date.fill(''); await date.type(q.date, { delay: 60 });
  await page.keyboard.press('Escape').catch(() => {});
  log(`✅ 日期 ${q.date}`);
}

const search = page.getByRole('button', { name: /^\s*search\s*$/i }).first();
await search.waitFor({ state: 'visible', timeout: 10000 });
await search.click();
log('✅ 已点 Search…');

let text = '';
for (let i = 0; i < 14; i++) {
  await sleep(2500);
  text = await page.evaluate(() => document.body.innerText);
  if (/departure|arrival|sailing|transit|no schedules/i.test(text) && text.length > 2500) break;
}
log(`结果页文本 ${text.length} 字符`);

fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/autonomous-maersk-page.txt', text);
const xh = xhrHits.filter(x => x.url.includes('synergy') || /sail/i.test(x.url) || x.method === 'POST');
if (xh.length) {
  fs.writeFileSync('evidence/autonomous-maersk-xhr.json', JSON.stringify(xh, null, 1));
  log(`🛰️  船期相关 XHR ${xh.length} 个：`);
  xh.forEach(x => log(`   ${x.method} ${x.status} ${x.len}B ${x.url.slice(0, 100)}`));
} else log('（无船期相关 XHR）');

const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
const hits = lines.filter(l => /departure|arrival|transit|direct|transshipment|vessel|voyage|sailing|no schedules/i.test(l));
log('---- 结果关键行 ----');
hits.slice(0, 50).forEach(l => console.log('  ', l.slice(0, 140)));

await page.screenshot({ path: 'evidence/autonomous-maersk-result.png' });
log('截图 → evidence/autonomous-maersk-result.png');
await ctx.close().catch(() => {});
process.exit(0);

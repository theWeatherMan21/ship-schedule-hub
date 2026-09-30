// 全自主验证 v3：CY 模式 + 国家消歧 + 抓结果/XHR（爹地指路：MSC/Maersk 要选 CY 才有船期）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const q = {
  origin: 'Shanghai', originHint: 'China',
  destination: 'Rotterdam', destHint: 'Netherlands',
  date: '25/09/2026',
};
function log(s) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`); }

const ctx = await launch({});
await quietWindow(ctx, 'minimized');

const xhrHits = [];
const page = await ctx.newPage();
page.on('response', async (resp) => {
  try {
    const url = resp.url();
    const ct = resp.headers()['content-type'] || '';
    if (resp.request().method() !== 'GET') return;
    if (!/json/i.test(ct)) return;
    if (!/schedule|sailing|route|vessel|port-pair|search|product/i.test(url)) return;
    const body = await resp.text().catch(() => '');
    if (body.length > 100) xhrHits.push({ url, status: resp.status(), len: body.length, body: body.slice(0, 50000) });
  } catch { /* ignore */ }
});

log('打开 Maersk pointToPoint…');
const resp = await page.goto('https://www.maersk.com/schedules/pointToPoint', { waitUntil: 'domcontentloaded', timeout: 45000 });
log(`HTTP ${resp?.status()} 标题: ${await page.title()}`);
if (await isBlockPage(page)) await waitThroughChallenge(page, 12000);
if (await isBlockPage(page)) { log('❌ 被拦截'); process.exit(1); }

log(`cookie: ${await dismissCookies(page) ? '已接受' : '无弹窗'}`);

// 智能选下拉：等「匹配港口名」的候选出现，按国家提示打分
async function pickBest(word, hint) {
  const opts = page.getByRole('option');
  const re = new RegExp(word, 'i');
  let n = 0, matched = -1;
  for (let i = 0; i < 24; i++) {
    n = await opts.count().catch(() => 0);
    matched = -1;
    for (let j = 0; j < n; j++) {
      const t = (await opts.nth(j).innerText().catch(() => '')).trim();
      if (re.test(t)) { matched = j; break; }
    }
    if (matched >= 0) break;
    await sleep(500);
  }
  if (matched < 0) return null;
  let best = -1, bestScore = -99;
  for (let i = 0; i < n; i++) {
    const t = (await opts.nth(i).innerText().catch(() => '')).trim();
    if (!re.test(t)) continue;
    let score = 0;
    if (hint && new RegExp(hint, 'i').test(t)) score += 5;
    if (new RegExp(`^${word}`, 'i').test(t)) score += 2;
    if (/new york|united states|usa\b/i.test(t) && hint !== 'United States') score -= 6;
    log(`  候选[${i}]: ${t.slice(0, 60)} → ${score} 分`);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) return null;
  await opts.nth(best).click();
  return (await opts.nth(best).innerText().catch(() => '?')).trim();
}

log('填表…');
const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
await from.waitFor({ state: 'visible', timeout: 20000 });
await from.click(); await from.fill(''); await from.type(q.origin, { delay: 80 }); await sleep(1500);
const pf = await pickBest(q.origin, q.originHint);
log(pf ? `✅ 起运港 → ${pf}` : '⚠️ 起运港无候选');

await sleep(600);
const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
await to.click(); await to.fill(''); await to.type(q.destination, { delay: 80 }); await sleep(1500);
const pt = await pickBest(q.destination, q.destHint);
log(pt ? `✅ 目的港 → ${pt}` : '⚠️ 目的港无候选');

const date = page.locator('input[placeholder="DD/MM/YYYY"], input[placeholder="dd/mm/yyyy"]').first();
if (await date.count().catch(() => 0)) {
  await date.click(); await date.fill(''); await date.type(q.date, { delay: 60 });
  await page.keyboard.press('Escape').catch(() => {});
  log(`✅ 日期 ${q.date}`);
}

// ★ 关键一步（爹地指路）：切到 CY（Container Yard）模式，SD 无船期
const cyLink = page.getByText(/switch to container yard/i).first();
if (await cyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
  await cyLink.click();
  log('✅ 已切换 CY（Container Yard）模式');
  await sleep(1200);
} else {
  // 备选：可能是 radio/checkbox 或 select
  const cyRadio = page.locator('input[type=radio][value*=CY i], input[type=radio][value*=yard i]').first();
  if (await cyRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cyRadio.check().catch(() => {});
    log('✅ 已选 CY radio');
  } else {
    log('⚠️ 未找到 CY 切换控件（可能默认就是 CY）');
  }
}

const search = page.getByRole('button', { name: /^\s*search\s*$/i }).first();
await search.waitFor({ state: 'visible', timeout: 10000 });
await search.click();
log('✅ 已点 Search，等结果…');

let text = '';
for (let i = 0; i < 12; i++) {
  await sleep(2500);
  text = await page.evaluate(() => document.body.innerText);
  if (/no schedules|departure|arrival|sailing|transit/i.test(text) && text.length > 2500) break;
}
log(`结果页文本 ${text.length} 字符`);

fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/autonomous-maersk-page.txt', text);
if (xhrHits.length) {
  fs.writeFileSync('evidence/autonomous-maersk-xhr.json', JSON.stringify(xhrHits, null, 1));
  log(`🛰️  抓到 ${xhrHits.length} 个 XHR JSON → evidence/autonomous-maersk-xhr.json`);
} else log('（未抓到匹配 XHR）');

const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
const hits = lines.filter(l => /departure|arrival|transit|direct|transshipment|vessel|voyage|sailing|no schedules|CY|SD/i.test(l));
log('---- 结果关键行 ----');
hits.slice(0, 40).forEach(l => console.log('  ', l.slice(0, 140)));

await page.screenshot({ path: 'evidence/autonomous-maersk-result.png' });
log('截图 → evidence/autonomous-maersk-result.png');
await ctx.close().catch(() => {});
process.exit(0);

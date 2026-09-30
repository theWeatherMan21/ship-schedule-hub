// 全自主验证 v2：cookie → 填表（带国家消歧）→ 搜索 → 抓结果 + 抓 XHR JSON
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

// 挂 XHR 监听：搜索后页面自己发的 JSON（二阶段数据源的金矿）
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
    if (body.length > 100) xhrHits.push({ url, status: resp.status(), len: body.length, body: body.slice(0, 30000) });
  } catch { /* ignore */ }
});

log('打开 Maersk pointToPoint…');
const resp = await page.goto('https://www.maersk.com/schedules/pointToPoint', { waitUntil: 'domcontentloaded', timeout: 45000 });
log(`HTTP ${resp?.status()} 标题: ${await page.title()}`);
if (await isBlockPage(page)) await waitThroughChallenge(page, 12000);
if (await isBlockPage(page)) { log('❌ 被拦截'); process.exit(1); }

const accepted = await dismissCookies(page);
log(accepted ? '✅ cookie 已自动接受' : '（无 cookie 弹窗）');

// 智能选下拉项：等列表渲染 → 按「国家提示命中 + 端口名打头 + 排除美国鹿特丹」打分
async function pickBest(word, hint) {
  const opts = page.getByRole('option');
  // 等待「匹配港口名」的候选出现（最多 12s）：页面上常有隐藏的原生 <select> option 干扰计数
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
    if (!new RegExp(word, 'i').test(t)) continue;
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
const pickedFrom = await pickBest(q.origin, q.originHint);
log(pickedFrom ? `✅ 起运港 → ${pickedFrom}` : '⚠️ 起运港无候选');

await sleep(600);
const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
await to.click(); await to.fill(''); await to.type(q.destination, { delay: 80 }); await sleep(1500);
const pickedTo = await pickBest(q.destination, q.destHint);
log(pickedTo ? `✅ 目的港 → ${pickedTo}` : '⚠️ 目的港无候选');

const date = page.locator('input[placeholder="DD/MM/YYYY"], input[placeholder="dd/mm/yyyy"]').first();
if (await date.count().catch(() => 0)) {
  await date.click(); await date.fill(''); await date.type(q.date, { delay: 60 });
  await page.keyboard.press('Escape').catch(() => {});
  log(`✅ 日期 ${q.date}`);
}

const search = page.getByRole('button', { name: /^\s*search\s*$/i }).first();
await search.waitFor({ state: 'visible', timeout: 10000 });
await search.click();
log('✅ 已点 Search，等结果…');

let text = '';
for (let i = 0; i < 10; i++) {
  await sleep(2500);
  text = await page.evaluate(() => document.body.innerText);
  if (/no schedules|sailing|departure|arrival/i.test(text) && text.length > 2500) break;
}
log(`结果页文本 ${text.length} 字符`);

fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/autonomous-maersk-page.txt', text);
if (xhrHits.length) {
  fs.writeFileSync('evidence/autonomous-maersk-xhr.json', JSON.stringify(xhrHits, null, 1));
  log(`🛰️  抓到 ${xhrHits.length} 个 XHR JSON → evidence/autonomous-maersk-xhr.json`);
} else { log('（未抓到匹配的 XHR JSON）'); }

const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
const hits = lines.filter(l => /departure|arrival|transit|direct|transshipment|vessel|voyage|sailing|no schedules/i.test(l));
log('---- 结果关键行 ----');
hits.slice(0, 30).forEach(l => console.log('  ', l.slice(0, 130)));

await page.screenshot({ path: 'evidence/autonomous-maersk-result.png' });
log('截图 → evidence/autonomous-maersk-result.png');
await ctx.close().catch(() => {});
process.exit(0);

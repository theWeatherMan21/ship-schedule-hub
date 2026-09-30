// 全自主验证 v4：accessible-name 匹配候选 + CY 优先（爹地指路：选 CY 才有船期）+ 抓结果/XHR
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
    if (resp.request().method() !== 'GET' || !/json/i.test(ct)) return;
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

// 用 accessible-name 找候选（innerText 在自定义组件上是空的），textContent 读全文，CY 优先
async function pickBest(word, hint) {
  const cands = page.getByRole('option', { name: new RegExp(word, 'i') });
  let n = 0;
  for (let i = 0; i < 24; i++) { n = await cands.count().catch(() => 0); if (n > 0) break; await sleep(500); }
  if (!n) { log('  （无匹配候选）'); return null; }
  let best = -1, bestScore = -99;
  for (let i = 0; i < n; i++) {
    const el = cands.nth(i);
    const t = ((await el.getAttribute('aria-label').catch(() => '')) ||
               (await el.evaluate(e => e.textContent || '').catch(() => ''))).trim();
    if (!t) continue;
    let score = 0;
    if (/\bCY\b/i.test(t)) score += 10;                    // ★ 爹地：CY 才有船期
    else if (/\bSD\b/i.test(t)) score += 2;
    if (hint && new RegExp(hint, 'i').test(t)) score += 5;
    if (new RegExp(`^${word}`, 'i').test(t)) score += 2;
    if (/new york|united states|usa\b/i.test(t) && hint !== 'United States') score -= 6;
    log(`  候选[${i}]: ${t.slice(0, 70)} → ${score} 分`);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) return null;
  const el = cands.nth(best);
  await el.click();
  return ((await el.getAttribute('aria-label').catch(() => '')) || '').trim() || '(CY 候选)';
}

log('填表…');
const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
await from.waitFor({ state: 'visible', timeout: 20000 });
await from.click(); await from.fill(''); await from.type(q.origin, { delay: 80 });
const pf = await pickBest(q.origin, q.originHint);
log(pf ? `✅ 起运港 → ${pf}` : '⚠️ 起运港未选');

await sleep(800);
const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
await to.click(); await to.fill(''); await to.type(q.destination, { delay: 80 });
const pt = await pickBest(q.destination, q.destHint);
log(pt ? `✅ 目的港 → ${pt}` : '⚠️ 目的港未选');

const date = page.locator('input[placeholder="DD/MM/YYYY"], input[placeholder="dd/mm/yyyy"]').first();
if (await date.count().catch(() => 0)) {
  await date.click(); await date.fill(''); await date.type(q.date, { delay: 60 });
  await page.keyboard.press('Escape').catch(() => {});
  log(`✅ 日期 ${q.date}`);
}

// 保险：若还有 "Switch to Container Yard (CY)" 链接就点它
const cyLink = page.getByText(/switch to container yard/i).first();
if (await cyLink.isVisible({ timeout: 2000 }).catch(() => false)) {
  await cyLink.click().catch(() => {});
  log('✅ 追加切换 CY 模式');
  await sleep(1000);
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
const hits = lines.filter(l => /departure|arrival|transit|direct|transshipment|vessel|voyage|sailing|no schedules/i.test(l));
log('---- 结果关键行 ----');
hits.slice(0, 40).forEach(l => console.log('  ', l.slice(0, 140)));

await page.screenshot({ path: 'evidence/autonomous-maersk-result.png' });
log('截图 → evidence/autonomous-maersk-result.png');
await ctx.close().catch(() => {});
process.exit(0);

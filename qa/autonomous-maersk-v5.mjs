// 全自主最终版 v5：type → 等候选 → 点 CY 候选（爹地指路）→ 日期 → 搜索 → 抓船期结果 + XHR
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const q = { origin: 'Shanghai', destination: 'Rotterdam', date: '25/09/2026' };
function log(s) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`); }

const ctx = await launch({});
await quietWindow(ctx, 'minimized');

const xhrHits = [];
const page = await ctx.newPage();
page.on('response', async (resp) => {
  try {
    if (resp.request().method() !== 'GET' || !/json/i.test(resp.headers()['content-type'] || '')) return;
    if (!/schedule|sailing|route|vessel|port-pair|search|product/i.test(resp.url())) return;
    const body = await resp.text().catch(() => '');
    if (body.length > 100) xhrHits.push({ url: resp.url(), status: resp.status(), len: body.length, body: body.slice(0, 80000) });
  } catch { /* ignore */ }
});

log('打开 Maersk pointToPoint…');
const resp = await page.goto('https://www.maersk.com/schedules/pointToPoint', { waitUntil: 'domcontentloaded', timeout: 45000 });
log(`HTTP ${resp?.status()} 标题: ${await page.title()}`);
if (await isBlockPage(page)) await waitThroughChallenge(page, 12000);
if (await isBlockPage(page)) { log('❌ 被拦截'); process.exit(1); }
log(`cookie: ${await dismissCookies(page) ? '已接受' : '无弹窗'}`);

// 点 CY 候选：候选列表 [0]=SD [1]=CY（实测）；点后验证输入框值保留 + 表单出现 Container yard (CY)
async function pickCY(box, word) {
  const cands = page.getByRole('option', { name: new RegExp(word, 'i') });
  let n = 0;
  for (let i = 0; i < 24; i++) { n = await cands.count().catch(() => 0); if (n > 1) break; await sleep(500); }
  if (n < 2) { log(`  ⚠️ ${word}: 候选不足(${n})，取第 1 个`); if (n >= 1) { await cands.nth(0).click(); } return false; }
  await cands.nth(1).click();                    // [1] = CY
  await sleep(1200);
  const val = await box.inputValue().catch(() => '');
  const mode = await page.evaluate(() => (/container yard/i.test(document.body.innerText) ? 'CY' : (/store door/i.test(document.body.innerText) ? 'SD' : '?')));
  log(`  ✅ ${word}: 值="${val.slice(0, 40)}" 模式=${mode}`);
  return mode === 'CY';
}

log('填表…');
const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
await from.waitFor({ state: 'visible', timeout: 20000 });
await from.click(); await from.fill(''); await from.type(q.origin, { delay: 80 });
await pickCY(from, q.origin);

await sleep(800);
const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
await to.click(); await to.fill(''); await to.type(q.destination, { delay: 80 });
await pickCY(to, q.destination);

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
for (let i = 0; i < 14; i++) {
  await sleep(2500);
  text = await page.evaluate(() => document.body.innerText);
  if (/departure|arrival|sailing|transit|no schedules/i.test(text) && text.length > 2500) break;
}
log(`结果页文本 ${text.length} 字符`);

fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/autonomous-maersk-page.txt', text);
if (xhrHits.length) {
  fs.writeFileSync('evidence/autonomous-maersk-xhr.json', JSON.stringify(xhrHits, null, 1));
  log(`🛰️  抓到 ${xhrHits.length} 个 XHR JSON（${Math.max(...xhrHits.map(x => x.len))}B max）`);
} else log('（未抓到匹配 XHR）');

const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
const hits = lines.filter(l => /departure|arrival|transit|direct|transshipment|vessel|voyage|sailing|no schedules/i.test(l));
log('---- 结果关键行 ----');
hits.slice(0, 50).forEach(l => console.log('  ', l.slice(0, 140)));

await page.screenshot({ path: 'evidence/autonomous-maersk-result.png' });
log('截图 → evidence/autonomous-maersk-result.png');
await ctx.close().catch(() => {});
process.exit(0);

// ZIM 定版链路（无头）：主页→Schedules tab→Origin(英文)→Destination(中文"伊斯坦布尔"命中 TRIST)→Search→结果
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import fs from 'node:fs';
function log(s) { const line = `[${new Date().toISOString().slice(11,19)}] ${s}`; console.log(line); (globalThis.__lines ||= []).push(line); }
const xhr = [];
const ctx = await launch({});
await quietWindow(ctx, 'minimized').catch(() => {});
const page = await ctx.newPage();
page.on('response', async r => { try {
  const u = r.url();
  if (!/schedule|sailing|route|vessel|port|search|voyage|point/i.test(u)) return;
  const b = await r.text().catch(() => '');
  if (b.length > 80) xhr.push({ method: r.request().method(), url: u, status: r.status(), len: b.length, body: b.slice(0, 150000) });
} catch {} });

const oPort = await resolvePort('zim', 'Ningbo');
const dPort = await resolvePort('zim', 'Istanbul');
log(`词典: Ningbo→"${oPort.text}" | Istanbul→TRIST(ZIM 候选文本无 LOCODE，按名称匹配 Ambarli)`);

await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => log('ERR ' + String(e).slice(0,80)));
await sleep(6000);
await dismissCookies(page); await sleep(1000);
if (await isBlockPage(page)) { log('❌ 主页被拦'); await ctx.close(); process.exit(1); }
log('主页 HTTP 200');

let tabOk = false;
for (let i = 0; i < 12; i++) {
  const tb = page.getByRole('tab', { name: /^schedules$/i }).first();
  if (await tb.isVisible({ timeout: 1500 }).catch(() => false)) {
    try { await tb.click({ timeout: 5000 }); tabOk = true; break; } catch { }
  } else await sleep(2500);
}
if (!tabOk) {
  log('Schedules tab did not appear (render failure)');
  await page.screenshot({ path: 'evidence/m4-zim.png' }).catch(() => {});
  fs.writeFileSync('evidence/m4-zim.txt', ['[ZIM] tab not found', ...(globalThis.__lines || [])].join('\n'));
  await ctx.close().catch(() => {}); process.exit(1);
}
log('✅ Schedules tab'); await sleep(2500);

// ZIM 候选文本不含 LOCODE（只有 Name, Country），按名称+marine 徽标选：
//   Origin: 主词命中 + 目的国；
//   Destination: Istanbul 系按 ZIM 实际数据 = Ambarli(容器主港, anchor) 优先，其次 Haydarpasa(anchor)。
async function fillCombo(label, typed, matcher) {
  const box = page.getByRole('combobox', { name: new RegExp(`^${label}$`, 'i') }).first();
  await box.click({ timeout: 8000 }).catch(e => { log(`${label} click err ` + String(e).slice(0,60)); });
  await sleep(600);
  await page.keyboard.type(typed, { delay: 80 });
  await sleep(2500);
  const opts = page.getByRole('option');
  let n = 0;
  const texts = [];
  for (let i = 0; i < 30; i++) {
    n = await opts.count().catch(() => 0);
    texts.length = 0;
    for (let j = 0; j < Math.min(n, 12); j++) {
      const t = (await opts.nth(j).innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
      if (t) texts.push(t);
    }
    // 瞬态候选（Searching/Loading）不算，继续等
    const solid = texts.filter(t => !/^search(ing)?\.?\.?$/i.test(t) && !/^loading/i.test(t) && !/^no matches/i.test(t));
    if (solid.length) { texts.splice(0, texts.length, ...solid); break; }
    if (texts.length && texts.every(t => /^no matches/i.test(t))) break;
    await sleep(500);
  }
  texts.forEach((t, i) => log(`  ${label}候选[${i}]: ${t.slice(0, 80)}`));
  if (/no matches/i.test(texts.join(' '))) { log(`❌ ${label}: No matches found`); return false; }
  let target = matcher ? texts.findIndex(matcher) : -1;
  if (target < 0 && texts.length) { target = 0; log(`  ⚠️ 未匹配，取候选[0]`); }
  if (target < 0) { log(`❌ ${label} 无候选`); return false; }
  await opts.nth(target).click({ timeout: 5000 }).catch(() => {});
  await sleep(1200);
  const conf = await box.innerText().catch(() => '');
  log(`✅ ${label} → "${conf.trim().slice(0,60)}"`);
  return true;
}

const okO = await fillCombo('Origin', 'ningbo', t => /^ningbo \(zj\), china/i.test(t));
const okD = await fillCombo('Destination', 'istanbul', t => /istanbul ambarli/i.test(t) || /istanbul - haydarpasa/i.test(t) || /istanbul, turkiye/i.test(t));

let text = '', verdict = 'UNCERTAIN';
const search = page.getByRole('button', { name: /^search$/i }).first();
for (let i = 0; i < 10; i++) { if (!(await search.isDisabled().catch(() => true))) break; await sleep(1000); }
if (await search.isDisabled().catch(() => true)) { log('❌ Search disabled'); verdict = 'EMPTY'; }
else {
  await search.click({ timeout: 8000 }); log('✅ Search');
  // 等 React 结果渲染（最长 60s；深链接首跳可能吃 Akamai Challenge Validation → cp_clge_done 后自动 reload）
  for (let i = 0; i < 24; i++) {
    await sleep(2500);
    const u = page.url();
    const html = await page.evaluate(() => document.documentElement.outerHTML.slice(0, 400)).catch(() => '');
    if (/Challenge Validation/i.test(html)) { log('  （Akamai Challenge Validation，等自动 reload…）'); continue; }
    if (u.includes('point-to-point?')) { text = await page.evaluate(() => document.body.innerText).catch(() => ''); if (text.length > 500) break; }
  }
  log(`URL: ${page.url()}`);
  log(`结果页文本 ${text.length} 字符`);
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const hits = lines.filter(l => /ningbo|istanbul|ambarli|haydarpasa|departure|arrival|eta|etd|transit|voyage|vessel|no schedule|no result|no sailing|no voyage/i.test(l));
  log('---- 结果关键行 ----');
  hits.slice(0, 50).forEach(l => log('  ' + l.slice(0, 140)));
  if (/challenge validation/i.test(text)) { verdict = 'CHALLENGE'; log('❌ 结果页是 Akamai Challenge Validation'); }
  else if (/no schedule|no result|no sailing|no voyage|not found/i.test(text)) verdict = 'EMPTY';
  else if (hits.length >= 3) verdict = 'OK';
}
log(`判定: ${verdict}`);
fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/m4-zim.txt', ['[ZIM 无头链路 v2] Ningbo→Istanbul(TRIST)', ...globalThis.__lines].join('\n'));
await page.screenshot({ path: 'evidence/m4-zim.png' }).catch(() => {});
fs.writeFileSync('evidence/m4-zim-xhr.json', JSON.stringify(xhr.filter(x => x.len > 200).slice(0, 40), null, 1));
log(`证据三件套落盘 evidence/m4-zim.{txt,png,-xhr.json}`);
await ctx.close().catch(() => {}); process.exit(0);

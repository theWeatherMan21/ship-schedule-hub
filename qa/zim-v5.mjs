// ZIM v5：主页 Schedules tab → P2P 表单全链（无头）：Origin/Destination combobox + Search
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import fs from 'node:fs';
function log(s) { console.log(`[${new Date().toISOString().slice(11,19)}] ${s}`); }
const xhr = [];
const ctx = await launch({});
await quietWindow(ctx, 'minimized').catch(() => {});
const page = await ctx.newPage();
page.on('response', async r => { try {
  const u = r.url();
  if (!/schedule|sailing|route|vessel|port|search|voyage/i.test(u)) return;
  const b = await r.text().catch(() => '');
  if (b.length > 80) xhr.push({ method: r.request().method(), url: u, status: r.status(), len: b.length, body: b.slice(0, 150000) });
} catch {} });

const oPort = await resolvePort('zim', 'Ningbo');
const dPort = await resolvePort('zim', 'Istanbul');
log(`词典: Ningbo→"${oPort.text}"(${oPort.source}) Istanbul→"${dPort.text}"(${dPort.source})`);

await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => log('ERR ' + String(e).slice(0,80)));
await sleep(6000);
await dismissCookies(page); await sleep(1000);
if (await isBlockPage(page)) { log('❌ 主页被拦'); await ctx.close(); process.exit(1); }
log('主页 OK');

async function fillCombo(label, typed, which) {
  const box = page.getByRole('combobox', { name: new RegExp(`^${label}$`, 'i') }).first();
  if (!(await box.isVisible({ timeout: 8000 }).catch(() => false))) { log(`❌ ${label} combobox 不可见`); return null; }
  await box.click({ timeout: 5000 }).catch(() => {});
  await sleep(800);
  // 找输入框（combobox 结构：combobox 内含 input，或点开后弹 input）
  let input = page.locator(`input[aria-label="${label}"], input[placeholder*="${label.toLowerCase()}"]`).first();
  if (!(await input.isVisible({ timeout: 1500 }).catch(() => false))) {
    // 点开后当前焦点即在 input 上，直接打字
    input = null;
  }
  if (input) { await input.click().catch(() => {}); }
  await page.keyboard.type(typed, { delay: 80 });
  await sleep(2500);
  // 读候选：combobox 弹层 options
  const opts = page.getByRole('option');
  let n = 0;
  for (let i = 0; i < 20; i++) { n = await opts.count().catch(() => 0); if (n) break; await sleep(400); }
  const texts = [];
  for (let i = 0; i < Math.min(n, 12); i++) {
    let t = (await opts.nth(i).innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
    texts.push(t); log(`  ${label}候选[${i}]: ${t.slice(0, 90)}`);
  }
  const lo = (which === 'o' ? oPort : dPort).locode?.toLowerCase();
  const word = (which === 'o' ? 'Ningbo' : 'Istanbul').toLowerCase();
  let target = -1;
  if (lo) target = texts.findIndex(t => t.toLowerCase().includes(lo));
  if (target < 0) target = texts.findIndex(t => t.toLowerCase().includes(word));
  if (target < 0 && texts.length) target = 0;
  if (target < 0) { log(`❌ ${label} 无候选`); return null; }
  await opts.nth(target).click({ timeout: 5000 }).catch(e => log('点候选失败 ' + String(e).slice(0,60)));
  await sleep(1200);
  const conf = await box.innerText().catch(() => '');
  log(`✅ ${label} 选中候选[${target}]，combobox 文本: "${conf.trim().slice(0,60)}"`);
  return texts[target];
}

await page.getByRole('tab', { name: /^schedules$/i }).first().click({ timeout: 8000 });
log('✅ 已点 Schedules tab'); await sleep(2500);
await fillCombo('Origin', oPort.text, 'o');
await fillCombo('Destination', dPort.text, 'd');

const search = page.getByRole('button', { name: /^search$/i }).first();
for (let i = 0; i < 10; i++) { if (!await search.isDisabled().catch(() => true)) break; await sleep(1000); }
if (await search.isDisabled().catch(() => true)) { log('❌ Search 仍 disabled'); }
else { await search.click({ timeout: 8000 }); log('✅ 已点 Search'); }

let text = '';
for (let i = 0; i < 14; i++) { await sleep(2500); text = await page.evaluate(() => document.body.innerText).catch(() => ''); if (text.length > 2500) break; }
log(`结果页文本 ${text.length} 字符`);
const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
const hits = lines.filter(l => /ningbo|istanbul|ambarli|departure|arrival|eta|etd|transit|voyage|vessel|no schedule|no result|no sailing/i.test(l));
hits.slice(0, 50).forEach(l => log('  ' + l.slice(0, 140)));
log('当前 URL: ' + page.url());

fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/m4-zim.txt', '');
await page.screenshot({ path: 'evidence/m4-zim.png' }).catch(() => {});
fs.writeFileSync('evidence/m4-zim-xhr.json', JSON.stringify(xhr.filter(x => x.len > 200).slice(0, 40), null, 1));
log(`XHR ${xhr.length} 条 → evidence/m4-zim-xhr.json`);
await ctx.close().catch(() => {}); process.exit(0);

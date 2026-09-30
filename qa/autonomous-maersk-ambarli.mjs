// Maersk Ningbo→Ambarli（伊斯坦布尔实际集装箱主港）CY 全链路
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge } from '../engine/lib/utils.mjs';
import fs from 'node:fs';
function log(s) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`); }

const ctx = await launch({});
const page = await ctx.newPage();
const xhr = [];
page.on('response', async r => {
  try { if (/synergy/i.test(r.url())) { const b = await r.text().catch(()=>'' ); if (b.length>50) xhr.push({url:r.url(),status:r.status(),len:b.length,body:b.slice(0,60000)}); } } catch{}
});
log('打开 Maersk…');
await page.goto('https://www.maersk.com/schedules/pointToPoint', { waitUntil: 'domcontentloaded', timeout: 45000 });
log(`cookie: ${await dismissCookies(page)}`);

async function pickCY(box, word) {
  const cands = page.getByRole('option', { name: new RegExp(word, 'i') });
  let n = 0; for (let i = 0; i < 20; i++) { n = await cands.count().catch(()=>0); if (n>0) break; await sleep(500); }
  for (let i = 0; i < n; i++) {
    const s = await cands.nth(i).ariaSnapshot().catch(()=> '');
    if (/CY/.test(s)) { await cands.nth(i).click(); await sleep(1000); return true; }
  }
  return false;
}

const from = page.getByRole('combobox', { name: /from \(city/i }).first();
await from.waitFor({ state: 'visible', timeout: 20000 });
await from.click(); await from.type('Ningbo', { delay: 80 });
await pickCY(from, 'ningbo'); log('✅ Ningbo CY');
await sleep(600);
const to = page.getByRole('combobox', { name: /to \(city/i }).first();
await to.click(); await to.type('Ambarli', { delay: 80 });
await pickCY(to, 'ambarli'); log('✅ Ambarli Port Istanbul CY');
const date = page.locator('input[placeholder="DD/MM/YYYY"], input[placeholder="dd/mm/yyyy"]').first();
if (await date.count().catch(()=>0)) { await date.click(); await date.fill(''); await date.type('28/09/2026', { delay: 50 }); await page.keyboard.press('Escape').catch(()=>{}); }
const search = page.getByRole('button', { name: /^\s*search\s*$/i }).first();
await search.click(); log('✅ Search…');
let text = '';
for (let i = 0; i < 14; i++) { await sleep(2500); text = await page.evaluate(() => document.body.innerText); if (/departure|no schedules/i.test(text) && text.length > 2500) break; }
log(`结果 ${text.length} 字符`);
fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/autonomous-maersk-ambarli.txt', text);
if (xhr.length) fs.writeFileSync('evidence/autonomous-maersk-ambarli-xhr.json', JSON.stringify(xhr, null, 1));
const lines = text.split('\n').map(s=>s.trim()).filter(Boolean);
const hits = lines.filter(l => /departure|arrival|transit|vessel|voyage|no schedules/i.test(l));
log('---- 结果 ----'); hits.slice(0, 30).forEach(l => console.log(' ', l.slice(0, 130)));
await page.screenshot({ path: 'evidence/autonomous-maersk-ambarli.png' });
await ctx.close().catch(()=>{});
process.exit(0);

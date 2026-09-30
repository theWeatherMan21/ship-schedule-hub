// MSC 专项诊断：点 Search 前后页面状态 + 所有按钮快照 + 点击后网络
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({});
const page = await ctx.newPage();
const xhr = [];
page.on('response', async (r) => {
  try { const u = r.url(); if (/api|search|schedule|sailing/i.test(u) && !/onetrust/.test(u)) { const b = await r.text().catch(() => ''); xhr.push({ m: r.request().method(), u, s: r.status(), len: b.length, head: b.slice(0, 300) }); } } catch {}
});

await page.goto('https://www.msc.com/en/search-a-schedule', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(4000);
await dismissCookies(page);
await sleep(1000);

// 填 From
const from = page.getByRole('textbox', { name: /from \(ports or countries\)/i }).first();
await from.waitFor({ state: 'visible', timeout: 15000 });
await from.click(); await from.fill(''); await from.type('Ningbo', { delay: 70 });
await sleep(2500);
const fromCands = page.locator('[role="option"], li').filter({ hasText: /NINGBO/i });
const n1 = await fromCands.count();
console.log('from 候选数:', n1);
for (let i = 0; i < Math.min(n1, 5); i++) console.log('  ', (await fromCands.nth(i).textContent()).trim().slice(0, 80));
if (n1) { await fromCands.nth(Math.floor(n1/2)).click({ timeout: 5000 }).catch(async () => { for (let i = 0; i < n1; i++) { if (await fromCands.nth(i).isVisible().catch(() => false)) { await fromCands.nth(i).click({ timeout: 5000 }).catch(() => {}); break; } } }); await sleep(800); }

// 填 To
const to = page.getByRole('textbox', { name: /to \(ports or countries\)/i }).first();
await to.click(); await to.fill(''); await to.type('Istanbul', { delay: 70 });
await sleep(2500);
const toCands = page.locator('[role="option"], li').filter({ hasText: /ISTANBUL|TURKIYE|TURKEY/i });
const n2 = await toCands.count();
console.log('to 候选数:', n2);
for (let i = 0; i < Math.min(n2, 6); i++) console.log('  ', (await toCands.nth(i).textContent()).trim().slice(0, 80));
if (n2) { await toCands.nth(Math.floor(n2/2)).click({ timeout: 5000 }).catch(async () => { for (let i = 0; i < n2; i++) { if (await toCands.nth(i).isVisible().catch(() => false)) { await toCands.nth(i).click({ timeout: 5000 }).catch(() => {}); break; } } }); await sleep(800); }

// 日期
const date = page.getByRole('textbox', { name: /dd\/MM\/yyyy/i }).first();
await date.click();
await date.fill(''); await date.type('28/09/2026', { delay: 50 });
await page.keyboard.press('Escape');
await sleep(600);
console.log('日期值:', await date.inputValue().catch(() => '?'));

// 枚举所有 Search 按钮
const btns = page.getByRole('button', { name: /search/i });
const nb = await btns.count();
console.log('Search 按钮数:', nb);
for (let i = 0; i < nb; i++) {
  const b = btns.nth(i);
  const vis = await b.isVisible().catch(() => false);
  const box = await b.boundingBox().catch(() => null);
  console.log(`  [${i}] visible=${vis} box=${JSON.stringify(box)}`);
}
await page.screenshot({ path: 'evidence/m4-msc-before-search.png' });

// 点最后一个可见的 Search
let clicked = -1;
for (let i = nb - 1; i >= 0; i--) { if (await btns.nth(i).isVisible().catch(() => false)) { await btns.nth(i).click({ timeout: 3000 }).catch(e => console.log('click err', String(e).slice(0, 80))); clicked = i; break; } }
console.log('clicked Search idx:', clicked);
await sleep(20000);

const text = await page.evaluate(() => document.body.innerText);
console.log('结果文本长度:', text.length);
console.log('URL:', page.url());
const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
console.log('---- 页面文本前 60 行 ----');
lines.slice(0, 60).forEach(l => console.log('  ', l.slice(0, 130)));
console.log('---- XHR ----');
xhr.forEach(x => console.log(' ', x.m, x.s, x.len, x.u.slice(0, 120)));
await page.screenshot({ path: 'evidence/m4-msc-after-search.png' });
fs.writeFileSync('qa/msc-diag.txt', text);
await ctx.close().catch(() => {});
process.exit(0);

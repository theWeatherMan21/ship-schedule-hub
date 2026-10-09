
// ZIM 正路：Locations API 选准港口（挑 MARINE）→ 表单选择 → 录下船期接口
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
const KEY = '9d63cf020a4c4708a7b0ebfe39578300';
const calls = [], bodies = [];
page.on('request', (r) => { if (/digital/i.test(r.url())) calls.push(r.method() + ' ' + r.url()); });
page.on('response', async (r) => { if (/digitalSchedules/i.test(r.url())) { let b = ''; try { b = (await r.text()).slice(0, 900); } catch {} bodies.push({ u: r.url(), s: r.status(), b }); } });
await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
await H.dismissCookies(page); await sleep(1200);

// ① 用 Locations API 选"能装船"的那个
const resolve = async (word, wantCountry) => {
  const r = await page.evaluate(async ({ k, w }) => {
    const u = `https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${k}&searchTerm=${encodeURIComponent(w)}&pageSize=100`;
    const resp = await fetch(u, { headers: { accept: 'application/json' } });
    const j = await resp.json().catch(() => null);
    return (j && j.results) || [];
  }, { k: KEY, w: word });
  const marine = r.filter((x) => /MARINE/.test(x.locationType || ''));
  const pick = marine.find((x) => wantCountry && new RegExp(wantCountry, 'i').test(x.country)) || marine[0] || r[0];
  console.log(`   Locations(${word}) → ${r.length} 条，MARINE ${marine.length} 条；选中: ${pick ? pick.name + ' [' + pick.code + '] ' + pick.country : '无'}`);
  return pick;
};
const o = await resolve('Ningbo', 'China');
const d = await resolve('Ashdod', 'Israel');

// ② 表单里选它（点文本完全匹配那一项）
const choose = async (ph, name, code) => {
  const box = page.getByPlaceholder(ph).first();
  await box.click({ timeout: 8000 }).catch(() => {});
  await sleep(400);
  await page.keyboard.type(name.split(' ')[0], { delay: 90 });
  await sleep(3500);
  const opts = page.getByRole('option');
  const n = await opts.count().catch(() => 0);
  for (let j = 0; j < n; j++) {
    const t = ((await opts.nth(j).textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const nm = name.replace(/\s*\(.*\)$/, '');
    if (new RegExp('^' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t)) { await opts.nth(j).click({ timeout: 5000 }).catch(() => {}); console.log(`   [${ph}] 选中 "${t}"`); return t; }
  }
  console.log(`   [${ph}] 没匹配到，候选: ` + JSON.stringify(all));
  return null;
};
var all = [];
await choose('Origin', o ? o.name : 'Ningbo', o ? o.code : '');
all = [];
await choose('Destination', d ? d.name : 'Ashdod', d ? d.code : '');

const btn = page.getByRole('button', { name: /^search$/i }).first();
await btn.click({ timeout: 8000 }).catch(() => {});
await sleep(14000);
console.log('');
console.log('══ 站点调用的 digital* 接口 ══');
for (const c of [...new Set(calls)].slice(0, 10)) console.log('   ' + c.slice(0, 230));
console.log('');
console.log('══ 船期接口响应 ══');
for (const b of bodies.slice(0, 3)) console.log('   HTTP ' + b.s + '\n   ' + b.u.slice(0, 230) + '\n   ' + b.b.replace(/\s+/g, ' ').slice(0, 500));
console.log('');
console.log('URL: ' + page.url().slice(0, 200));
const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
console.log('页面文本 ' + txt.length + ' 字');
const deep = await page.evaluate(() => { const out = []; const walk = (r) => { for (const el of r.querySelectorAll('*')) { if (el.shadowRoot) walk(el.shadowRoot); if (!el.children.length && el.textContent && el.textContent.trim()) { const t = el.textContent.replace(/\s+/g, ' ').trim(); if (t.length < 100) out.push(t); } } }; try { walk(document); } catch {} return out; });
const rows = deep.filter((t) => /vessel|voyage|ETD|ETA|transit|\d{2}-[A-Z][a-z]{2}/i.test(t));
console.log('深层相关行 ' + rows.length + ' 条:');
for (const t of rows.slice(0, 25)) console.log('      ' + t);
await ctx.close().catch(() => {});

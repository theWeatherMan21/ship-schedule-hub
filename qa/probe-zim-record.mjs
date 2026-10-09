
// 录下 ZIM 自己搜船期时到底调了什么接口（结果是唯一权威）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
const calls = [];
page.on('request', (r) => { const u = r.url(); if (/apigw\.zim|digitalSchedules|PointToPoint|schedule/i.test(u)) calls.push({ m: r.method(), u, post: (r.postData() || '').slice(0, 300) }); });
const bodies = [];
page.on('response', async (r) => {
  const u = r.url();
  if (/apigw\.zim|digitalSchedules|PointToPoint/i.test(u)) {
    let body = '';
    try { body = (await r.text()).slice(0, 700); } catch { body = '(读不到)'; }
    bodies.push({ u, status: r.status(), body });
  }
});
await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
await H.dismissCookies(page); await sleep(1200);
const fill = async (ph, word, pickRe) => {
  const box = page.getByPlaceholder(ph).first();
  await box.click({ timeout: 8000 }).catch(() => {});
  await sleep(400);
  await page.keyboard.type(word, { delay: 90 });
  await sleep(3000);
  const opts = page.getByRole('option');
  const n = await opts.count().catch(() => 0);
  for (let j = 0; j < Math.min(n, 12); j++) {
    const t = ((await opts.nth(j).textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (new RegExp(pickRe, 'i').test(t)) { await opts.nth(j).click({ timeout: 5000 }).catch(() => {}); return t; }
  }
  return '(未匹配)';
};
console.log('Origin 选中: ' + await fill('Origin', 'Ningbo', 'Ningbo'));
console.log('Dest 选中:   ' + await fill('Destination', 'Ashdod', 'Ashdod'));
const btn = page.getByRole('button', { name: /^search$/i }).first();
await btn.click({ timeout: 8000 }).catch(() => {});
await sleep(12000);
console.log('');
console.log('══ 站点自己发出的接口调用 ' + calls.length + ' 条 ══');
for (const c of calls.slice(0, 6)) console.log('   ' + c.m + ' ' + c.u.slice(0, 190) + (c.post ? '\n      POST: ' + c.post : ''));
console.log('');
console.log('══ 接口响应 ' + bodies.length + ' 条 ══');
for (const b of bodies.slice(0, 4)) console.log('   HTTP ' + b.status + ' ' + b.u.slice(0, 140) + '\n      ' + b.body.replace(/\s+/g, ' ').slice(0, 400));
const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
console.log('');
console.log('结果页文本 ' + txt.length + ' 字，前 400: ' + txt.replace(/\s+/g, ' ').slice(0, 400));
await ctx.close().catch(() => {});

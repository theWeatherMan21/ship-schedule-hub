// Maersk 截单探源 v2：打开船期结果 → 点「Show details」→ 抓网络请求找 cut-off 来源
import fs from 'node:fs';
import { launch, openPage, quietWindow, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');

// ① 用引擎自带解析器拿正确 geo（城市名 → GEO_ID/rkst）
const { maerskResolve } = await import('../engine/fastpath.mjs');
await sleep(8000);
let rv = null;
for (const [oW, oC, dW, dC] of [['Ningbo', 'CNNGB', 'Ambarli', 'TRAMB']]) {
  rv = await maerskResolve(page, oW, dW, oC, dC).catch((e) => ({ error: String(e).slice(0, 100) }));
  console.log('[probe] try', oW, '→', dW, '| o:', JSON.stringify(rv && rv.o).slice(0, 140), '| dList:', (rv && rv.dList || []).map((x) => x.rkst + '/' + x.country).join(','));
}
console.log('[probe] resolve:', JSON.stringify(rv && (rv.error || { o: rv.o, d0: rv.dList && rv.dList[0] })).slice(0, 400));
const d0 = (rv && rv.dList && rv.dList[0]) || {};
const DEEP = `https://www.maersk.com/schedules/pointToPoint?from=${(rv && rv.o && rv.o.geo) || ''}&to=${d0.geo || ''}` +
  `&fromRkstCode=${(rv && rv.o && rv.o.rkst) || ''}&toRkstCode=${d0.rkst || ''}` +
  '&containerIsoCode=45G1&fromServiceMode=CY&toServiceMode=CY&numberOfWeeks=4&dateType=D&date=2026-10-15&dateTo=2026-12-10&vesselFlag=';
console.log('[probe] 深链:', DEEP.slice(0, 220));
const hits = [];
const reqs = [];
page.on('request', (r) => {
  if (/deadlines|routings-queries/i.test(r.url())) {
    reqs.push({ method: r.method(), url: r.url(), post: (r.postData() || '').slice(0, 900), headers: JSON.stringify(r.headers()).slice(0, 600) });
  }
});
await page.goto(DEEP, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('goto err', String(e).slice(0, 110)));
page.on('response', async (res) => {
  try {
    const u = res.url();
    if (!/maersk/i.test(u)) return;
    if (/\.(js|css|png|jpe?g|svg|woff2?|ico|gif|webp)(\?|$)/i.test(u)) return;
    let body = '';
    try { body = await res.text(); } catch { return; }
    const interesting = /cutoff|cut ?off|deadline|closing/i.test(body);
    hits.push({ url: u, status: res.status(), len: body.length, interesting, sample: interesting ? body.slice(0, 1200) : body.slice(0, 140) });
  } catch { /* ignore */ }
});

await quietWindow(ctx, 'minimized').catch(() => {});
console.log('[probe] 结果页已打开（静默）…');
await sleep(15000);

const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\n{2,}/g, '\n')).catch(() => '');
console.log('[probe] 页面文本长度', text.length, '| 有结果?', /Vessel\/Voyage|Departure/i.test(text));
console.log('[probe] 文本已含截单?', /cut ?off|deadline|closing/i.test(text));

const btnTexts = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, a, [role=button], summary').forEach((el) => {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t && t.length < 45 && /detail|show|more|cut|deadline|time/i.test(t)) out.push(t);
  });
  return [...new Set(out)].slice(0, 30);
}).catch(() => []);
console.log('[probe] 候选按钮:', JSON.stringify(btnTexts));

let clicked = '';
for (const name of [/more details/i, /show details/i, /^details$/i, /view details/i, /明细/i]) {
  try {
    const b = page.getByRole('button', { name }).first();
    if (await b.isVisible({ timeout: 2500 }).catch(() => false)) {
      await b.click({ timeout: 5000 });
      clicked = String(name);
      break;
    }
  } catch { /* next */ }
}
if (!clicked) {
  try {
    const el = page.getByText(/show details/i).first();
    if (await el.isVisible({ timeout: 2500 }).catch(() => false)) { await el.click({ timeout: 5000 }); clicked = 'text:show details'; }
  } catch { /* ignore */ }
}
console.log('[probe] 点击结果:', clicked || '(未点到)');
await sleep(10000);

const after = await page.evaluate(() => (document.body?.innerText || '').replace(/\n{2,}/g, '\n')).catch(() => '');
console.log('[probe] 点击后文本长度', after.length, '| 含截单?', /cut ?off|deadline|closing/i.test(after));
const idx = after.search(/cut ?off|deadline|closing/i);
if (idx >= 0) console.log('[probe] 截单区上下文:\n', JSON.stringify(after.slice(Math.max(0, idx - 400), idx + 700)));

console.log('\n[probe] ===== 网络请求（共 ' + hits.length + '）=====');
for (const h of hits) console.log(`- ${h.status} len=${h.len} ${h.interesting ? '⭐CUT' : ''} ${h.url.slice(0, 145)}`);
const cutHits = hits.filter((x) => x.interesting);
console.log('\n[probe] ===== 含截单词的响应（' + cutHits.length + '）=====');
for (const h of cutHits) {
  console.log('>>>', h.url.slice(0, 170));
  console.log(h.sample.replace(/\s+/g, ' ').slice(0, 1100));
  console.log();
}
console.log('\n[probe] ===== 关键请求（routings-queries / deadlines）=====');
for (const r of reqs) {
  console.log(`>>> ${r.method} ${r.url.slice(0, 130)}`);
  if (r.post) console.log('    body:', r.post);
  console.log('    headers:', r.headers);
}
fs.writeFileSync('/tmp/maersk-cutoff-probe.json', JSON.stringify({ textLen: text.length, afterLen: after.length, clicked, btnTexts, reqs, hits }, null, 1));
console.log('[probe] 落盘 /tmp/maersk-cutoff-probe.json');
await ctx.close().catch(() => {});
process.exit(0);

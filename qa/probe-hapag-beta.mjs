// Hapag 新版 Tracking BETA 探针（/solutions/tracking/ SPA）—— 填搜索框 + 回车 + 抓网络请求找 API
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'HLCUTS12609DETN4';
const r = await launchHeadedQuiet();
console.log('mode:', r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());

const netlog = [];
page.on('response', (resp) => {
  const u = resp.url();
  if (/\.(js|css|png|jpe?g|svg|woff2?|ico)($|\?)/i.test(u)) return;
  if (/json|api|search|track|graphql|solutions/i.test(u)) netlog.push(`${resp.status()} ${u.slice(0, 190)}`);
});

try {
  const resp = await page.goto('https://www.hapag-lloyd.com/solutions/tracking/#/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch((e) => { console.log('goto err', String(e).slice(0, 110)); return null; });
  console.log('http:', resp ? resp.status() : null);
  await sleep(6000);

  let ok = false;
  for (let i = 0; i < 40; i++) {
    const n = await page.locator('input[type="search"]').count().catch(() => 0);
    if (n > 0) { ok = true; console.log(`search box ready @${i * 2}s (count=${n})`); break; }
    await sleep(2000);
  }

  if (!ok) {
    const t = await page.evaluate(() => ({ title: document.title, len: (document.body.innerText || '').length, text: (document.body.innerText || '').slice(0, 900) })).catch(() => ({}));
    console.log('NO SEARCH BOX:', JSON.stringify(t).slice(0, 1100));
  } else {
    await page.fill('input[type="search"]', BL).catch((e) => console.log('fill err', String(e).slice(0, 90)));
    console.log('readback:', await page.locator('input[type="search"]').first().inputValue().catch(() => ''));
    await sleep(3500);   // 留时间给 Turnstile
    await page.press('input[type="search"]', 'Enter');
    console.log('pressed Enter at', new Date().toISOString().slice(11, 19));

    let done = false;
    for (let i = 0; i < 44 && !done; i++) {
      await sleep(2500);
      const info = await page.evaluate(() => ({ url: location.href, len: (document.body.innerText || '').length, text: (document.body.innerText || '').slice(0, 4200) })).catch(() => ({ url: '', len: 0, text: '' }));
      if (i % 2 === 0) console.log(`[${i}] len=${info.len} url=${info.url.slice(0, 120)}`);
      const hit = /no data found|not found|no result|invalid|not available|error|unable to|could not/i.test(info.text);
      if (hit && i > 2) { console.log('══ 错误/否定命中 ══'); console.log(info.text.slice(0, 3000)); done = true; }
      else if (i > 8 && info.len > 2200 && info.text !== info.text.slice(0, 0)) { console.log('══ 结果文本 DUMP ══'); console.log(info.text.slice(0, 3800)); done = true; }
    }
    if (!done) console.log('timeout waiting for visible change');
  }
} finally {
  console.log('── NETLOG (' + netlog.length + ') ──');
  const seen = new Set();
  for (const l of netlog) { if (!seen.has(l)) { seen.add(l); console.log('  ' + l); } }
  await ctx.close().catch(() => {});
  console.log('closed');
}

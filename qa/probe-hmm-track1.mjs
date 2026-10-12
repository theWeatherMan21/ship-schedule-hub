// HMM 提单追踪 · 第 1 步：从首页点「Track & Trace」页签，看它跳哪、发什么请求
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const reqs = [];
page.on('request', (r) => { const u = r.url(); if (!/\.(png|jpg|gif|css|woff|svg|ico)(\?|$)/i.test(u)) reqs.push(`${r.method()} ${u}${r.postData() ? ' | ' + String(r.postData()).slice(0, 300) : ''}`); });
page.on('response', async (r) => {
  const u = r.url();
  if (/trace|Trace|track|Track/i.test(u)) { try { const t = await r.text(); fs.appendFileSync('/tmp/hmm-trace-resp.txt', `\n=== ${r.status()} ${u}\n${t.slice(0, 3000)}\n`); } catch {} }
});
try {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(3500);
  // 页面里所有和 trace 有关的字符串
  const html = await page.content();
  const hits = [...new Set((html.match(/[^\s"'<>()]*[Tt]race[^\s"'<>()]*/g) || []))].slice(0, 40);
  console.log('--- html 里含 trace 的串 ---'); for (const h of hits) console.log('  ' + h);
  fs.writeFileSync('/tmp/hmm-home.html', html);
  // 点 Track & Trace 页签
  const clickRes = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('a,button,li,div,span')].filter((e) => /^\s*Track\s*&\s*Trace\s*$/i.test((e.textContent || '').trim()));
    if (!cands.length) return { found: 0 };
    const el = cands[0];
    const info = { found: cands.length, tag: el.tagName, onclick: el.getAttribute('onclick') || '', href: el.getAttribute('href') || '', parentOnclick: el.parentElement?.getAttribute('onclick') || '' };
    el.click();
    return info;
  });
  console.log('--- 点 Track & Trace ---', JSON.stringify(clickRes));
  await sleep(4000);
  const after = await page.evaluate(() => ({ url: location.href, title: document.title, head: (document.body?.innerText || '').slice(0, 800) }));
  console.log('AFTER URL:', after.url, '| TITLE:', after.title);
  console.log('--- AFTER BODY ---'); console.log(after.head);
  console.log('--- REQS(过滤静态) ---'); for (const r of [...new Set(reqs)].slice(-40)) console.log('  ' + r);
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
await ctx.close().catch(() => {});
process.exit(0);

// HMM 提单追踪 · 第 0 步侦察：找 Track & Trace 入口页 + 抓它加载时的 XHR
// 用法：bash qa/quiet-probe.sh qa/probe-hmm-track0.mjs   （或 node 直接跑，静默靠 browser.mjs 的强制无头）
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const OUT = '/tmp/hmm-track0.json';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const xhrs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/\.(do|json|ajax|api)|track|Trace|trace/i.test(u)) {
    xhrs.push({ m: r.method(), u, post: (r.postData() || '').slice(0, 400) });
  }
});
try {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(4000);
  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    len: (document.body?.innerText || '').length,
    head: (document.body?.innerText || '').slice(0, 600),
    links: [...document.querySelectorAll('a')].map((a) => ({ t: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), h: a.getAttribute('href') || '' }))
      .filter((x) => /track|trace|bl|b\/l|cargo|e-service|제|화물/i.test(x.t + ' ' + x.h)),
  }));
  console.log('TITLE:', info.title, '| URL:', info.url, '| bodyLen:', info.len);
  console.log('--- HEAD ---'); console.log(info.head);
  console.log('--- LINKS ---'); for (const l of info.links) console.log(`  ${l.t}  ->  ${l.h}`);
  console.log('--- XHR ---'); for (const x of xhrs.slice(0, 40)) console.log(`  ${x.m} ${x.u}  ${x.post ? '| ' + x.post.slice(0, 160) : ''}`);
  fs.writeFileSync(OUT, JSON.stringify({ info, xhrs }, null, 1));
} catch (e) {
  console.log('ERR', String(e).slice(0, 300));
}
await ctx.close().catch(() => {});
process.exit(0);

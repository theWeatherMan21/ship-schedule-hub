// ZIM 提单追踪 —— 真跑一次（无头，静默）+ 抓 apigw 请求与页面配置
// 用法：node qa/probe-zim-track-query.mjs [号码]
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const NUM = process.argv[2] || 'TGBU4028001';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const log = [];

page.on('request', (r) => {
  const u = r.url();
  if (/apigw\.zim\.com/.test(u)) {
    log.push({ dir: 'REQ', method: r.method(), u, post: (r.postData() || '').slice(0, 500) });
  }
});
page.on('response', async (r) => {
  const u = r.url();
  if (/apigw\.zim\.com/.test(u)) {
    let body = '';
    try { body = (await r.text()).slice(0, 6000); } catch (e) { body = 'ERR ' + String(e).slice(0, 80); }
    log.push({ dir: 'RES', status: r.status(), u, body });
  }
});

const url = `https://www.zim.com/tools/track-a-shipment?consnumbers=${encodeURIComponent(NUM)}`;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch (e) { console.log('GOTO ERR', String(e).slice(0, 160)); }
await sleep(12000);

// 页面配置对象：找 window 上带 SiTracker / apigw 的配置
const cfg = await page.evaluate(() => {
  const out = {};
  const html = document.documentElement.outerHTML;
  for (const needle of ['SiTracker', 'trackShipment', 'getTracing', 'digitalSiTracker', 'apigw.zim.com']) {
    const i = html.indexOf(needle);
    out['html_' + needle] = i >= 0 ? html.slice(Math.max(0, i - 200), i + 400) : null;
  }
  // 收集所有 script src
  out.scripts = [...document.querySelectorAll('script[src]')].map((s) => s.src).slice(0, 40);
  // 找 window 顶层对象里含 SiTracker 字符串的
  try {
    const deep = (o, d = 0) => {
      if (d > 3 || !o || typeof o !== 'object') return null;
      for (const k of Object.keys(o)) {
        try {
          const v = o[k];
          if (typeof v === 'string' && /SiTracker|trackShipment|getTracing/i.test(v)) return { [k]: v.slice(0, 300) };
          if (v && typeof v === 'object') { const r = deep(v, d + 1); if (r) return { [k]: r }; }
        } catch { /* ignore */ }
      }
      return null;
    };
    out.windowHit = deep(window);
  } catch (e) { out.windowHitErr = String(e).slice(0, 120); }
  return out;
}).catch((e) => ({ err: String(e).slice(0, 200) }));

console.log('### CONFIG', JSON.stringify(cfg, null, 1).slice(0, 4000));
console.log('### NET');
for (const h of log) console.log(JSON.stringify(h).slice(0, 4000));
fs.writeFileSync('/tmp/zim-track-recon.json', JSON.stringify({ cfg, log }, null, 1));
console.log('### saved /tmp/zim-track-recon.json');
await ctx.close().catch(() => {});
process.exit(0);

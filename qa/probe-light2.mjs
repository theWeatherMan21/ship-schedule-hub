
// zim / msc 的轻量页测试
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());

// ZIM：轻量页 + 两条接口
let t = Date.now();
let r = await page.goto('https://www.zim.com/__probe__', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
console.log('ZIM 轻量页: HTTP ' + (r ? r.status() : 'ERR') + ' ' + ((Date.now() - t) / 1000).toFixed(1) + 's');
t = Date.now();
const z = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const loc = await fetch(`https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${key}&searchTerm=Hamburg&pageSize=100`).then((x) => x.json()).catch((e) => ({ err: String(e) }));
  const marine = (loc.results || []).filter((x) => /MARINE/i.test(x.locationType || ''));
  if (!marine.length) return { step: 'resolve', got: JSON.stringify(loc).slice(0, 100) };
  const code = marine[0].code;
  const j = await fetch(`https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent('CNNGB;10')}&PortDestinationCode=${encodeURIComponent(code)}&Direction=true&FromDate=10-October-2026&WeeksAhead=12&CountryCode=US&CargoType=true`).then((x) => x.json()).catch(() => null);
  return { step: 'ok', code, mid: ((j && j.midPoints) || []).length };
});
console.log('ZIM 接口: ' + JSON.stringify(z) + '  ' + ((Date.now() - t) / 1000).toFixed(1) + 's');

// MSC：轻量页 + 它的站内接口（先看 mscInPage 用的端点）
t = Date.now();
r = await page.goto('https://www.msc.com/__probe__', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
console.log('MSC 轻量页: HTTP ' + (r ? r.status() : 'ERR') + ' ' + ((Date.now() - t) / 1000).toFixed(1) + 's');
const msc = await page.evaluate(async () => {
  const u = 'https://www.msc.com/api/feature/tools/PortToPortSchedule?fromPort=CNNGB&toPort=DEHAM&fromDate=2026-10-10&toDate=2026-10-24&language=en&page=1&pageSize=20';
  const resp = await fetch(u, { headers: { accept: 'application/json' } });
  const t2 = await resp.text();
  return { status: resp.status, head: t2.slice(0, 90) };
});
console.log('MSC 接口: HTTP ' + msc.status + ' ' + msc.head);
await ctx.close().catch(() => {});

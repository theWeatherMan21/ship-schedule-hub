
// ZIM：宁波→Hamburg 到底怎么回事（接口直问）
import { launch } from '../engine/browser.mjs';
import { sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(3000);
const out = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const r1 = await fetch(`https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${key}&searchTerm=DEHAM&pageSize=100`).then((r) => r.json()).catch((e) => ({ err: String(e) }));
  const r2 = await fetch(`https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${key}&searchTerm=Hamburg&pageSize=100`).then((r) => r.json()).catch((e) => ({ err: String(e) }));
  const list1 = (r1.results || []).map((x) => `${x.code}|${x.name}|${x.locationType}`);
  const list2 = (r2.results || []).filter((x) => /MARINE/i.test(x.locationType || '')).map((x) => `${x.code}|${x.name}|${x.country}`);
  // 用不同后缀组合查船期
  const tries = [];
  for (const oc of ['CNNGB;10', 'CNNGB;0']) {
    for (const dc of ['DEHAM;10', 'DEHAM;0']) {
      const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(oc)}&PortDestinationCode=${encodeURIComponent(dc)}&Direction=true&FromDate=10-October-2026&WeeksAhead=12&CountryCode=US&CargoType=true`;
      const j = await fetch(u).then((r) => r.json()).catch(() => null);
      tries.push(`${oc}→${dc}: ${j ? 'midPoints=' + ((j.midPoints || []).length) + ' isSuccess=' + j.isSuccess + ' ' + JSON.stringify(j).slice(0, 90) : 'null'}`);
    }
  }
  return { list1, list2, tries };
});
console.log('DEHAM 解析:', JSON.stringify(out.list1));
console.log('Hamburg MARINE 候选:', JSON.stringify(out.list2));
console.log('各后缀组合试查:');
for (const t of out.tries) console.log('   ' + t);
await ctx.close().catch(() => {});

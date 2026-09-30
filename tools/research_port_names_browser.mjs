// 浏览器上下文调研：在被反爬保护的站点里直接调它自己的港口查询接口（婉宜 9-23）
// 直连被 Akamai 拦（403），但页面上下文里 fetch 能过（带站点 cookie + 指纹）
import { launchHeadedQuiet, sleep, windowBounds, PROJECT_ROOT } from '../engine/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = (f) => path.join(PROJECT_ROOT, 'docs', f);

const KW = ['Nansha', 'Shenzhen', 'Shekou', 'Yantian', 'Shanghai', 'Ningbo',
            'Qingdao', 'Tianjin', 'Xiamen', 'Dalian', 'Istanbul', 'Rotterdam'];

const { ctx, mode } = await launchHeadedQuiet();
console.log('模式:', mode, '| 窗口:', (await windowBounds(ctx)).windowState);
const page = ctx.pages()[0] || (await ctx.newPage());
const out = {};

async function inPage(url, label) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(6000);
    return true;
  } catch (e) {
    console.log(`  [${label}] goto 失败: ${e.message.slice(0, 60)}`);
    return false;
  }
}

// ═══ MSC：全量港口表 ═══
console.log('\n═══ MSC 全量港口表');
if (await inPage('https://www.msc.com/en/search-a-schedule', 'msc')) {
  const d = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/feature/tools/GetAllAvailableCountriesAndPorts', { headers: { accept: 'application/json' } });
      if (!r.ok) return { error: 'HTTP ' + r.status };
      return await r.json();
    } catch (e) { return { error: String(e).slice(0, 100) }; }
  }).catch((e) => ({ error: String(e).slice(0, 100) }));
  const size = JSON.stringify(d).length;
  console.log(`  → ${size} bytes`, d.error ? d.error : `countries=${Array.isArray(d) ? d.length : 'obj'}`);
  out.msc = d;
  fs.writeFileSync(OUT('msc-ports-raw.json'), JSON.stringify(d));
}

// ═══ ZIM：地点查询（逐关键词） ═══
console.log('\n═══ ZIM 地点查询');
if (await inPage('https://www.zim.com/schedules', 'zim')) {
  out.zim = {};
  for (const kw of KW) {
    const d = await page.evaluate(async (term) => {
      try {
        const r = await fetch(`https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?searchTerm=${encodeURIComponent(term)}`,
          { headers: { accept: 'application/json' } });
        if (!r.ok) return { error: 'HTTP ' + r.status };
        return await r.json();
      } catch (e) { return { error: String(e).slice(0, 80) }; }
    }, kw).catch((e) => ({ error: String(e).slice(0, 80) }));
    const n = Array.isArray(d) ? d.length : (d.error || '?');
    console.log(`  ${kw}: ${Array.isArray(d) ? n + ' 条' : n}`);
    if (Array.isArray(d)) out.zim[kw] = d.slice(0, 15).map((x) => ({ n: x.name || x.locationName || x.code, c: x.code || x.locationCode }));
    await sleep(1200);
  }
}

// ═══ COSCO：searchByCity 页面（抓它的候选接口） ═══
console.log('\n═══ COSCO 候选接口探测');
if (await inPage('https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', 'cosco')) {
  const hits = await page.evaluate(() => {
    const perf = performance.getEntriesByType('resource').map((e) => e.name);
    return perf.filter((u) => /city|port|search|suggest|place|location/i.test(u)).slice(0, 12);
  }).catch(() => []);
  console.log('  资源请求里的候选接口:');
  hits.forEach((h) => console.log('   ', h.slice(0, 120)));
  out.cosco_endpoints = hits;
  // 试着输入触发一次候选请求
  const o = page.locator('input[type=search], input[aria-label*="origin" i], input[placeholder*="city" i]').first();
  if (await o.count().catch(() => 0)) {
    await o.click({ timeout: 8000 }).catch(() => {});
    await page.keyboard.type('nansha', { delay: 90 }).catch(() => {});
    await sleep(6000);
    const after = await page.evaluate(() => {
      const perf = performance.getEntriesByType('resource').map((e) => e.name);
      return perf.filter((u) => /city|port|search|suggest|place|location|query/i.test(u)).slice(0, 12);
    }).catch(() => []);
    console.log('  输入 nansha 后新增的候选接口:');
    after.forEach((h) => console.log('   ', h.slice(0, 130)));
    out.cosco_endpoints_after = after;
  }
}

fs.writeFileSync(OUT('port-names-browser-raw.json'), JSON.stringify(out, null, 1));
console.log('\n原始数据 → docs/port-names-browser-raw.json');
console.log('最终窗口:', (await windowBounds(ctx)).windowState);
await ctx.close().catch(() => {});
process.exit(0);

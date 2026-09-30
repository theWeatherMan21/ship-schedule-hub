// 一网打尽：ZIM + CMA + COSCO + HMM 的页面内 API 探测（一次开浏览器，逐家试）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const { ctx } = await launchHeadedQuiet();
const out = {};

// ═══ ZIM：船期结果端点 ═══
console.log('\n═══ ZIM ═══');
{
  const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point?portcode=CNNGB%3B10&portdestinationcode=TRBTS%3B10&direction=true&fromdate=23-Sep-2026&weeksahead=4&cargotype=true', { reuse: true });
  await sleep(14000);
  // 记录它渲染时发的所有 XHR
  const endpoints = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((e) => e.name).filter((u) => !/\.(css|js|png|jpg|webp|svg|woff2?)/.test(u) && !/cls_report|google|doubleclick|analytics/.test(u)));
  console.log('  数据端点:');
  endpoints.slice(0, 10).forEach((u) => console.log('   ', u.slice(0, 150)));
  out.zim_endpoints = endpoints;
  // 页面里有没有结果数据（schedules）
  const hasRows = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
  console.log('  页面文本长度:', hasRows);
}

// ═══ CMA： schedules 结果页端点 ═══
console.log('\n═══ CMA ═══');
{
  const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
  await sleep(10000);
  const endpoints = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((e) => e.name).filter((u) => /api|json|service/i.test(u) && !/\.(css|js|png|svg)/.test(u)));
  console.log('  API 端点:');
  [...new Set(endpoints)].slice(0, 10).forEach((u) => console.log('   ', u.slice(0, 150)));
  out.cma_endpoints = [...new Set(endpoints)];
}

// ═══ COSCO：findCityDistrictByPrefix 已知；找船期列表端点 ═══
console.log('\n═══ COSCO ═══');
{
  const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebschedule/public/purposeOpen', { reuse: true });
  await sleep(12000).catch(() => {});
  const endpoints = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((e) => e.name).filter((u) => /api|schedule|sarin/i.test(u) && !/\.(css|js|png|svg)/.test(u)));
  console.log('  API 端点:');
  [...new Set(endpoints)].slice(0, 12).forEach((u) => console.log('   ', u.slice(0, 150)));
  out.cosco_endpoints = [...new Set(endpoints)];
}

fs.writeFileSync('../docs/api-hunt-round2.json', JSON.stringify(out, null, 1));
console.log('\n→ docs/api-hunt-round2.json');
await ctx.close().catch(() => {});
process.exit(0);

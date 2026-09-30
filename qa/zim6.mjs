// ZIM 数据结构：顶层有什么字段？船期列表在哪
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point', { reuse: true });
await sleep(13000);
const r = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB%3B0&PortDestinationCode=TRIST%3B0&Direction=true&FromDate=23-September-2026&WeeksAhead=6&CountryCode=US&CargoType=true`;
  const resp = await fetch(u, { headers: { accept: 'application/json' } });
  const j = await resp.json();
  const keys = Object.keys(j);
  const out = { keys, topTypes: {} };
  for (const k of keys) {
    const v = j[k];
    out.topTypes[k] = Array.isArray(v) ? `array(${v.length})` : typeof v;
  }
  // 第一条主船期样例
  const arrKey = keys.find((k) => Array.isArray(j[k]) && j[k].length && j[k][0] && j[k][0].vesselName && !j[k][0].isLandTrans);
  if (arrKey) out.mainKey = arrKey;
  if (arrKey) out.first = JSON.stringify(j[arrKey][0]).slice(0, 700);
  return out;
});
console.log(JSON.stringify(r, null, 1).slice(0, 1500));
await ctx.close().catch(() => {});
process.exit(0);

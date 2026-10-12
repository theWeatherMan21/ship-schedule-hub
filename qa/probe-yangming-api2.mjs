// YM BL 模式：N237068499 完整 JSON 抓取 + blList 字段树（无头、只读）
import fs from 'node:fs';
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);

const u = 'https://www.yangming.com/api/CargoTracking/GetTracking?paramTrackNo=N237068499&paramTrackPosition=SEARCH&paramRefNo=';
const r = await page.evaluate(async ({ u }) => {
  try {
    const resp = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const t = await resp.text();
    let j = null;
    try { j = JSON.parse(t); } catch { /* */ }
    return { status: resp.status, len: t.length, json: j };
  } catch (e) { return { error: String(e).slice(0, 160) }; }
}, { u });

console.log('status:', r.status, 'len:', r.len);
if (r.json) {
  fs.writeFileSync('qa/fixtures/yangming-track-N237068499.json', JSON.stringify(r.json, null, 1));
  console.log('fixture saved');
  const bl = (r.json.blList || [])[0] || {};
  console.log('blList[0] keys:', JSON.stringify(Object.keys(bl)));
  const dump = (k, v) => console.log(`  ${k}:`, JSON.stringify(v).slice(0, 400));
  for (const k of Object.keys(bl)) {
    if (!/Status|Info|List/i.test(k)) dump(k, bl[k]);
  }
  for (const k of Object.keys(bl)) {
    if (/Status|Info|List/i.test(k)) {
      const v = bl[k];
      console.log(`  ${k}:`, Array.isArray(v) ? `array[${v.length}]` : JSON.stringify(v).slice(0, 300));
    }
  }
  // 事件数组探测：找含 moveDate/eventDesc 的数组
  for (const [k, v] of Object.entries(bl)) {
    if (Array.isArray(v) && v.length && (v[0].moveDate || v[0].eventDesc)) {
      console.log(`  events in ${k}: ${v.length} 条；[0]=`, JSON.stringify(v[0]));
      console.log(`  [last]=`, JSON.stringify(v[v.length - 1]).slice(0, 300));
    }
  }
}

await ctx.close().catch(() => {});

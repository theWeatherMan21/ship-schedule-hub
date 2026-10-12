// YM API 完整抓取：GetTracking 全量 JSON 存 fixture + 字段树 + 试 N237068499（无头、只读）
import fs from 'node:fs';
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);

async function callApi(num) {
  const u = 'https://www.yangming.com/api/CargoTracking/GetTracking?paramTrackNo=' + encodeURIComponent(num) + '&paramTrackPosition=SEARCH&paramRefNo=';
  return page.evaluate(async ({ u }) => {
    try {
      const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      let j = null;
      try { j = JSON.parse(t); } catch { /* */ }
      return { status: r.status, len: t.length, json: j, head: t.slice(0, 200) };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  }, { u }).catch((e) => ({ error: String(e).slice(0, 160) }));
}

// 1) 柜号（有效）
const r1 = await callApi('YMLU3560471');
console.log('YMLU3560471 →', JSON.stringify({ status: r1.status, len: r1.len, topKeys: r1.json ? Object.keys(r1.json) : null }));
if (r1.json) {
  fs.mkdirSync('qa/fixtures', { recursive: true });
  fs.writeFileSync('qa/fixtures/yangming-track-YMLU3560471.json', JSON.stringify(r1.json, null, 1));
  console.log('fixture saved');
  const c0 = (r1.json.containerList || [])[0] || {};
  console.log('container[0] keys:', JSON.stringify(Object.keys(c0)));
  console.log('status[0] keys:', JSON.stringify(Object.keys((c0.ctStatusInfo || [])[0] || {})));
  console.log('status[0]:', JSON.stringify((c0.ctStatusInfo || [])[0]));
  console.log('status count:', (c0.ctStatusInfo || []).length, '| last:', JSON.stringify((c0.ctStatusInfo || []).at(-1)));
  console.log('non-ctStatus fields:', JSON.stringify(Object.fromEntries(Object.entries(c0).filter(([k]) => k !== 'ctStatusInfo'))));
}

// 2) N237068499（疑似 BL，看响应）
const r2 = await callApi('N237068499');
console.log('\nN237068499 →', JSON.stringify({ status: r2.status, len: r2.len, successCnt: r2.json?.successCnt, head: (r2.json ? JSON.stringify(r2.json).slice(0, 300) : r2.head) }));

// 3) 换一个箱主前缀的柜测试无效号
const r3 = await callApi('XXXX1234567');
console.log('\nXXXX1234567 →', JSON.stringify({ status: r3.status, successCnt: r3.json?.successCnt, msg: r3.json?.returnMsg || r3.json?.message || null, head: (r3.json ? JSON.stringify(r3.json).slice(0, 200) : r3.head) }));

await ctx.close().catch(() => {});

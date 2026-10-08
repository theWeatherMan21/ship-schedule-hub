// 评估用：探 ONE / ZIM 的原始响应里有没有「航程分段 + 截单时间」这类细节。
// 用法：cd engine && node ../qa/probe-detail-others.mjs [起运LOCODE] [目的LOCODE]
const O = process.argv[2] || 'CNNGB';
const D = process.argv[3] || 'TRIST';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const dump = (label, obj, depth = 0) => {
  const pad = '  '.repeat(depth);
  if (obj === null || typeof obj !== 'object') { console.log(`${pad}${label}: ${String(obj).slice(0, 90)}`); return; }
  if (Array.isArray(obj)) {
    console.log(`${pad}${label}: [${obj.length}]`);
    if (obj.length) dump('[0]', obj[0], depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') { console.log(`${pad}${k}:`); dump('', v, depth + 1); }
    else console.log(`${pad}${k}: ${String(v).slice(0, 90)}`);
  }
};

// ── ONE ──
console.log('═══ ONE（直连 API）═══');
try {
  const from = new Date(); const to = new Date(Date.now() + 42 * 864e5);
  const f = (d) => d.toISOString().slice(0, 10);
  const url = `https://ecomm.one-line.com/api/v1/schedule/point-to-point?porCode=${O}&delCode=${D}&rcvTermCode=Y&deTermCode=Y&tsFlag=&fromDate=${f(from)}&toDate=${f(to)}&cargoNature=GP&searchType=List&sourcePage=schedule`;
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
  const j = await r.json();
  const lines = j.scheduleLines || [];
  console.log(`  HTTP ${r.status}，scheduleLines ${lines.length} 条`);
  if (lines[0]) { console.log('  ── scheduleLine[0] 全字段 ──'); dump('', lines[0], 1); }
  if (lines[0] && lines[0].journeys) { console.log('  ── journeys[0]（航程分段）──'); dump('', lines[0].journeys[0], 1); }
} catch (e) { console.log('  ONE 失败:', String(e).slice(0, 140)); }

// ── ZIM ──
console.log('\n═══ ZIM（网关直连，key 从引擎代码里取）═══');
try {
  const fs = await import('node:fs');
  const code = fs.readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
  const key = (code.match(/subscription-key=([^&'"]+)/) || [])[1] || '';
  const from = new Date(); const to = new Date(Date.now() + 28 * 864e5);
  const f = (d) => d.toISOString().slice(0, 10);
  const url = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${O}&PortDestinationCode=${D}&Direction=true&FromDate=${f(from)}&WeeksAhead=4&CountryCode=US&CargoType=true`;
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
  console.log('  HTTP', r.status);
  const j = await r.json().catch(() => null);
  if (j) {
    const arr = Array.isArray(j) ? j : (j.data || j.Data || j.results || []);
    console.log('  顶层 keys:', Object.keys(j).slice(0, 12).join(', '), '| 条数:', arr.length);
    if (arr[0]) { console.log('  ── 第一条全字段 ──'); dump('', arr[0], 1); }
  }
} catch (e) { console.log('  ZIM 失败:', String(e).slice(0, 140)); }

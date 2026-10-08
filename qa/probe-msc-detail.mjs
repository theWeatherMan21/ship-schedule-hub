// 评估用：直接打 MSC 的 SearchSailingRoutes，把原始响应结构完整打出来。
// 目的：确认「航程细节（各段船名/中转港/服务名）+ 截单时间（CY/VGM/文件）」是否已在响应里，
// 还是需要额外的详情接口。用法：cd engine && node ../qa/probe-msc-detail.mjs [起运LOCODE] [目的LOCODE]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(__dirname, '..', 'engine');

const O = process.argv[2] || 'CNNGB';
const D = process.argv[3] || 'TRIST';

// 复用引擎的 CA 兜底思路：先试直连，失败再用系统证书
async function post(body) {
  const url = 'https://www.msc.com/api/feature/tools/SearchSailingRoutes';
  const opts = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/plain, */*',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  };
  try {
    const r = await fetch(url, opts);
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch (e) {
    return { status: 0, error: String(e).slice(0, 160) };
  }
}

// 取 PortId
let ports = [];
try { ports = JSON.parse(fs.readFileSync(path.join(ENGINE, '..', 'docs', 'msc-ports-raw.json'), 'utf8')).Ports || []; } catch {}
const find = (locode) => ports.find((p) => String(p.LocationCode || '').toUpperCase() === locode);
const F = find(O); const T = find(D);
console.log('港口匹配:', O, '→', F ? F.PortId : '(未找到)', '|', D, '→', T ? T.PortId : '(未找到)');
if (!F || !T) { console.log('港口表里没有，换一对试试'); process.exit(0); }

const DSID = '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}';
const md = new Date().toISOString().slice(0, 10);

const r = await post({ FromDate: md, fromPortId: F.PortId, toPortId: T.PortId, language: 'en', dataSourceId: DSID });
console.log('HTTP', r.status, r.error || '');
if (!r.json) { console.log('无 JSON 返回'); process.exit(0); }

const list = Array.isArray(r.json.Data) ? r.json.Data : [];
console.log('Data 条数:', list.length);
if (list.length) {
  const x = list[0];
  console.log('\n── Data[0] 顶层字段 ──');
  console.log(Object.keys(x).join(', '));
  const routes = Array.isArray(x.Routes) ? x.Routes : [x.Routes];
  console.log('\n── Routes 条数:', routes.length, ' ──');
  console.log('── Routes[0] 的全部字段与值 ──');
  const r0 = routes[0] || {};
  for (const [k, v] of Object.entries(r0)) {
    const s = typeof v === 'object' ? JSON.stringify(v).slice(0, 220) : String(v).slice(0, 120);
    console.log(`  ${k}: ${s}`);
  }
  // 找可能承载细节的嵌套结构
  console.log('\n── 可能的细节容器（数组/对象字段）──');
  for (const [k, v] of Object.entries(r0)) {
    if (v && typeof v === 'object') {
      const sample = Array.isArray(v) ? v[0] : v;
      console.log(`  ${k}: ${Array.isArray(v) ? `[${v.length}]` : '{...}'} → ${JSON.stringify(sample).slice(0, 300)}`);
    }
  }
  console.log('\n── 全字段里含 date/cut/close/terminal 关键字的 ──');
  for (const [k, v] of Object.entries(r0)) {
    if (/date|cut|close|closing|terminal|service|leg|port|trans/i.test(k)) console.log(`  ${k} = ${String(v).slice(0, 100)}`);
  }
}
fs.writeFileSync('/tmp/msc-raw-sample.json', JSON.stringify(r.json, null, 1));
console.log('\n完整响应已存: /tmp/msc-raw-sample.json');

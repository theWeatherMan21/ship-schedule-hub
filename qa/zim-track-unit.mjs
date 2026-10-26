// ZIM 追踪 · 离线单元测试（fixtures = 2026-10-12 真实响应样本 ×7，零网络）
// 运行：node qa/zim-track-unit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZimResponse, zimEvent } from '../engine/tracking/zim.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const samples = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'zim-track-samples.json'), 'utf8'));
const get = (n) => JSON.parse(samples.find((x) => x.n === n).body);

let pass = 0; let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, String(extra).slice(0, 160)); }
};

console.log('=== A. 提单形态（有箱级事件）===');
const r1 = parseZimResponse(get('ZIMUBCN10212938'), 'ZIMUBCN10212938');
check('ok=true', r1.ok === true);
check('docNum 回显', r1.docNum === 'ZIMUBCN10212938');
check('路由 BARCELONA → NEW YORK (NY)', r1.origin === 'BARCELONA' && r1.destination === 'NEW YORK (NY)', `${r1.origin} -> ${r1.destination}`);
check('箱数=1（BSIU1781426）', r1.containers.length === 1 && r1.containers[0].num === 'BSIU1781426', JSON.stringify(r1.containers.map((c) => c.num)));
check('事件=10', r1.containers[0].events.length === 10, r1.containers[0].events.length);
const evs = r1.containers[0].events;
check('事件按时间升序', evs.every((e, i) => i === 0 || String(evs[i - 1].time || '') <= String(e.time || '')));
check('末条 isCurrent', evs[evs.length - 1].isCurrent === true);
check('current=最新 ACTUAL', !!r1.current && r1.current.timeType === 'ACTUAL');
check('eta=2026-08-26T00:01', !!r1.eta && r1.eta.time === '2026-08-26T00:01', JSON.stringify(r1.eta));
check('status=Closed', r1.status === 'Closed', r1.status);

console.log('=== B. 箱号形态 ===');
const r2 = parseZimResponse(get('TGBU4028006'), 'TGBU4028006');
check('ok=true', r2.ok === true);
check('箱号=1（TGBU4028006）', r2.containers.length === 1 && r2.containers[0].num === 'TGBU4028006');
check('事件=9', r2.containers[0].events.length === 9, r2.containers[0].events.length);
check('路由 NINGBO (ZJ) → NEW YORK (NY)', r2.origin === 'NINGBO (ZJ)' && r2.destination === 'NEW YORK (NY)');
check('searchType=CONTAINER', r2.searchType === 'CONTAINER', r2.searchType);
check('eta 有值', !!(r2.eta && r2.eta.time));

console.log('=== C. 无箱级活动的票（站方仅给票级数据）===');
const r3 = parseZimResponse(get('ZIMUMEX964578'), 'ZIMUMEX964578');
check('ok=true 且箱子无活动（如实）', r3.ok === true && r3.containers.length > 0 && r3.containers.every((c) => c.events.length === 0));
check('route 仍在（MANZANILLO → YANTIAN (GD)）', r3.origin === 'MANZANILLO' && r3.destination === 'YANTIAN (GD)', `${r3.origin} -> ${r3.destination}`);
check('eta 仍在', !!(r3.eta && r3.eta.time));

console.log('=== D. 无效号 / 被拦 ===');
const r4 = parseZimResponse(get('ZIMUSHH31595183'), 'ZIMUSHH31595183');
check('无效号 → not-found（不编数据）', r4.ok === false && r4.errorKind === 'not-found', JSON.stringify(r4.error));
const r5 = parseZimResponse(null, 'X');
check('非 JSON → blocked', r5.ok === false && r5.errorKind === 'blocked');

console.log('=== E. 事件映射抽查 ===');
const e1 = zimEvent({ activityCode: 'CNT_VESSEL_DEPARTURE', activityDesc: 'Vessel Departure', activityDateTz: '2026-08-19T15:35:44+03:00', placeFromDesc: 'NINGBO (ZJ)', vesselName: 'X', voyage: '15' }, '2026-10-12');
check('zimEvent 字段映射', e1.time === '2026-08-19T15:35' && e1.activity === 'Vessel Departure' && e1.city === 'NINGBO (ZJ)' && e1.timeType === 'ACTUAL' && e1.voyage === '15');
const e2 = zimEvent({ activityDesc: 'Future thing', activityDateTz: '2099-01-01T00:00:00+08:00' }, '2026-10-12');
check('未来日期 → EXPECTED（防御性）', e2.timeType === 'EXPECTED');

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);

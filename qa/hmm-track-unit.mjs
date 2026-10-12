// HMM 提单解析 · 离线单测（零网络，秒级）
// 用法：node qa/hmm-track-unit.mjs
// 语料：qa/fixtures/hmm-bl-response.html = 站点 selectTrackNTrace.do 的真实响应片段（真单 HDMUSHAF36562700）
import fs from 'node:fs';
import { parseHmmFragment } from '../engine/tracking/hmm.mjs';

const html = fs.readFileSync(new URL('./fixtures/hmm-bl-response.html', import.meta.url), 'utf8');
const p = parseHmmFragment(html);

let fail = 0;
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    got ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};

ck('B/L 号（站点口径，无 SCAC 前缀）', p.docNumber, 'SHAF36562700');
ck('起点港 + 离港时间', [p.origin, p.departureOrigin], ['SHANGHAI,CHINA', '2025-04-23 07:12']);
ck('终点港 + 到港时间', [p.destination, p.arrivalDestination], ['CASABLANCA, MOROCCO', '2025-07-06 17:53']);
ck('时间线条数（含隐藏的历史行）', p.events.length, 11);
ck('时间线首条（最早）', [p.events[10].date, p.events[10].activity, p.events[10].location],
  ['2025-04-23', 'Export Empty Container Released', 'SHANGHAI,CHINA']);
ck('时间线末条（最新）', [p.events[0].date, p.events[0].time, p.events[0].activity],
  ['2025-07-15', '14:51', 'Import Empty Container Returned']);
ck('有 10 条隐藏的历史行被标 previous（共 11 条 = 1 最新 + 10 历史）', p.events.filter((e) => e.previous).length, 10);
ck('箱量标签', p.containersLabel, 'DC4H:1');
ck('箱号', p.containers[0].num, 'CAIU3102121');
ck('箱 status 去掉了 tooltip 杂讯', p.containers[0].blStatus, 'Surrendered');
ck('箱型/尺寸', p.containers[0].typeSize, 'DC/4H');
ck('船期表 5 行', p.schedule.map((r) => r.label), ['Location', 'Terminal', 'Vessel', 'Arrival(ETB)', 'Departure']);
ck('船期表：装货港船名', p.schedule[2]['Loading Port'], '[FE3] HMM ALGECIRAS 0017W');
ck('空/垃圾输入不抛错', (() => { try { const z = parseHmmFragment(''); return [z.events.length, z.containers.length]; } catch { return 'THREW'; } })(), [0, 0]);
console.log(fail ? `\n✗ ${fail} 项不通过` : '\n✓ 全部通过');
process.exit(fail ? 1 : 0);

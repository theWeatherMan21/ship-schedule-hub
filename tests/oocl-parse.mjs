// OOCL 追踪解析回归（离线，不联网）—— 2026-10-29
//
// 为什么要这层：OOCL 走的是「移动版匿名 JSF 页 + 整页 HTML」，站方一改版解析就静默变空。
// 这里用**脱敏夹具**（真单页面把提单号/箱号/船名换掉，同结构）跑不变量，
// 改版时测试先红，不用等爹地撞上「查不到」。
//
// 夹具：tests/fixtures/oocl/*.html
//   ① bl-result.html     —— 提单号命中（真单结构，1 箱 9 条设备动态）
//   ② cntr-result.html   —— 箱号命中
//   ③ not-found.html     —— 查无此号（"No records were found."）
//   ④ throttled.html     —— 站方限流（QF8）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOoclResult, parseOoclTime, isThrottledPage, isNotFoundPage, trackOocl } from '../engine/tracking/oocl.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fx = (n) => fs.readFileSync(path.join(DIR, n), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}${extra ? ' — ' + extra : ''}`); }
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, `实际=${JSON.stringify(a)} 期望=${JSON.stringify(b)}`);

console.log('\n== ① 提单号结果页 ==');
const bl = parseOoclResult(fx('bl-result.html'), { number: 'TEST-BL-0001', mode: 'bl' });
ok(bl.ok, '解析成功');
eq(bl.docNum, '0000000001', '提单号（站方只回数字，去掉 SCAC 前缀）');
eq(bl.vessel, 'OOCL SAMPLE', '船名');
eq(bl.voyage, '011W', '航次');
ok(/^BL$/.test(bl.searchType), 'searchType=BL');
eq(bl.containers.length, 1, '箱数 1');
eq(bl.containers[0].size, '40HQ', '箱型 40HQ');
eq(bl.containers[0].num, 'TESTU123456', '箱号（清洗后无横线）');
ok(/Not Released/i.test(bl.siteStatus), '放行状态解析（Cargo Release Status）', bl.siteStatus);
ok(bl.siteStatus === 'Not Released', '放行状态只到标签边界（不拖后半句）', bl.siteStatus);
ok(/ENS Accepted/i.test(bl.advancedManifest), '舱单状态解析（Advanced Manifest）', bl.advancedManifest);
ok(/Cleared/i.test(bl.originalBl), '正本提单状态解析', bl.originalBl);
ok(/Ningbo/i.test(bl.origin), '起运港', bl.origin);
ok(bl.eta && /^2026-11-13/.test(bl.eta.time), 'ETA 取箱行的「最终目的地预计到达」', JSON.stringify(bl.eta));
ok(bl.eta && /Istanbul/i.test(bl.eta.city), 'ETA 城市=最终目的地', bl.eta && bl.eta.city);

console.log('\n== ② 事件表（设备动态）==');
eq(bl.events.length, 9, '事件条数');
ok(bl.events.every((e) => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(e.time || ''))), '每条时间都是 ISO 形态');
const asc = bl.events.every((e, i) => i === 0 || String(bl.events[i - 1].time) <= String(e.time));
ok(asc, '事件按时间升序');
ok(bl.events[bl.events.length - 1].isCurrent === true, '最后一条标 isCurrent');
ok(bl.events.filter((e) => e.isCurrent).length === 1, 'isCurrent 只有一条');
ok(bl.events.some((e) => /Vessel Departed/i.test(e.activity)), '含 Vessel Departed');
ok(bl.events.some((e) => /Container Picked Up/i.test(e.activity)), '含 Container Picked Up');
ok(bl.events.every((e) => e.timeType === 'ACTUAL' || e.timeType === 'EXPECTED'), 'timeType 只有 ACTUAL/EXPECTED');
ok(bl.events.filter((e) => e.timeType === 'ACTUAL').every((e) => e.time.slice(0, 10) <= new Date().toISOString().slice(0, 10)), 'ACTUAL 不含未来日期');
ok(bl.events.every((e) => e.activity && e.city), '每条都有事件名 + 地点');

console.log('\n== ③ 箱号结果页 ==');
const ct = parseOoclResult(fx('cntr-result.html'), { number: 'TESTU1234567', mode: 'cntr' });
ok(ct.ok, '解析成功');
eq(ct.searchType, 'CONTAINER', 'searchType=CONTAINER');
eq(ct.events.length, 9, '事件条数（箱号视角）');
eq(ct.containers[0].num, 'TESTU123456', '箱号');

console.log('\n== ④ 查无此号 ==');
const nf = parseOoclResult(fx('not-found.html'), { number: 'TEST-BL-0002', mode: 'bl' });
ok(isNotFoundPage(fx('not-found.html')), '识别为「查无此号」页');
ok(!nf.ok && nf.errorKind === 'not-found', 'errorKind=not-found');
ok(/查无此号/.test(nf.error), '错误文案可读', nf.error);

console.log('\n== ⑤ 限流（QF8）==');
const th = parseOoclResult(fx('throttled.html'), { number: 'TEST-BL-0001', mode: 'bl' });
ok(isThrottledPage(fx('throttled.html')), '识别为限流页');
ok(!th.ok && th.errorKind === 'throttled', 'errorKind=throttled');
ok(/限流/.test(th.error) && /再查/.test(th.error), '文案说明「过几分钟再查」', th.error);

console.log('\n== ⑥ 时间解析（真单里的几种写法）==');
eq(parseOoclTime('21 Oct 2026, 15:49 SGT'), { time: '2026-10-21T15:49', tz: 'SGT', estimated: false }, 'DD Mon YYYY, HH:MM TZ');
eq(parseOoclTime('24 Sep 2026, 00:00 CCT (Cargo Cutoff Date)').time, '2026-09-24T00:00', '带后缀括号也能取时间');
eq(parseOoclTime('13 Nov 2026, 14:00 TRST (Estimated)').estimated, true, '(Estimated) 被识别');
eq(parseOoclTime('').time, null, '空串 → null');
eq(parseOoclTime('garbage').time, null, '乱码 → null');

console.log('\n== ⑦ 单号形态前置（不联网，只验参数层）==');
const bad = await trackOocl('');
ok(!bad.ok && bad.errorKind === 'bad-args', '空单号直接报 bad-args，不发请求');

console.log(`\n${fail ? '✗ 失败 ' + fail + ' 项（通过 ' + pass + '）' : '✓ 全部通过（' + pass + ' 项）'}`);
process.exit(fail ? 1 : 0);

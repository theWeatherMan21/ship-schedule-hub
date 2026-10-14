// 马士基深链卡片解析单测（10-14 审阅 P0-1 回归）
// 背景：transitDays 曾取错捕获组（拿到航次号 639W 而非天数 25）
import assert from 'node:assert/strict';
import { parseMaerskCardsText, fmtMaerskDate } from '../engine/recipes/maersk.mjs';

const CARD = (vessel, voyage, days, hours) =>
  `Departure\n11 Oct 2026\nShanghai\nArrival\n05 Nov 2026\nIstanbul\nVessel/Voyage\n${vessel} ${voyage}\nTransit Time:${days} days${hours != null ? ` ${hours} hours` : ''}`;

// ① P0-1 核心：天数取 25（不是航次 639W）；25天22小时 → 26（与 API 口径 Math.round((d*24+h)/24) 一致）
const r1 = parseMaerskCardsText(CARD('MOGENS MAERSK', '639W', 25, 22));
assert.equal(r1.length, 1, '应解析出 1 行');
assert.equal(r1[0].transitDays, 26, 'P0-1: 25天22小时应折算 26（曾错取航次 639W）');
assert.equal(r1[0].vessel, 'MOGENS MAERSK', '船名解析');
assert.equal(r1[0].voyage, '639W', '航次解析');
assert.equal(r1[0].etd, '2026-10-11', '出发日 ISO 化');
assert.equal(r1[0].eta, '2026-11-05', '到达日 ISO 化');

// ② 不带小时：25 days → 25（整数不漂移）
const r2 = parseMaerskCardsText(CARD('EVER GIVEN', '123E', 25, null));
assert.equal(r2[0].transitDays, 25, '不带小时应得 25');

// ③ 小时 < 12：向下折算（24天10小时 → 24）
const r3 = parseMaerskCardsText(CARD('EVER GIVEN', '123E', 24, 10));
assert.equal(r3[0].transitDays, 24, '24天10小时应折算 24');

// ④ transitDays 类型必须是数字（跨家口径要求）
assert.equal(typeof r1[0].transitDays, 'number', 'transitDays 必须是 number');

// ⑤ 空文本/垃圾输入不抛错、返回空数组
assert.deepEqual(parseMaerskCardsText(''), [], '空文本 → []');
assert.deepEqual(parseMaerskCardsText('garbage text with no cards'), [], '垃圾文本 → []');

// ⑥ 多卡片：各取各自的天数
const two = CARD('SHIP A', '111W', 20, 0) + '\n' + CARD('SHIP B', '222E', 30, 15);
const r4 = parseMaerskCardsText(two);
assert.equal(r4.length, 2, '两张卡片应解析出 2 行');
assert.equal(r4[0].transitDays, 20, '第 1 张卡天数');
assert.equal(r4[1].transitDays, 31, '第 2 张卡（30天15小时→31，0.625 进位）');

// ⑦ 日期格式化边界
assert.equal(fmtMaerskDate('1 Jan 2027'), '2027-01-01', '单位数日期补零');
assert.equal(fmtMaerskDate('bad'), 'bad', '不可解析原样返回');

console.log('maersk cards parse tests passed（7 组断言）');

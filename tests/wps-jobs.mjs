// 「WPS 回填工作台」数据层断言（婉宜 2026-10-29 · 架构②）
//
// 覆盖的是**不变量**，不是某个页面长什么样：
//   W1 台账：单条记录必须 < 4KB（多进程并发 append 的原子写底线）
//   W2 台账：坏行/半行不影响其它行读出（磁盘被写坏的兜底）
//   W3 切批：间隔 > 3 分钟算新的一批；同一轮 19 条落在一批里
//   W4 行号：台账没带行号时，从插件配置 retry[] 的 n→row 回补
//   W5 统计：ok / fail / manual（失败但有官网链接）/ throttle 计数口径
//   W6 限流：同船司 10 分钟内 ≥2 次 429/challenge → 出 warning + 冷却截止时间
//   W7 空数据：没有任何台账/配置时返回 ok:true 空壳，不抛
//   W8 只读：collect() 不得写插件目录（台账目录里的旧文件会被滚动清理，但配置目录不动）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { journalJob, readJobs, toRecord, dayFile } from '../engine/tracking/journal.mjs';
import { buildWorkbench, parseCfgKey, readConfigs, isThrottle, collect, BATCH_GAP_MS } from '../engine/wps-jobs.mjs';

let pass = 0;
const ok = async (name, fn) => { await fn(); pass++; console.log('  ✓', name); };

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wps-jobs-'));

// ---------------- W1 单条 < 4KB ----------------
console.log('W1 台账单条记录体积上限（并发 append 原子写）');
await ok('超长错误/海量事件被裁到 4KB 内', () => {
  const rec = toRecord({
    number: 'TEST-BL-0001', carrier: 'maersk', ok: false,
    error: 'x'.repeat(5000),
    events: Array.from({ length: 200 }, (_, i) => ({ time: '2026-10-29T10:00:00', activity: 'ACTIVITY'.repeat(20), city: 'C'.repeat(80) })),
  }, { ts: 1793265000000, ms: 1234 });
  const line = JSON.stringify(rec);
  assert.ok(line.length < 4096, `记录 ${line.length} 字节，超过 4KB`);
  assert.equal(rec.events.length, 12, 'events 只留最新 12 条');
  assert.ok(rec.err.length <= 200, '错误串截到 200 字');
});

// ---------------- W2 坏行隔离 ----------------
console.log('W2 台账坏行隔离');
await ok('半行 JSON 跳过、好行照读', () => {
  const dir = tmp();
  const now = 1793265000000;
  journalJob({ number: 'TEST-BL-0002', carrier: 'msc', ok: true, events: [] }, { ts: now, dir });
  fs.appendFileSync(dayFile(now, dir), '{"n":"HALF-LINE","ts":\n');
  journalJob({ number: 'TEST-BL-0003', carrier: 'one', ok: false, error: 'boom' }, { ts: now + 1000, dir });
  const jobs = readJobs(1, now, dir);
  assert.deepEqual(jobs.map((j) => j.n), ['TEST-BL-0002', 'TEST-BL-0003']);
});

// ---------------- W3 切批 ----------------
console.log('W3 批次切分');
await ok('间隔 <= 3 分钟同批，超出则新批', () => {
  const t0 = 1793265000000;
  const mk = (i, gap) => ({ n: `N${i}`, c: 'msc', ts: t0 + gap, ok: true, events: [] });
  const jobs = [mk(1, 0), mk(2, 5000), mk(3, 8000), mk(4, 8000 + 100000), mk(5, 8000 + 100000 + BATCH_GAP_MS + 10)];
  const out = buildWorkbench({ jobs, cfgs: [], now: t0 });
  assert.equal(out.batches.length, 2, '应当切成 2 批');
  assert.equal(out.batches[0].total, 4);
  assert.equal(out.batches[1].total, 1);
  assert.equal(out.batches[1].seq, 1, '最新一批 seq=1');
});

// ---------------- W4 行号回补 ----------------
console.log('W4 行号回补（插件 retry[] → 台账行）');
await ok('台账无 row 时按单号补行号；查不到给 0', () => {
  const t0 = 1793265000000;
  const cfgs = [{
    key: 'book.xlsx|S1', doc: 'book.xlsx', sheet: 'S1', cfgAt: t0, ageMin: 0, rows: 5,
    numberCol: 9, outCol: 12, mode: 'column',
    retry: [{ n: 'TEST-BL-0004', row: 7, at: t0 + 60000, tries: 1 }],
  }];
  const jobs = [
    { n: 'TEST-BL-0004', c: 'msc', ts: t0, ok: false, err: 'no data', events: [] },
    { n: 'TEST-BL-9999', c: 'msc', ts: t0 + 1000, ok: true, events: [] },
  ];
  const out = buildWorkbench({ jobs, cfgs, now: t0 + 5000 });
  const items = out.batches[0].items;
  assert.equal(items[0].row, 7, 'retry 里的行号要回补');
  assert.equal(items[1].row, 0, '对不上的不能瞎填');
  assert.equal(out.batches[0].tableKey, 'book.xlsx|S1', '批次要关联到命中最多的那张表');
  assert.equal(out.tables[0].retryCount, 1);
});

// ---------------- W4b 无命中时按配置时间对齐关联表 ----------------
console.log('W4b 全成功批次也能关联到表（配置 mtime 时间对齐）');
await ok('批次里没有任何 retry 命中时，用 cfgAt 落在窗口内的配制表兜底', () => {
  const t0 = 1793265000000;
  const cfgs = [{ key: 'book.xlsx|S1', doc: 'book.xlsx', sheet: 'S1', cfgAt: t0 + 100000, ageMin: 0, rows: 10, numberCol: 9, outCol: 12, mode: 'column', retry: [] }];
  const jobs = [{ n: 'AAA', c: 'msc', ts: t0, ok: true, events: [] }, { n: 'BBB', c: 'msc', ts: t0 + 5000, ok: true, events: [] }];
  const b = buildWorkbench({ jobs, cfgs, now: t0 + 120000 }).batches[0];
  assert.equal(b.tableKey, 'book.xlsx|S1', '应当按时间对齐关联');
  assert.equal(b.rowsPlanned, 10);
});

await ok('配置时间离批次太远则保持「未关联」', () => {
  const t0 = 1793265000000;
  const cfgs = [{ key: 'old.xlsx|S9', doc: 'old.xlsx', sheet: 'S9', cfgAt: t0 - 3600_000, ageMin: 60, rows: 10, numberCol: 1, outCol: 2, mode: 'column', retry: [] }];
  const jobs = [{ n: 'AAA', c: 'msc', ts: t0, ok: true, events: [] }];
  const b = buildWorkbench({ jobs, cfgs, now: t0 }).batches[0];
  assert.equal(b.tableKey, '', '不该硬塞一张一小时前的表');
  assert.ok(/未关联/.test(b.label), `label 应说明未关联：${b.label}`);
});

// ---------------- W5 统计口径 ----------------
console.log('W5 统计口径');
await ok('ok / fail / manual / cached 计数', () => {
  const t0 = 1793265000000;
  const jobs = [
    { n: 'A', c: 'msc', ts: t0, ok: true, cached: 1, events: [] },
    { n: 'B', c: 'msc', ts: t0 + 100, ok: false, url: 'https://example.com/x', err: 'no data', events: [] },
    { n: 'C', c: 'hmm', ts: t0 + 200, ok: false, err: 'deadline', events: [] },
  ];
  const b = buildWorkbench({ jobs, cfgs: [], now: t0 }).batches[0];
  assert.equal(b.total, 3);
  assert.equal(b.ok, 1);
  assert.equal(b.fail, 2);
  assert.equal(b.manual, 1, '有官网链接的失败行算「待手工」');
  assert.equal(b.cached, 1);
  assert.equal(b.byCarrier.msc.total, 2);
});

// ---------------- W6 限流 ----------------
console.log('W6 限流冷却');
await ok('同船司 10 分钟内 2 次 429 → warning + cooldown', () => {
  const t0 = 1793265000000;
  const jobs = [
    { n: 'A', c: 'maersk', ts: t0, ok: false, err: 'HTTP 429 Too Many Requests', events: [] },
    { n: 'B', c: 'maersk', ts: t0 + 30000, ok: false, err: 'cloudflare challenge', events: [] },
    { n: 'C', c: 'msc', ts: t0 + 40000, ok: false, err: 'deadline exceeded', events: [] },
  ];
  const out = buildWorkbench({ jobs, cfgs: [], now: t0 + 60000 });
  assert.equal(out.warnings.length, 1, '只有 maersk 该报警');
  assert.equal(out.warnings[0].carrier, 'maersk');
  assert.ok(out.warnings[0].cooldownUntil > t0 + 60000, '冷却截止要在未来');
  assert.equal(isThrottle({ ok: false, err: 'HTTP 429' }), true);
  assert.equal(isThrottle({ ok: false, err: 'track deadline exceeded (240000ms)' }), false, '超时不是限流');
  assert.equal(isThrottle({ ok: true, err: '' }), false);
});

// ---------------- W7 空数据 ----------------
console.log('W7 空数据不炸');
await ok('无台账无配置 → ok:true 空壳', () => {
  const out = buildWorkbench({ jobs: [], cfgs: [], now: 1793265000000 });
  assert.equal(out.ok, true);
  assert.deepEqual(out.batches, []);
  assert.equal(out.journal.records, 0);
  assert.equal(out.currentTable, null);
});

// ---------------- W8 配置解析 + 只读 ----------------
console.log('W8 插件配置解析');
await ok('文件名 %7C 解码出 doc|sheet；installed.json 不当配置', () => {
  assert.deepEqual(parseCfgKey('%E6%B3%A2%E5%85%B02026.xlsx%7CTerramar.json'), { doc: '波兰2026.xlsx', sheet: 'Terramar' });
  assert.deepEqual(parseCfgKey('%7C.json'), { doc: '', sheet: '' });
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'installed.json'), JSON.stringify({ version: '0.9.43' }));
  fs.writeFileSync(path.join(dir, '%7C.json'), JSON.stringify({ numberCol: 1, rows: 3, retry: [] }));
  const cfgs = readConfigs(dir, 1793265000000);
  assert.equal(cfgs.length, 1, '只认列配置，不把 installed.json 算进去');
  assert.equal(cfgs[0].rows, 3);
});

await ok('collect() 不写插件配置目录', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '%7C.json'), JSON.stringify({ numberCol: 1, rows: 3, retry: [] }));
  const before = fs.readdirSync(dir).sort();
  const out = await collect({ days: 1, now: 1793265000000, stateDir: dir, jobsDir: path.join(dir, 'jobs'), probe: false });
  assert.equal(out.ok, true);
  const after = fs.readdirSync(dir).sort();
  assert.deepEqual(after.filter((f) => f !== 'jobs'), before, '配置目录不得被写脏');
});

// ---------------- W9 台账往返 ----------------
console.log('W9 台账往返');
await ok('写进去的字段读回来一致（含事件/耗时/来源）', () => {
  const dir = tmp();
  const now = 1793265000000;
  journalJob({
    number: 'TEST-BL-0005', carrier: 'cosco', ok: true, phase: 'IN TRANSIT',
    current: { activity: 'Vessel arrived', time: '2026-10-29T08:00:00', city: 'Ningbo' },
    eta: { time: '2026-11-02T00:00:00', city: 'Ambarli' },
    events: [{ time: '2026-10-29T08:00:00', activity: 'Vessel arrived', city: 'Ningbo', vessel: 'XIN YANG', voyage: '001E' }],
    containers: [{ num: 'TESTBOX0000001' }],
  }, { ts: now, ms: 4321, dir, src: 'wps' });
  const [rec] = readJobs(1, now, dir);
  assert.equal(rec.n, 'TEST-BL-0005');
  assert.equal(rec.c, 'cosco');
  assert.equal(rec.ms, 4321);
  assert.equal(rec.phase, 'IN TRANSIT');
  assert.equal(rec.cur, 'Vessel arrived');
  assert.equal(rec.etac, 'Ambarli');
  assert.equal(rec.cont, 1);
  assert.equal(rec.events[0].v, 'XIN YANG');
  assert.equal(rec.src, 'wps');
});

console.log(`\n✅ wps-jobs: ${pass}/${pass} 通过`);

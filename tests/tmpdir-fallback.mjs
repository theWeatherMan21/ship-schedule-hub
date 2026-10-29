// 单测：Windows 审查 W-1 —— 临时目录兜底链（2026-10-15 真机事故的回归防线）
//
// 事故原样：TEMP/TMP/TMPDIR 指向**不存在/不可写**的目录 → Playwright mkdtemp ENOENT →
//   所有浏览器类船司全灭、0 条结果，用户侧只看到「查询中」（静默失败）。
// 这份测试钉死四件事：
//   ① 系统 TEMP 不可用时必须**降级**到数据目录，并且降级要留痕（不是静默换掉）
//   ② 全平台一个能写的都没有时必须**抛可读错误**，绝不返回死路径
//   ③ 选中后 TEMP/TMP/TMPDIR 三个变量都要被改写（Playwright 读的就是它们）
//   ④ 系统 TEMP 只是「不存在但建得出来」时顺手建好用 —— 这种情况不降级也不报错
// 失败场景逐条覆盖：TEMP 未设置 / 指向建不出来的路径 / 指向已存在的不可写目录 / 全部不可用。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTmpDir, ensureTmpDir, probeDir } from '../engine/lib/tmpdir.mjs';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sshtmp-test-'));
const writableData = path.join(ROOT, 'data');
fs.mkdirSync(writableData, { recursive: true });
const rmrf = (p) => { try { fs.chmodSync(p, 0o755); } catch { /* 可能不存在 */ } try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* 忽略 */ } };

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

// ── 场景 1：TEMP 未设置（env 里没有 TEMP/TMP/TMPDIR）→ 系统默认目录能用，直接用 ──
{
  console.log('\n== 场景 1：TEMP 未设置 ==');
  const r = resolveTmpDir({ dataDir: writableData, env: {}, sysTmp: os.tmpdir() });
  check('选中系统临时目录', r.source === 'system', r.dir);
  check('不标记为降级', r.degraded === false);
  check('目录真的可写', probeDir(r.dir).ok);
}

// ── 场景 2：TEMP 指向「不存在且建不出来」的路径（父目录不可写）→ 降级到数据目录 ──
{
  console.log('\n== 场景 2：TEMP 指向不存在、且建不出来的路径 ==');
  const roParent = path.join(ROOT, 'ro-parent');
  fs.mkdirSync(roParent, { recursive: true });
  fs.chmodSync(roParent, 0o555);
  const ghost = path.join(roParent, 'no-such-dir', 'deeper');
  const r = resolveTmpDir({ dataDir: writableData, env: { TEMP: ghost }, sysTmp: ghost });
  check('降级到 data-dir', r.source === 'data-dir', r.dir);
  check('标记为降级（要留痕）', r.degraded === true);
  const t = r.tried.find((x) => x.source === 'system');
  check('tried 里记下了系统 TEMP 的失败原因', !!t && !t.ok && !!t.error, JSON.stringify(t));
  check('降级后的目录可用', probeDir(r.dir).ok);
  fs.chmodSync(roParent, 0o755);
}

// ── 场景 3：TEMP 指向已存在的不可写目录（chmod 0555）→ 同样降级 ──
{
  console.log('\n== 场景 3：TEMP 指向不可写目录 ==');
  const ro = path.join(ROOT, 'readonly');
  fs.mkdirSync(ro, { recursive: true });
  fs.chmodSync(ro, 0o555);
  const r = resolveTmpDir({ dataDir: writableData, env: { TEMP: ro }, sysTmp: ro });
  check('降级到 data-dir', r.source === 'data-dir', r.dir);
  const t = r.tried.find((x) => x.source === 'system');
  check('不可写被探针抓到（EACCES）', !!t && !t.ok && /EACCES|EPERM/.test(String(t.error)), JSON.stringify(t));
  fs.chmodSync(ro, 0o755);
}

// ── 场景 4：TEMP 只是「不存在」但父目录可写 → 顺手建出来，不降级不报错 ──
{
  console.log('\n== 场景 4：TEMP 不存在但建得出来 ==');
  const ghost = path.join(ROOT, 'fresh-temp', 'sub');
  const r = resolveTmpDir({ dataDir: writableData, env: { TEMP: ghost }, sysTmp: ghost });
  check('就用系统 TEMP（已建好）', r.source === 'system' && r.dir === ghost, r.dir);
  check('不标记为降级', r.degraded === false);
  check('目录真的建出来了', fs.existsSync(ghost));
}

// ── 场景 5：SSH_TMPDIR 显式指定优先，且不算降级 ──
{
  console.log('\n== 场景 5：SSH_TMPDIR 显式覆盖优先 ==');
  const custom = path.join(ROOT, 'custom-tmp');
  fs.mkdirSync(custom, { recursive: true });
  const r = resolveTmpDir({ dataDir: writableData, env: { SSH_TMPDIR: custom }, sysTmp: os.tmpdir() });
  check('用 SSH_TMPDIR', r.source === 'SSH_TMPDIR' && r.dir === custom, r.dir);
  check('显式指定不算降级', r.degraded === false);
}

// ── 场景 6：一个能写的都没有 → 必须抛带可读文案的错误（不许静默返回死路径）──
{
  console.log('\n== 场景 6：全部不可用 → 可读错误 ==');
  const deadParent = path.join(ROOT, 'dead');
  fs.mkdirSync(deadParent, { recursive: true });
  fs.chmodSync(deadParent, 0o555);
  let err = null;
  try {
    resolveTmpDir({
      dataDir: path.join(deadParent, 'data'),
      env: { TEMP: path.join(deadParent, 'tmp'), LOCALAPPDATA: deadParent },
      platform: 'win32',
      sysTmp: path.join(deadParent, 'tmp'),
    });
  } catch (e) { err = e; }
  fs.chmodSync(deadParent, 0o755);
  check('抛错而不是返回死路径', !!err);
  check('文案可读（说明「临时目录全部不可用」并列原因）', !!err && /临时目录全部不可用/.test(err.message), err && err.message.slice(0, 100));
}

// ── 场景 7：ensureTmpDir 把 TEMP/TMP/TMPDIR 三个都改写，降级时打一行日志 ──
{
  console.log('\n== 场景 7：ensureTmpDir 写回环境变量 + 降级日志 ==');
  const ro = path.join(ROOT, 'ro2');
  fs.mkdirSync(ro, { recursive: true });
  fs.chmodSync(ro, 0o555);
  const env = { TEMP: ro };
  const logs = [];
  const r = ensureTmpDir({ dataDir: writableData, env, sysTmp: ro, log: (m) => logs.push(m) });
  check('TEMP/TMP/TMPDIR 都指向选中目录', env.TEMP === r.dir && env.TMP === r.dir && env.TMPDIR === r.dir, r.dir);
  check('降级时打了一行日志（含实际目录）', logs.length === 1 && logs[0].includes(r.dir), logs[0] || '(无日志)');
  fs.chmodSync(ro, 0o755);
}

// ── 场景 8：正常环境不该产生日志噪音 ──
{
  console.log('\n== 场景 8：正常环境不刷日志 ==');
  const env = { TEMP: os.tmpdir() };
  const logs = [];
  ensureTmpDir({ dataDir: writableData, env, sysTmp: os.tmpdir(), log: (m) => logs.push(m) });
  check('没有降级日志', logs.length === 0, logs.join('|'));
}

rmrf(ROOT);

console.log(`\n${fail === 0 ? '✓ 全部通过' : '✗ 有失败'}（${pass} 通过 / ${fail} 失败）`);
process.exit(fail === 0 ? 0 : 1);

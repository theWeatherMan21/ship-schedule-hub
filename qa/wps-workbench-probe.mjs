// WPS 回填工作台 —— 渲染层视觉验收探针（婉宜 2026-10-29 · 架构②）
//
// 为什么这么测：真机验收要爹地在 WPS 里点一次③，但**布局对不对**不该等他来发现。
// 这里把 build 后的 dist 用无头 Chrome 打开，注入一份冻结的夹具（假单号 TEST-BL-*），
// 断言三块（状态条 / 待办队列 / 回填预览）+ 时间线抽屉，并出图给人看。
//
// 红线：**headless、独立 profile、不弹窗**（探针一律不上屏）。
// 用法：
//   node qa/wps-workbench-probe.mjs            # 出图 + 断言，退出码 0/1
//   node qa/wps-workbench-probe.mjs --keep     # 保留 http 服务（调试用，一般不用）
// 产物：qa/probe-out/wps-workbench-*.png（.gitignore 已忽略）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(HERE, 'probe-out');
const argOf = (name) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : ''; };
const FIXTURE = argOf('fixture') || path.join(ROOT, 'tests', 'fixtures', 'wps-workbench.sample.json');
const MODE = argOf('mode') || 'full';   // full | empty（只看空状态长得对不对）
const PROFILE = path.join(ROOT, '.qa-data', 'wps-probe-profile');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('✗ 没有 dist/ —— 先 npm run build');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

// ---------- 静态服务（dist）----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  const f = path.join(DIST, u === '/' ? 'index.html' : u);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

// ---------- 无头 Chrome ----------
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 2,
  args: ['--hide-scrollbars'],
});
// Tauri 的 invoke 在纯浏览器里不存在 → 注入最小 mock，把工作台数据喂进去
await ctx.addInitScript(({ d }) => {
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      if (cmd === 'wps_jobs') return JSON.stringify(d);
      if (cmd === 'wps_addon') return JSON.stringify({ ok: true, installed: '0.9.43', latest: '0.9.43', updateAvailable: false, dir: '/tmp/jsaddons' });
      return '{}';
    },
    transformCallback: () => 1,
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  };
}, { d: data });

const page = ctx.pages()[0] || await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/favicon|404 \(Not Found\)/.test(t)) return;   // 静态服务没有 favicon，与本页无关
  errs.push('console: ' + t.slice(0, 160));
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 20000 });
await page.waitForSelector('#viewWps', { state: 'attached' });
// 点「WPS 插件」tab（页面默认在船期页）
await page.evaluate(() => document.querySelector('#tabs .tab[data-v="wps"]').click());
if (MODE === 'empty') {
  await page.waitForTimeout(1800);   // 空台账：没有行可等，给渲染留一拍
} else {
  await page.waitForFunction(() => {
    const el = document.getElementById('wpsGrid');
    return el && el.querySelectorAll('.wpsrow:not(.head)').length > 0;
  }, { timeout: 15000 });
}
await page.waitForTimeout(500);   // 等进度条动画落定（截图假信号第一类）

const shot = async (name, opts = {}) => {
  const p = path.join(OUT, `wps-workbench-${name}.png`);
  await page.screenshot({ path: p, ...opts });
  return p;
};

// ---------- 断言 ----------
const probe = await page.evaluate(() => {
  const txt = (sel) => (document.querySelector(sel)?.textContent || '').trim();
  const rows = [...document.querySelectorAll('#wpsGrid .wpsrow:not(.head)')];
  return {
    plug: txt('#wpsPlug'),
    bridge: txt('#wpsBridge'),
    cur: txt('#wpsCur'),
    last: txt('#wpsLast'),
    warn: txt('#wpsWarn'),
    warnHidden: document.getElementById('wpsWarn').hidden,
    queue: [...document.querySelectorAll('#wpsQueue .wpsq')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
    retrySep: txt('#wpsQueue .wpsq-sep'),
    chips: [...document.querySelectorAll('#wpsChips .wpschip')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
    rows: rows.length,
    firstRow: rows[0] ? rows[0].textContent.replace(/\s+/g, ' ').trim() : '',
    badges: [...document.querySelectorAll('#wpsGrid .wpsb')].map((x) => x.textContent.trim()),
    drawerHidden: document.getElementById('wpsDrawer').hidden,
    overflowY: document.documentElement.scrollHeight - window.innerHeight,
  };
});
// 空模式别用 01 这个文件名 —— 会覆盖满数据那组图，下次看证据就分不清哪张是哪种状态了
const shotFull = await shot(MODE === 'empty' ? '05-empty-queue' : '01-queue');

if (MODE === 'empty') {
  // 爹地第一次打开时的样子：还没有任何台账 → 队列/预览都得有一句人话，不能白屏
  const empty = await page.evaluate(() => ({
    queue: (document.querySelector('#wpsQueue')?.textContent || '').trim(),
    grid: (document.querySelector('#wpsGrid')?.textContent || '').trim(),
    retry: [...document.querySelectorAll('#wpsQueue .wpsq.retry')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
    pills: [...document.querySelectorAll('.wpsbar .wpspill')].map((x) => x.textContent.trim()),
  }));
  await shot('04-empty');
  const bad = [];
  if (!/还没有批次记录|还没有查询记录/.test(empty.queue + empty.grid)) bad.push('空状态没给提示：' + empty.queue + ' / ' + empty.grid);
  if (empty.retry.length < 1) bad.push('夹具里有待重查表，队列应显示出来');
  if (!/当前表 · /.test(empty.pills.join(' '))) bad.push('状态条没显示当前表');
  console.log(JSON.stringify({ ok: bad.length === 0, mode: 'empty', fails: bad, errors: errs, empty }, null, 1));
  await ctx.close(); server.close();
  process.exit(bad.length ? 1 : 0);
}

// 筛选「只看失败」
await page.evaluate(() => document.querySelector('#wpsChips .wpschip[data-f="fail"]').click());
await page.waitForTimeout(250);
const failCount = await page.evaluate(() => document.querySelectorAll('#wpsGrid .wpsrow:not(.head)').length);
const shotFail = await shot('02-filter-fail');

// 点第一行失败 → 时间线抽屉
await page.evaluate(() => document.querySelector('#wpsGrid .wpsrow:not(.head)').click());
await page.waitForTimeout(350);
const drawer = await page.evaluate(() => {
  const d = document.getElementById('wpsDrawer');
  return { hidden: d.hidden, text: d.textContent.replace(/\s+/g, ' ').trim().slice(0, 400), evs: d.querySelectorAll('.tev').length };
});
const shotDrawer = await shot('03-drawer');

// 队列重查行的「复制单号」按钮存在性（不真点剪贴板，只验入口）
const copyBtns = await page.evaluate(() => document.querySelectorAll('#wpsQueue .copy-retry').length);

await ctx.close();
server.close();

// ---------- 结论 ----------
const fails = [];
const must = (cond, msg) => { if (!cond) fails.push(msg); };
must(/插件 · v0\.9\.43/.test(probe.plug), `插件 pill 文案不对：${probe.plug}`);
must(/桥 · 在线/.test(probe.bridge) && /2\/4/.test(probe.bridge), `桥 pill 文案不对：${probe.bridge}`);
must(/当前表 · 放单方式汇总/.test(probe.cur), `当前表 pill 不对：${probe.cur}`);
must(/上次刷新 · \d\d-\d\d \d\d:\d\d/.test(probe.last), `上次刷新 pill 不对：${probe.last}`);
must(!probe.warnHidden && /420|429|限流/.test(probe.warn), `限流警示条没出来：${probe.warn}`);
must(probe.queue.length >= 3, `待办队列行数不足（含重查块）：${probe.queue.length}`);
must(!!probe.retrySep, '缺「待重查」分组标题');
must(probe.chips.length === 4, `筛选 chip 个数不对：${probe.chips.length}`);
must(probe.rows === 24, `预览行数不对：${probe.rows}（应为整批 24 行）`);
must(/TEST-BL-0001/.test(probe.firstRow), `首行内容不对：${probe.firstRow}`);
must(probe.badges.includes('成功') && probe.badges.some((b) => ['失败', '待手工', '限流'].includes(b)),
  `状态徽章缺成功或失败类：${probe.badges.slice(0, 8)}`);
must(failCount === 6, `「只看失败」应剩 6 行，实际 ${failCount}`);
must(drawer.hidden === false, '点行后抽屉没打开');
must(drawer.evs >= 1 || /没查到|超时|限流|官网/.test(drawer.text), `抽屉内容为空：${drawer.text}`);
must(copyBtns >= 1, '待重查行没有「复制单号」按钮');
must(probe.overflowY <= 2, `整页出现纵向溢出（${probe.overflowY}px）—— 说明三块没在视口里分配好`);

const report = { ok: fails.length === 0, fails, errors: errs, probe, failCount, drawer, copyBtns, shots: [shotFull, shotFail, shotDrawer] };
console.log(JSON.stringify(report, null, 1));
process.exit(fails.length ? 1 : 0);

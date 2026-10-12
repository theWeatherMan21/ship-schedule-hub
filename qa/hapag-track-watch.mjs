// Hapag OLB 维护等待器：每 POLL_MS 查一次，维护结束就立刻跑一次 search 并落盘结果
// 用法：SSH_ALLOW_HEADED=1 SSH_PROFILE_DIR=/tmp/xxx node qa/hapag-track-watch.mjs <单号> [最大分钟]
// 退出码：0 = 拿到结果（JSON 已写 OUT） / 2 = 仍维护超时 / 3 = 盾或表单异常
import fs from 'node:fs';
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';
import { trackHapag, BOOKING_URL } from '../engine/tracking/hapag.mjs';

const number = process.argv[2] || 'HLCU2B9E986E7C5E';
const maxMin = Number(process.argv[3] || 45);
const POLL_MS = Number(process.env.POLL_MS || 180000);
const OUT = process.env.OUT || '/tmp/hapag-track-watch.json';

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const r = await launchHeadedQuiet();
log('浏览器模式 ' + r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());
page.setDefaultTimeout(20000);

const banner = () => page.evaluate(() => {
  for (const e of document.querySelectorAll('.hal-info-box__title, .hal-info-box, #HlMessages *')) {
    const t = (e.textContent || '').trim();
    if (/maintenance|not available/i.test(t)) {
      const cs = getComputedStyle(e);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') return t.slice(0, 200);
    }
  }
  return '';
}).catch(() => '');

async function open(u) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch { /* 忽略 */ }
    for (let j = 0; j < 10; j++) {
      await sleep(2200);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => 0);
      if (!(await isBlockPage(page).catch(() => true)) && len > 150) return true;
    }
  }
  return false;
}

const deadline = Date.now() + maxMin * 60000;
let last = { state: 'pending' };
try {
  while (Date.now() < deadline) {
    const u = `${BOOKING_URL}?xcb=${Date.now()}`;
    const ok = await open(u);
    const b = ok ? await banner() : '';
    last = { at: new Date().toISOString(), shield: ok, banner: b };
    log(`shield=${ok} banner=${b ? '维护中' : '—'}`);
    if (ok && !b) {
      log('维护结束 → 跑一次搜索');
      const res = await trackHapag(number, { ctx, timeoutMs: 120000 });
      fs.writeFileSync(OUT, JSON.stringify({ watch: last, result: res }, null, 1));
      log('结果 ok=' + res.ok + (res.ok ? ' 行数=' + res.containers.length : ' err=' + res.error));
      await ctx.close().catch(() => {});
      process.exit(res.ok ? 0 : 3);
    }
    await sleep(POLL_MS);
  }
  fs.writeFileSync(OUT, JSON.stringify({ watch: last, result: null, note: 'timeout-still-maintenance' }, null, 1));
  log('超时仍在维护');
  await ctx.close().catch(() => {});
  process.exit(2);
} catch (e) {
  fs.writeFileSync(OUT, JSON.stringify({ watch: last, error: String(e).slice(0, 300) }, null, 1));
  log('异常 ' + String(e).slice(0, 200));
  await ctx.close().catch(() => {});
  process.exit(4);
}

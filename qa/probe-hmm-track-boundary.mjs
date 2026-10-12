// HMM 追踪 · 边界/反向用例（同一个浏览器会话串行两次，模拟真人连查）：
//   ① 假单号 HDMUSHAF00000000 —— 站点应该给「明确否定」，我们要如实回传，不能长成崩溃/空
//   ② 真箱号 CAIU3102121 —— 站点自动识别箱号，应给出与提单一致的时间线
import { launch, sleep } from '../engine/browser.mjs';
import { trackHmm } from '../engine/tracking/hmm.mjs';

const ctx = await launch({ headless: true });
try {
  const nf = await trackHmm('HDMUSHAF00000000', { ctx, timeoutMs: 45000 });
  console.log('① 假单号 →', JSON.stringify({ ok: nf.ok, notFound: !!nf.notFound, blocked: !!nf.blocked, error: nf.error }, null, 0));
  await sleep(4000);
  const ct = await trackHmm('CAIU3102121', { ctx, timeoutMs: 45000 });
  console.log('② 真箱号 →', JSON.stringify({ ok: ct.ok, docNum: ct.docNum, origin: ct.origin, destination: ct.destination, events: (ct.events || []).length, status: ct.status }));
  if (ct.events) for (const e of ct.events.slice(-3)) console.log('     ', e.time, '|', e.location, '|', e.activity);
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
await ctx.close().catch(() => {});
process.exit(0);

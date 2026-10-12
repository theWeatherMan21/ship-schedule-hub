// MSC 追踪：轻量页 vs 完整页 的页内 fetch 对照（提速可行性）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

async function tryAt(label, url, settleMs) {
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(settleMs);
    const nav = Date.now() - t0;
    const r = await page.evaluate(async () => {
      try {
        const resp = await fetch('/api/feature/tools/TrackingInfo', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*', 'x-requested-with': 'XMLHttpRequest' },
          body: JSON.stringify({ trackingNumber: 'MEDUW7272208', trackingMode: '0' }),
        });
        const t = await resp.text();
        let ok = false; try { ok = JSON.parse(t).IsSuccess === true; } catch { /* 忽略 */ }
        return { status: resp.status, len: t.length, ok, head: t.slice(0, 120) };
      } catch (e) { return { error: String(e).slice(0, 140) }; }
    }).catch((e) => ({ error: String(e).slice(0, 140) }));
    console.log(`${label}: 导航+等待=${nav}ms  fetch=${Date.now() - t0 - nav}ms  → ${JSON.stringify(r)}`);
    return r;
  } catch (e) {
    console.log(`${label}: ERR ${String(e).slice(0, 160)}`);
    return null;
  }
}

await tryAt('完整追踪页', 'https://www.msc.com/en/track-a-shipment', 4000);
await tryAt('轻量页 /__light__', 'https://www.msc.com/__light__', 800);
await tryAt('轻量页 二次', 'https://www.msc.com/__light__', 300);
await ctx.close().catch(() => {});
process.exit(0);

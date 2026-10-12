// MSC 追踪 API 直测（页面内 fetch，绕 Akamai）
// 用法：SSH_PROFILE_DIR=/tmp/msc-api-$$ bash qa/quiet-probe.sh qa/probe-msc-tracking-api.mjs "号1:mode,号2:mode"
import { launch, sleep } from '../engine/browser.mjs';

const pairs = (process.argv[2] || 'M237055674:0,M237055674:1').split(',').map((s) => {
  const [n, m] = s.split(':');
  return { n, m: m || '0' };
});

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
// 先要 cookie 上下文（过 Akamai）
await page.goto('https://www.msc.com/en/track-a-shipment', { waitUntil: 'domcontentloaded', timeout: 50000 });
await sleep(5000);

for (const { n, m } of pairs) {
  const r = await page.evaluate(async (body) => {
    try {
      const resp = await fetch('/api/feature/tools/TrackingInfo', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify(body),
      });
      const t = await resp.text();
      return { status: resp.status, len: t.length, body: t.slice(0, 2500) };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  }, { trackingNumber: n, trackingMode: m }).catch((e) => ({ error: String(e).slice(0, 160) }));
  console.log(`\n### ${n} mode=${m} → status=${r.status} len=${r.len} ${r.error || ''}`);
  console.log(r.body || '');
  await sleep(1500);
}
await ctx.close().catch(() => {});
process.exit(0);

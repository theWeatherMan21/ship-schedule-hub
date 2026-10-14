// [ARCHIVED 2026-10-14] 本探针目标 URL（schedules-by-geography）已 404（Hapag 官网改版）；
//   CF cookie 复用问题早已由 hapag 追踪适配器解决（无头优先+有头兜底）。保留仅为史料。
// ⚠️ 10-09 爹地红线：探针不得弹窗。需要真指纹破反爬时，请照 qa/headed-minimized-probe.mjs
//   那套做（headless:false + CDP Browser.setWindowBounds 最小化 + 回读 AXMinimized 验证）。
// Hapag 有头实测：真浏览器窗口能否过 CF？过了之后 cookie 能否让无头也通？（婉宜 9-23）
import { launch, sleep } from '../engine/browser.mjs';

const URL = 'https://www.hapag-lloyd.com/en/online-business/schedules/schedules-by-geography.html';

// ① 有头打开（真指纹）——看 CF 是否放行
console.log('=== ① 有头模式 ===');
const ctx1 = await launch({ headless: true });
const p1 = await ctx1.newPage();
await p1.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto:', e.message.slice(0, 60)));
for (let i = 1; i <= 6; i++) {
  await sleep(5000);
  const st = await p1.evaluate(() => ({
    t: document.title.slice(0, 50),
    len: document.body.innerText.length,
    challenge: /just a moment|security check|checking your browser|verifying you are human/i.test(document.body.innerText),
  })).catch(() => ({ t: '?', len: -1, challenge: null }));
  console.log(`  ${i * 5}s: title="${st.t}" len=${st.len} 挑战中=${st.challenge}`);
  if (!st.challenge && st.len > 1500) { console.log('  ✅ 有头通过 CF'); break; }
}
const cookies = await ctx1.cookies().catch(() => []);
const cfCookie = cookies.find((c) => /cf_clearance|__cf/i.test(c.name));
console.log('  cf cookie:', cfCookie ? `${cfCookie.name} (expires ${new Date(cfCookie.expires * 1000).toISOString().slice(0, 16)})` : '无');
await ctx1.close().catch(() => {});

// ② 无头复用同一 profile——看 cookie 是否让无头也通
console.log('=== ② 无头模式（同 profile，带 cf cookie）===');
const ctx2 = await launch({});
const p2 = await ctx2.newPage();
await p2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await sleep(8000);
const st2 = await p2.evaluate(() => ({
  t: document.title.slice(0, 50),
  len: document.body.innerText.length,
  challenge: /just a moment|security check|checking your browser|verifying you are human/i.test(document.body.innerText),
  head: document.body.innerText.slice(0, 120).replace(/\n+/g, ' | '),
}));
console.log('  结果:', JSON.stringify(st2));
await ctx2.close().catch(() => {});
process.exit(0);

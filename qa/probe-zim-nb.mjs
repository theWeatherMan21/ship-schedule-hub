
// 用今天出过 12 条的线（宁波→阿什杜德）验证 ZIM 的两条路：① 站内 API ② 结果直链 + 影子 DOM 取行
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
await H.dismissCookies(page); await sleep(1000);
console.log('① 站内 API（引擎里 zimInPage 那条）:');
const api = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const out = [];
  const pairs = [['CNNGB;0', 'ILASD;0'], ['CNNGB;10', 'ILASD;10'], ['CNNGB;0', 'ILASD;10'], ['CNNGB;10', 'ILASD;0']];
  const from = new Date(Date.now() + 864e5);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const fdate = `${String(from.getUTCDate()).padStart(2,'0')}-${months[from.getUTCMonth()]}-${from.getUTCFullYear()}`;
  for (const [oc, dc] of pairs) {
    const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(oc)}&PortDestinationCode=${encodeURIComponent(dc)}&Direction=true&FromDate=${fdate}&WeeksAhead=4&CountryCode=US&CargoType=true`;
    try {
      const r = await fetch(u, { headers: { accept: 'application/json' } });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      const n = Array.isArray(j && j.routes) ? j.routes.length : -1;
      out.push(`${oc}→${dc}: HTTP ${r.status} routes=${n} ${n < 0 ? t.slice(0, 60) : ''}`);
      if (n > 0) return { hit: [oc, dc], n, sample: JSON.stringify(j.routes[0]).slice(0, 500), log: out };
    } catch (e) { out.push(`${oc}→${dc}: ERR ${String(e).slice(0, 50)}`); }
  }
  return { hit: null, n: 0, log: out };
});
console.log('   ' + (api.log || []).join('\n   '));
if (api.sample) console.log('   ✅ 命中 ' + api.hit.join('→') + ' routes=' + api.n + '\n   样例: ' + api.sample);
console.log('');
console.log('② 结果直链（CNNGB;0 → ILASD;0）+ 影子 DOM 深度取行:');
const u2 = 'https://www.zim.com/schedules/point-to-point?portcode=CNNGB%3B0&portdestinationcode=ILASD%3B0&direction=true&fromdate=today&weeksahead=6&cargotype=false&emissionstype=false&toggleemission=true';
const rr = await page.goto(u2, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
console.log('   HTTP ' + (rr ? rr.status() : '?') + '  URL: ' + page.url().slice(0, 120));
await sleep(11000);
const deep = await page.evaluate(() => {
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (!el.children.length && el.textContent && el.textContent.trim()) { const t = el.textContent.replace(/\s+/g, ' ').trim(); if (t.length < 120) out.push(t); }
    }
  };
  try { walk(document); } catch {}
  return out;
});
const rows = deep.filter((t) => /vessel|voyage|ETD|ETA|transit|\d{2}-[A-Z][a-z]{2}|\d{2}\/\d{2}|ILASD|CNNGB/i.test(t));
console.log('   深层文本 ' + deep.length + ' 条，相关 ' + rows.length + ' 条:');
for (const t of rows.slice(0, 30)) console.log('      ' + t);
await ctx.close().catch(() => {});

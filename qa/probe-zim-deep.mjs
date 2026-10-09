
// ① 直接跳 ZIM 结果直链（带参数）② 深度遍历影子 DOM 取文本
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
const url = 'https://www.zim.com/schedules/point-to-point?portcode=CNSNH%3B10&portdestinationcode=TRLIY%3B0&direction=true&fromdate=today&weeksahead=6&cargotype=false&emissionstype=false&toggleemission=true';
console.log('直接跳结果直链（CNSNH → 伊兹密尔区域 TRLIY）');
const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => { console.log('goto 失败 ' + e.message.slice(0, 60)); return null; });
console.log('HTTP ' + (r ? r.status() : '?'));
await sleep(9000);
await H.dismissCookies(page); await sleep(1200);
// 深度取文本：递归打开所有 shadowRoot
const deep = await page.evaluate(() => {
  const out = [];
  const walk = (root, depth) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { out.push('  '.repeat(depth) + '[shadow:' + el.tagName.toLowerCase() + ']'); walk(el.shadowRoot, depth + 1); }
      if (el.children.length === 0 && el.textContent && el.textContent.trim()) out.push(el.textContent.replace(/\s+/g, ' ').trim().slice(0, 90));
    }
  };
  try { walk(document, 0); } catch (e) { out.push('ERR ' + e.message); }
  return out;
}).catch(() => []);
console.log('深层文本节点数: ' + deep.length);
const interesting = deep.filter((t) => /vessel|voyage|ETD|ETA|\d{2}[-\/]\d{2}|TRIST|TRLIY|CNSNH|transit|week|no .*result|schedule/i.test(t));
console.log('相关行 (' + interesting.length + '):');
for (const t of interesting.slice(0, 40)) console.log('   ' + t);
fs.writeFileSync('/tmp/zim-deep.txt', deep.join('\n'));
console.log('全部已存 /tmp/zim-deep.txt');
const tbl = await page.locator('table, [role="table"], [role="row"]').count().catch(() => 0);
console.log('表格类元素数: ' + tbl);
await ctx.close().catch(() => {});

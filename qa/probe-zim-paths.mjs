
// 用真指纹浏览器逐个试 ZIM 的几条入口，看哪条能拿到船期表单/结果
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const { ctx, mode } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
const paths = [
  'https://www.zim.com/',
  'https://www.zim.com/tools/schedules',
  'https://www.zim.com/schedules',
  'https://www.zim.com/tools/schedules/point-to-point',
];
for (const u of paths) {
  let status = '?', title = '', inputs = 0, hasForm = false, txtlen = 0;
  const resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => null);
  status = resp ? resp.status() : 'ERR ' + '?';
  await sleep(3500);
  await H.dismissCookies(page);
  await sleep(800);
  title = (await page.title().catch(() => '')).slice(0, 50);
  const d = await page.evaluate(() => ({
    inputs: document.querySelectorAll('input, [role="combobox"]').length,
    txt: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120),
    denied: /access denied|challenge/i.test(document.body.innerText),
  })).catch(() => ({ inputs: 0, txt: '', denied: false }));
  console.log(`   ${u.replace('https://www.zim.com', '') || '/'}  → HTTP ${status} | 输入框 ${d.inputs} | 拒签=${d.denied} | ${title}`);
  console.log('        文本: ' + d.txt.slice(0, 110));
}
await ctx.close().catch(() => {});

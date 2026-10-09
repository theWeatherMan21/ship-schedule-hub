
// /schedules 页面的表单长什么样（ZIM 改版后的正路）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.zim.com/schedules', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(5000);
await H.dismissCookies(page); await sleep(1200);
const dump = async (tag) => {
  const d = await page.evaluate(() => ({
    url: location.href,
    inputs: Array.from(document.querySelectorAll('input, [role="combobox"], select')).map((e) => ({
      tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '', id: e.id || '',
      ph: e.getAttribute('placeholder') || '', aria: e.getAttribute('aria-label') || '',
      lab: (e.closest('div,label,fieldset')?.innerText || '').replace(/\s+/g, ' ').slice(0, 45),
      vis: getComputedStyle(e).display !== 'none',
    })),
    clickableTexts: Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"], li')).map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 40).slice(0, 30),
  })).catch(() => ({ url: '', inputs: [], clickableTexts: [] }));
  console.log(`── [${tag}] ${d.url}`);
  console.log('   输入/下拉:', JSON.stringify(d.inputs).slice(0, 700));
  console.log('   可点文本:', JSON.stringify(d.clickableTexts).slice(0, 500));
};
await dump('刚打开');
// 试试点 "point to point"
for (const label of [/point\s*to\s*point/i, /port\s*to\s*port/i, /search\s*schedule/i]) {
  const el = page.getByText(label).first();
  if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('点到了: ' + label);
    await el.click({ timeout: 4000 }).catch(() => {});
    await sleep(4000);
    break;
  }
}
await dump('点过 point-to-point 之后');
await ctx.close().catch(() => {});

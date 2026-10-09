
// 离线单元测试：验证填表助手在"船司式自定义组件"下的行为（不起真站、零网络副作用）
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import { pickOption, typeAndPickCandidate } from '../engine/lib/utils.mjs';

const HTML = `<!doctype html><meta charset="utf-8"><body>
  <!-- 甲：马士基式 —— 父 listbox + li[aria-selected]，**没有** role="option" 属性 -->
  <input id="a" placeholder="From (City, Country/Region)" style="width:400px">
  <ul id="ac" role="listbox" style="display:none;width:400px">
    <li aria-selected="false">Containers</li>
    <li aria-selected="false">Tianjin (Tianjin), China CY</li>
    <li aria-selected="false">Xingang (Tianjin), China CY</li>
  </ul>
  <script>
    const inp = document.getElementById('a'), ul = document.getElementById('ac');
    inp.addEventListener('input', () => { ul.style.display = 'block'; });
    inp.addEventListener('focus', () => { if (inp.value) ul.style.display = 'block'; });
    ul.querySelectorAll('li').forEach(li => li.addEventListener('click', () => { inp.value = li.textContent; ul.style.display = 'none'; }));
  </script>
</body>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent(HTML);
const q = { _o: { locode: 'CNTNJ', country: 'CN', name: 'Tianjin', word: 'tianjin', siblings: [{ name: 'Tianjin Xingang Pt' }] } };

// ① 用 pick 函数明确要 CY 里带 Xingang 的那条（船司式组件能否被找到 → 靠 ARIA 兜底层）
await page.locator('#a').click();                       // 真站点要先点+打字才会渲染候选
await page.locator('#a').type('xingang', { delay: 40 });
await page.waitForTimeout(400);
const hit1 = await pickOption(page, 'xingang', { timeout: 6000, pick: (t) => /Xingang \(Tianjin\).*\bCY\b/.test(t) });
console.log('  ① 无 role 属性的船司式候选 →', hit1 ? '找到并选中: ' + hit1 : '✗ 没找到（ARIA 兜底层失效）');

// ② 匹配不上时必须返回 null（绝不盲点第一个）
await page.evaluate(() => { const i = document.getElementById('a'); i.value = ''; });
const hit2 = await pickOption(page, 'zzzznothing', { timeout: 3000, pick: (t) => /不存在的港/.test(t) });
console.log('  ② 匹配不上 →', hit2 === null ? '✓ 正确返回 null（没有盲点第一个）' : '✗ 盲点了: ' + hit2);

// ③ typeAndPickCandidate：多写法依次试 + 清框（旧写法不残留）
await page.evaluate(() => { document.getElementById('a').value = ''; });
const hit3 = await typeAndPickCandidate(page, page.locator('#a'), ['zznotaport', 'xingang'], {
  polls: 6, pollMs: 300, pick: (t) => /Xingang \(Tianjin\)/.test(t),
});
const val3 = await page.locator('#a').inputValue();
console.log('  ③ 多写法（第一个失败→第二个成功）→', hit3 ? '选上: ' + hit3 : '✗ 没选上');
console.log('     输入框最终值 =', JSON.stringify(val3.slice(0, 40)), /zznotaport/.test(val3) ? '✗ 旧文字残留（清框失败）' : '✓ 无残留');
await browser.close();

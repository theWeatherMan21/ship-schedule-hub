// 探针：HMM 目的港候选「怎么点才能把 code 写成 TRIST」——变体实验（婉宜 9-29）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const variant = process.argv[2] || 'pw';
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const { page } = await openPage(ctx, 'https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do');
  await sleep(7000);
  await dismissCookies(page).catch(() => {});

  // 起运港先弄好（CNNGB 已验证 OK）
  const inpO = page.locator('#srchPointFrom');
  await inpO.click({ timeout: 8000 }).catch(() => {});
  await inpO.fill('').catch(() => {});
  await inpO.type('ningbo', { delay: 80 });
  await sleep(4000);
  await page.locator('li:has-text("[CNNGB]")').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(1200);

  // 目的港：输入 istanbul
  const inpD = page.locator('#srchPointTo');
  await inpD.click({ timeout: 8000 }).catch(() => {});
  await inpD.fill('').catch(() => {});
  await inpD.type('istanbul', { delay: 80 });
  await sleep(5000);

  // dump 候选结构（tagName/class/是否可见/innerText）
  const cands = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('li, a, div, span')) {
      const t = (el.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t || !/\[TRIST\]|\[TRHAY\]|\[TRTRA\]/.test(t)) continue;
      out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), vis: !!el.offsetParent, text: t.slice(0, 60), kids: el.children.length });
    }
    return out.slice(0, 12);
  });
  console.log('候选元素结构（' + variant + '）:');
  cands.forEach((c) => console.log('  ', JSON.stringify(c)));

  const readCode = () => page.evaluate(() => document.getElementById('srchPointTo_code')?.value || '(空)');

  if (variant === 'pw') {
    // 变体 A：Playwright 真实鼠标点击（含 hover/down/up）
    await page.locator('li:has-text("[TRIST]")').first().click({ timeout: 6000 }).catch((e) => console.log('  pw click 失败:', String(e).slice(0, 80)));
  } else if (variant === 'mouse') {
    // 变体 B：手动 mousedown/mouseup/click 事件序列
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('li')].find((e) => (e.innerText || '').includes('[TRIST]'));
      if (el) {
        const r = el.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5 };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }
    });
  } else if (variant === 'key') {
    // 变体 C：输入足够窄的词 + 键盘 Enter
    await inpD.click({ timeout: 5000 }).catch(() => {});
    await inpD.press('Control+a').catch(() => {});
    await inpD.type('istanbul, turkiye', { delay: 90 });
    await sleep(4000);
    await inpD.press('ArrowDown').catch(() => {});
    await sleep(400);
    await inpD.press('Enter').catch(() => {});
  } else if (variant === 'blur') {
    // 变体 D：点击候选后立刻按 Escape 关下拉、再回读
    await page.locator('li:has-text("[TRIST]")').first().click({ timeout: 6000 }).catch(() => {});
    await sleep(300);
    await inpD.press('Escape').catch(() => {});
  }

  await sleep(2000);
  const code = await readCode();
  const shown = await page.evaluate(() => document.getElementById('srchPointTo')?.value || '(空)');
  console.log(`=> [${variant}] 输入框=${shown}  隐藏code=${code}`);
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 300));
} finally {
  await ctx.browser().close().catch(() => {});
}

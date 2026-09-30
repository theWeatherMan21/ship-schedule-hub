// DOM 小工具：抗脆弱的填值 / 点击 / 超时
export function withTimeout(promise, ms, what = '超时') {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(what)), ms); }),
  ]);
}

// 填值：先试 fill，失败则用原生 setter + input/change 事件（对付 readonly/受控组件）
export async function setValue(locator, value) {
  try {
    await locator.fill(String(value), { timeout: 5000 });
    return 'fill';
  } catch { /* fallthrough */ }
  const el = await locator.elementHandle();
  if (!el) throw new Error('元素不存在，无法填值');
  await locator.evaluate((node, v) => {
    const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(node, v); else node.value = v;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
  }, String(value));
  return 'native-setter';
}

// 按「当前 value 形状」找输入框并改值（用于无名日期框）
export async function setInputByValueShape(page, shapeRe, value) {
  return page.evaluate(({ shape, v }) => {
    const re = new RegExp(shape);
    const node = [...document.querySelectorAll('input')].find((i) => re.test(String(i.value || '')) && (i.offsetWidth || i.offsetHeight));
    if (!node) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(node, v); else node.value = v;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { shape: shapeRe.source || String(shapeRe), v: String(value) });
}

// 在可见的 input 里按 placeholder 找
export function inputsByPlaceholder(page, re) {
  return page.locator('input').filter({ hasNot: page.locator('[type="hidden"]') });
}

export async function visibleCount(locator) {
  const n = await locator.count().catch(() => 0);
  let c = 0;
  for (let i = 0; i < n; i++) if (await locator.nth(i).isVisible().catch(() => false)) c++;
  return c;
}

// 点击文本匹配的按钮/链接（覆盖 <button>/<a>/role=button）
export async function clickByText(page, re, { timeout = 8000, last = false } = {}) {
  const btns = page.getByRole('button', { name: re });
  const links = page.getByRole('link', { name: re });
  for (const set of [btns, links]) {
    const n = await set.count().catch(() => 0);
    if (!n) continue;
    const idx = last ? n - 1 : 0;
    for (let i = 0; i < n; i++) {
      const el = set.nth(last ? n - 1 - i : i);
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout }).catch(() => {});
        return true;
      }
    }
    void idx;
  }
  return false;
}

import { pickOption } from './utils.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fillAutocomplete(page, locator, text, opts = {}) {
  const t = String(text);
  await locator.click({ timeout: 10000 }).catch(() => {});
  const ro = await locator.getAttribute('readonly').catch(() => null);
  await locator.fill('').catch(() => {});
  let typed = false;
  if (!ro) { try { await locator.type(t, { delay: 70, timeout: 8000 }); typed = true; } catch { /* fallthrough */ } }
  if (!typed) { try { await page.keyboard.type(t, { delay: 70 }); typed = true; } catch { /* fallthrough */ } }
  if (!typed) await setValue(locator, t).catch(() => {});
  await sleep(1400);
  return pickOption(page, t, { timeout: 9000, pick: opts.pick });
}


// OOCL 滑块：解缺口 → 真实拖拽 → 等有效 token
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);
await page.evaluate(() => {
  window.__cb = null;
  if (typeof window.captchaCallback === 'function') {
    const o = window.captchaCallback;
    window.captchaCallback = (t, ...r) => { try { window.__cb = t; } catch { /* */ } try { return o(t, ...r); } catch { return undefined; } };
  }
}).catch(() => {});
const pick = async (ng, word) => {
  const inp = page.locator(`input[ng-model="${ng}"]`);
  await inp.click({ timeout: 15000 }); await inp.fill('').catch(() => {});
  await page.keyboard.type(word, { delay: 80 });
  for (let i = 0; i < 18; i++) {
    await sleep(400);
    const ok = await page.evaluate((w) => {
      const lists = [...document.querySelectorAll('ul')].filter((l) => l.offsetParent !== null && /th-dropdown-menu/.test(l.className) && l.querySelectorAll('li').length);
      const li = lists.length ? [...lists[0].querySelectorAll('li')].find((x) => new RegExp(w, 'i').test(x.textContent || '')) : null;
      if (!li) return null; (li.querySelector('a, span') || li).click(); return true;
    }, word).catch(() => null);
    if (ok) break;
  }
};
await pick('user.origin', 'Ningbo'); await pick('user.destination', 'Hamburg');
await page.evaluate(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /^search$/i.test((x.textContent || '').trim()) && x.offsetParent !== null); if (b) b.click(); }).catch(() => {});
await sleep(5000);
// ① 解缺口：从 __cb 的图里找（原图里那道竖向缺口）
const solved = await page.evaluate(async () => {
  const o = window.__cb || {};
  if (!o.originalImageBase64) return { err: '没有图' };
  const load = (b64) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
  try {
    const img = await load(o.originalImageBase64);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const W = img.width, H = img.height;
    // 逐列算"与相邻列的差异能量"，缺口两侧是强竖边；缺口宽 ~ 55px（piece 图宽）
    const colDiff = new Array(W).fill(0);
    for (let x = 1; x < W; x++) {
      let s = 0;
      for (let y = Math.floor(H * 0.15); y < Math.floor(H * 0.85); y += 2) {
        const i1 = (y * W + x) * 4, i0 = (y * W + (x - 1)) * 4;
        s += Math.abs(d[i1] - d[i0]) + Math.abs(d[i1 + 1] - d[i0 + 1]) + Math.abs(d[i1 + 2] - d[i0 + 2]);
      }
      colDiff[x] = s;
    }
    // 找最强的两条竖边，且相距 ~ piece 宽（40-70px）
    let best = { x: -1, score: 0, w: 0 };
    for (let x = 40; x < W - 80; x++) {
      for (let w = 40; w <= 70; w += 2) {
        const sc = colDiff[x] + colDiff[x + w];
        if (sc > best.score) best = { x, score: sc, w };
      }
    }
    return { W, H, guess: best.x, pieceW: best.w, score: Math.round(best.score) };
  } catch (e) { return { err: String(e).slice(0, 80) }; }
});
console.log('解缺口:', JSON.stringify(solved));
// ② 找滑块并真实拖拽
const slider = await page.evaluate(() => {
  const el = document.querySelector('.verify-move-block, .verify-bar-area .verify-move-block, [class*=move-block], [class*=slider]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: (el.className || '').toString().slice(0, 60) };
});
console.log('滑块:', JSON.stringify(slider));
if (slider && solved && solved.guess > 0) {
  await page.mouse.move(slider.x, slider.y);
  await page.mouse.down();
  // 带节奏地拖（人类轨迹）
  const target = solved.guess;
  for (let i = 1; i <= 20; i++) {
    const x = slider.x + (target * i) / 20;
    await page.mouse.move(x, slider.y + Math.sin(i / 3) * 2);
    await sleep(30 + Math.random() * 40);
  }
  await page.mouse.up();
  await sleep(4000);
  const res = await page.evaluate(() => ({ result: (window.__cb || {}).result, hasToken: !!((window.__cb || {}).token) }));
  console.log('拖后:', JSON.stringify(res));
}
await ctx.close().catch(() => {});

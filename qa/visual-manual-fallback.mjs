// 视觉验收：手工兜底面板 + 手工结果着色（浏览器里没有 Tauri IPC，走静态预览 + 计算样式断言）
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = process.env.OUT_DIR || '/tmp';
import os from 'node:os';
const css = fs.readFileSync(`${ROOT}/src/styles.css`, 'utf8');

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${css}</style>
<style>body{padding:24px;background:var(--bg);font-family:-apple-system,sans-serif}</style></head><body>

<!-- ① 失败态：兜底面板 -->
<div class="trackcard" id="card1">
  <div class="thead"><span class="tcarrier">OOCL</span><span class="tnum">TEST-BL-0001</span></div>
  <div class="tfail">⚠️ Tracking is not wired up for OOCL yet</div>
  <div class="mfallback">
    <div class="mftitle">这条路自动查不通 —— 可以手工查一次，结果粘回来会记进这里</div>
    <a class="mflink" href="#" id="lnk">① 打开 OOCL 官网查（单号自动复制）</a>
    <textarea class="mfpaste" rows="3" placeholder="② 把官网查到的整段文本粘进来"></textarea>
    <div class="mfrow"><button type="button" class="mfparse">解析并填入</button><span class="mfnote">认出 4 条</span></div>
  </div>
</div>

<!-- ② 手工结果（已解析）：角标 + 描边 + 事件着色 -->
<div class="trackcard clickable manual" id="card2">
  <div class="thead"><span class="tcarrier">OOCL</span><span class="tnum">TEST-BL-0001</span><span class="spacer"></span><span class="tmanual">手工</span><span class="tmore">Details ▾</span></div>
  <div class="troute">? → ?</div><div class="tmain">Discharged · 11-21 @ Hamburg, Germany</div><div class="tmeta">ETA — · 手工录入</div>
  <div class="tbody">
    <div class="tev manual"><span class="d">10-28</span><span class="a">Gate In</span><span class="l">Shanghai, China</span></div>
    <div class="tev manual"><span class="d">10-29</span><span class="a">Loaded</span><span class="l"></span></div>
    <div class="tev manual"><span class="d">11-20</span><span class="a">Arrived</span><span class="l">Hamburg, Germany</span></div>
    <div class="tev manual"><span class="d">11-21</span><span class="a">Discharged</span><span class="l">Hamburg, Germany</span></div>
  </div>
</div>

<!-- ③ 未解析：原文保留 -->
<div class="trackcard manual" id="card3">
  <div class="thead"><span class="tcarrier">OOCL</span><span class="tnum">TEST-BL-0001</span><span class="spacer"></span><span class="tmanual">手工 · 未解析</span></div>
  <div class="tmeta">没认出日期/事件格式 —— 原文已原样保存，没有丢</div>
  <pre class="mraw">完全看不懂的一段话，没有任何日期信息 ABC DEF</pre>
</div>
</body></html>`;

fs.writeFileSync(`${OUT}/preview-manual.html`, html);

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(`file://${OUT}/preview-manual.html`, { waitUntil: 'load' });
await page.waitForTimeout(500);

const probe = await page.evaluate(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const card2 = document.getElementById('card2');
  const badge = document.querySelector('#card2 .tmanual');
  const tev = document.querySelector('.tev.manual .d');
  const fb = document.querySelector('.mfallback');
  const link = document.querySelector('.mflink');
  const btn = document.querySelector('.mfparse');
  const card1 = document.getElementById('card1');
  return {
    normalCardBorder: cs(card1).borderColor,
    manualCardBorder: cs(card2).borderColor,
    manualCardShadow: cs(card2).boxShadow.slice(0, 60),
    badgeBg: cs(badge).backgroundColor,
    badgeColor: cs(badge).color,
    badgeRadius: cs(badge).borderRadius,
    eventDateColor: cs(tev).color,
    fallbackBg: cs(fb).backgroundColor,
    fallbackBorder: cs(fb).borderStyle + ' ' + cs(fb).borderColor,
    linkColor: cs(link).color,
    parseBtnColor: cs(btn).color,
    docHeight: document.body.scrollHeight,
  };
});

await page.screenshot({ path: `${OUT}/ui-manual-fallback.png`, fullPage: true });
await browser.close();
console.log(JSON.stringify(probe, null, 2));

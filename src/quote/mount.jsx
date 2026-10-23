// 报价 tab 挂载点：用 Shadow DOM 把 QuoteAssist 的整套样式与主 App 隔离，
// 避免 674 行原生 CSS 和 ShipScheduleHub 的玻璃拟态样式互相污染（10-23 移植）。
//
// 说明：
// - 懒加载：只有第一次切到「报价」tab 时才 import 本模块（React 单独一个 chunk）
// - quote.css 用 ?inline 取字符串后注入 shadow root（:host 变量作用域在里面）
// - 事件与 Tauri invoke 不受 shadow 影响，正常穿透
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuoteTab from './QuoteTab';
import css from './quote.css?inline';

let root = null;

export function mountQuoteTab() {
  if (root) return;
  const host = document.getElementById('viewQuote');
  if (!host) {
    console.error('[quote] 找不到 #viewQuote 容器');
    return;
  }
  console.log('[quote] 开始挂载，host 尺寸=', host.clientWidth, 'x', host.clientHeight);

  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.style.height = '100%';
  shadow.appendChild(container);

  try {
    root = createRoot(container);
    root.render(<QuoteTab />);
    console.log('[quote] 报价 tab 已挂载（Shadow DOM 隔离），css 长度=', css.length);
  } catch (e) {
    console.error('[quote] React 渲染失败', e);
    container.textContent = '报价模块渲染失败：' + (e && e.message ? e.message : String(e));
    container.style.cssText = 'padding:20px;color:#c00;font:13px -apple-system,sans-serif';
  }
}

// 手工兜底文本解析 —— **唯一一份实现，两边共用**
//
// 为什么放在 engine 而不是各前端：App 前端（vite 打包）和 WPS 插件桥（node 动态 import）
// 都能读到这里，所以插件只需要调桥上的 /parse-manual，解析逻辑永远只有一处。
// 纯字符串处理，不碰 node API、不碰 DOM —— App 侧可以安全地 import 进浏览器 bundle。
//
// 爹地 10-28：查不出结果时给链接 + 收粘贴；粘贴内容解析不出就原样留着，不许丢。

const MONTHS3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// 事件词表：先抹掉再找地名，否则 [A-Za-z ',-] 会把 "Loaded  Ningbo" 整个吞进去
const EVENT_RE = /gate\s*-?\s*in|gate\s*-?\s*out|loaded|discharg(?:ed|e)|arriv(?:ed|al)|depart(?:ed|ure)|deliver(?:ed|y)|empty\s*returned|进港|出场|提箱|装船|装柜|卸船|卸柜|到港|进口|离港|离开|交付|送达|空箱|还箱/gi;

function classifyEvent(line) {
  if (/gate\s*-?\s*in|进港/i.test(line)) return 'Gate In';
  if (/gate\s*-?\s*out|出场|提箱/i.test(line)) return 'Gate Out';
  if (/load|装船|装柜/i.test(line)) return 'Loaded';
  if (/discharg|卸船|卸柜/i.test(line)) return 'Discharged';
  if (/arriv|到港|进口/i.test(line)) return 'Arrived';
  if (/depart|离港|离开/i.test(line)) return 'Departed';
  if (/deliver|交付|送达/i.test(line)) return 'Delivered';
  if (/empty|空箱|还箱/i.test(line)) return 'Empty Returned';
  return '';
}

/**
 * 从一段粘贴文本里抽事件。
 * @param {string} text 官网原文（多少都行）
 * @returns {{time:string, activity:string, city:string, manual:true}[]} 解析不出则为空数组
 */
export function parseManualText(text) {
  const lines = String(text || '').split(/\r?\n|\t/).map((s) => s.trim()).filter(Boolean);
  const events = [];
  const seen = new Set();
  for (const line of lines) {
    let y, m, d, mm;
    if ((mm = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(line))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
    else if ((mm = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(line))) { y = +mm[3]; m = +mm[2]; d = +mm[1]; }
    else if ((mm = /(\d{1,2})\s*[-\s]\s*([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})?/.exec(line))) {
      const mo = MONTHS3[String(mm[2]).slice(0, 3).toLowerCase()];
      if (mo) { d = +mm[1]; m = mo; y = mm[3] ? +mm[3] : new Date().getFullYear(); }
    }
    if (!m || m < 1 || m > 12 || !d || d < 1 || d > 31) continue;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const act = classifyEvent(line);
    const citySrc = line.replace(EVENT_RE, ' ');
    const cm = /([A-Z][A-Za-z'-]{2,20}),\s*([A-Z][A-Za-z'-]{2,20})/.exec(citySrc);
    const city = cm ? `${cm[1].trim()}, ${cm[2].trim()}` : '';
    const key = iso + '|' + (act || line.slice(0, 40));
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ time: iso, activity: act || line.slice(0, 60), city, manual: true });
  }
  events.sort((a, b) => a.time.localeCompare(b.time));
  return events;
}

export default parseManualText;

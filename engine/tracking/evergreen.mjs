// Evergreen: public ShipmentLink HTML form and per-container movement history.
// Evidence: official TDB1_CargoTracking.js; real BL 142552582916, 2026-10-12.
// Pure HTTP: no browser, credentials or visible windows. EGLV is not part of the form BL.
const URL = 'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do';
const clean = (s = '') => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
export function evergreenRows(html) {
  return [...html.matchAll(/<tr\b[^>]*>((?:(?!<tr\b)[\s\S])*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => clean(c[1]))).filter(r => r.length > 1);
}
export function evergreenDate(s) {
  const m = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{2})-(\d{4})$/i.exec(s);
  return m ? `${m[3]}-${String(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(m[1].toUpperCase()) + 1).padStart(2,'0')}-${m[2]}` : null;
}
const vesselVoyage = text => {
  const m = /^(.*?)\s+(\d{4}-[A-Z0-9]+)(?:\s|$)/.exec(text);
  return m ? { vessel: m[1], voyage: m[2] } : { vessel: '', voyage: '' };
};
export function parseEvergreenMoves(html, num) {
  if (!clean(html).includes(num)) throw new Error('Evergreen movement response does not match requested container');
  const rows = evergreenRows(html);
  if (!rows.some(r => r.length === 4 && r[0] === 'Date' && r[1] === 'Container Moves')) throw new Error('Evergreen movement table missing (site changed or response blocked)');
  return rows.filter(r => r.length === 4 && evergreenDate(r[0])).map(r => ({
    time: evergreenDate(r[0]), rawTime: r[0], activity: r[1], city: r[2],
    ...vesselVoyage(r[3]), timeType: 'ACTUAL', isCurrent: false,
  }));
}
export function parseEvergreenSummary(html, number) {
  const rows = evergreenRows(html);
  const value = label => { for (const row of rows) { const i = row.indexOf(label); if (i >= 0) return row[i + 1] || ''; } return ''; };
  const containers = rows.filter(r => r.length === 9 && /^[A-Z]{4}\d{7}$/.test(r[0])).map(r => ({ num:r[0], size:r[1], type:r[1], status:r[7], lastUpdate:evergreenDate(r[8]), events:[] }));
  const docNum = value('B/L No.').replace(/^EGLV\s*/, '');
  if (!containers.length) {
    const text = clean(html);
    const notFound = /no (?:data|record|information)|not found|no matching|cannot find|not available/i.test(text);
    return { ok:false, carrier:'evergreen', number, errorKind:notFound ? 'not-found' : 'unexpected-response', error:notFound ? 'Evergreen: no tracking data for this number' : 'Evergreen tracking table missing (site changed or response blocked)' };
  }
  const fields = Object.fromEntries([...html.matchAll(/<input\b[^>]*>/gi)].map(m => {
    const n = /\bname="([^"]*)"/i.exec(m[0]); const v = /\bvalue="([^"]*)"/i.exec(m[0]); return [n?.[1] || '', v?.[1] || ''];
  }));
  return { ok:true, carrier:'evergreen', number, docNum, origin:value('Port of Loading'), destination:value('Port of Discharge'),
    ...vesselVoyage(value('Vessel Voyage on B/L')), status:containers[0].status, containers,
    raw:{ onboardDate:value('Estimated On Board Date') },
    moveFields:{ bl_no:fields.bl_no || docNum, onboard_date:fields.onboard_date || '', pol:fields.pol || '', pod:fields.pod || '', podctry:fields.podctry || '' },
  };
}
async function postOnce(fields, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Evergreen tracking timeout');
  const r = await fetch(URL, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded', Referer:URL }, body:new URLSearchParams(fields), signal:AbortSignal.timeout(remaining) });
  if (!r.ok) throw new Error(`Evergreen HTTP ${r.status}`);
  return r.text();
}

/** 网络抖动（fetch failed / 连接重置）自动重试一次——2026-10-12 App 内实测偶发；HTTP 状态错误不重试 */
async function post(fields, deadline) {
  try {
    return await postOnce(fields, deadline);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!/fetch failed|ECONNRESET|ETIMEDOUT|ENETUNREACH|socket hang up/i.test(msg)) throw e;
    await new Promise((r) => setTimeout(r, 1200));
    return postOnce(fields, deadline);
  }
}
export async function trackEvergreen(number, { timeoutMs = 60000 } = {}) {
  const input = String(number).trim().toUpperCase();
  const bl = input.replace(/^EGLV/, '');
  const isContainer = /^[A-Z]{4}\d{7}$/.test(input);
  if (!isContainer && !/^\d{12}$/.test(bl)) return { ok:false, carrier:'evergreen', number, errorKind:'bad-number', error:'Evergreen needs EGLV + 12 digits, 12-digit BL, or an 11-character container number' };
  const deadline = Date.now() + timeoutMs;
  const html = await post({ TYPE:isContainer ? 'CNTR' : 'BL', BL:isContainer ? '' : bl, CNTR:isContainer ? input : '', bkno:'', SEL:isContainer ? 's_cntr' : 's_bl', NO:isContainer ? input : bl }, deadline);
  let result = parseEvergreenSummary(html, number);
  if (isContainer && !result.ok) {
    // Container view is a different 8-column summary. Its official BL links identify the current trip.
    const row = evergreenRows(html).find(r => r.length === 8 && r[0] === input);
    const linkedBl = /name="bl_no"\s+value="(\d{12})"/i.exec(html)?.[1];
    if (row && linkedBl) result = parseEvergreenSummary(await post({ TYPE:'BL', BL:linkedBl }, deadline), number);
  }
  if (!result.ok) return result;
  if ((!isContainer && result.docNum !== bl) || (isContainer && !result.containers.some(c => c.num === input))) throw new Error('Evergreen result does not match requested number');
  if (isContainer) result.containers = result.containers.filter(c => c.num === input);
  // All boxes are fetched; a failed box history fails the query instead of claiming a complete timeline.
  for (const c of result.containers) {
    const moves = await post({ TYPE:'CntrMove', ...result.moveFields, cntr_no:c.num }, deadline);
    c.events = parseEvergreenMoves(moves, c.num);
    if (c.events.length) c.events[c.events.length - 1].isCurrent = true;
  }
  delete result.moveFields;
  result.searchType = isContainer ? 'CNTR' : 'BL';
  return result;
}

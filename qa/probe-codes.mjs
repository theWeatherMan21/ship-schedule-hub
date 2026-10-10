
// ONE / 阳明：青岛（CNQIN vs CNTAO）→ 格但斯克（PLGDN）哪种码有结果？
const get = async (u) => {
  try {
    const r = await fetch(u, { headers: { accept: 'application/json' } });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* */ }
    return { s: r.status, j, head: t.slice(0, 90) };
  } catch (e) { return { s: -1, err: String(e).slice(0, 70) }; }
};
for (const o of ['CNQIN', 'CNTAO']) {
  // ONE
  const from = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 43 * 864e5).toISOString().slice(0, 10);
  const u1 = `https://ecomm.one-line.com/api/v1/schedule/point-to-point?porCode=${o}&delCode=PLGDN&rcvTermCode=Y&deTermCode=Y&tsFlag=&fromDate=${from}&toDate=${to}&cargoNature=GP&searchType=List&sourcePage=schedule`;
  const r1 = await get(u1);
  const n1 = r1.j && Array.isArray(r1.j.scheduleLines) ? r1.j.scheduleLines.length : -1;
  console.log(`ONE  ${o} → PLGDN: HTTP ${r1.s} lines=${n1} ${n1 < 1 ? (r1.head || r1.err || '') : ''}`);
  // 阳明
  const s2 = from.replace(/-/g, ''); const e2 = new Date(Date.now() + 34 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const u2 = `https://www.yangming.com/api/P2P/GetP2PRoutes?locationCodeFrom=${o}&serviceTermFrom=Y&locationCodeTo=PLGDN&serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=${s2}&endDate=${e2}`;
  const r2 = await get(u2);
  const n2 = Array.isArray(r2.j) ? r2.j.length : -1;
  console.log(`阳明 ${o} → PLGDN: HTTP ${r2.s} routes=${n2} ${n2 < 1 ? (r2.head || r2.err || '') : ''}`);
}


const get = async (u) => { try { const r = await fetch(u, { headers: { accept: 'application/json' } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, head: t.slice(0, 80) }; } catch (e) { return { s: -1, err: String(e).slice(0, 70) }; } };
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
for (const [o, dd] of [['CNQIN', 'DEHAM'], ['CNTAO', 'DEHAM']]) {
  const r = await get(`https://www.yangming.com/api/P2P/GetP2PRoutes?locationCodeFrom=${o}&serviceTermFrom=Y&locationCodeTo=${dd}&serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=${d(5)}&endDate=${d(35)}`);
  const n = Array.isArray(r.j) ? r.j.length : -1;
  console.log(`  阳明 ${o} → ${dd}: HTTP ${r.s} routes=${n}`);
}

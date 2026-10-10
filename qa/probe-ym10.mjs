
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
// ① CNXGG 试线路
for (const to of ['ILASH', 'DEHAM', 'ILHFA']) {
  const r = await fetch(`https://www.yangming.com/api/P2P/GetP2PRoutes?locationCodeFrom=CNXGG&serviceTermFrom=Y&locationCodeTo=${to}&serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=${d(5)}&endDate=${d(35)}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  console.log('CNXGG →', to, ':', r.status, Array.isArray(j) ? j.length : -1);
  await new Promise((r2) => setTimeout(r2, 2000));
}
// ② Ashdod/Gdansk 的联想变体
for (const q of ['Ashdod', 'Ash', 'Asdod', 'Gdansk', 'Danzig', 'Gda']) {
  const r = await fetch(`https://www.yangming.com/api/P2P/GetLocations?queryType=F&searchByCode=TRUE&locationName=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  const list = (Array.isArray(j) ? j : []).slice(0, 5).map((x) => (x.locationName || '?') + '=' + (x.locationCode || '?'));
  console.log('LOC', q, '→', JSON.stringify(list));
  await new Promise((r2) => setTimeout(r2, 1500));
}


const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
const cands = ['CNTXG','CNTNJ','CNDGN','CNTSN','CNTJP','CNTJN','CNXGA'];
for (const from of cands) {
  const r = await fetch(`https://www.yangming.com/api/P2P/GetP2PRoutes?locationCodeFrom=${from}&serviceTermFrom=Y&locationCodeTo=DEHAM&serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=${d(5)}&endDate=${d(35)}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  console.log(from, '→ DEHAM:', r.status, Array.isArray(j) ? j.length : -1);
  await new Promise(r2 => setTimeout(r2, 2000));
}
// 另外找找阳明的"天津"该叫什么：用它的词典接口试试（若有）
const r2 = await fetch('https://www.yangming.com/api/P2P/GetP2PRoutes?locationCodeFrom=CNTXG&serviceTermFrom=Y&locationCodeTo=DEHAM&serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=' + d(5) + '&endDate=' + d(35), { headers: { 'user-agent': UA, accept: 'application/json' } });
console.log('（同上一组重复，忽略）', r2.status);

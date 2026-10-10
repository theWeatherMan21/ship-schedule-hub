
// 阳明正确姿势：UA=完整 Chrome、窗口 ≤30 天（修正 10-25 全 400 的探测 bug）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
const get = async (u) => { try { const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j }; } catch (e) { return { s: -1, err: String(e).slice(0, 60) }; } };
const cases = [['CNTAO','DEHAM','青岛'],['CNQIN','DEHAM','青岛'],['CNTXG','NLRTM','天津'],['CNTNJ','NLRTM','天津'],['CNSZX','NLRTM','深圳'],['CNSZP','NLRTM','深圳'],['CNXMN','NLRTM','厦门'],['CNXMG','NLRTM','厦门'],['CNSHA','NLRTM','上海'],['CNSGH','NLRTM','上海']];
for (const [from, to, label] of cases) {
  await sleep(2000);
  const r = await get(`https://www.yangming.com/api/P2P/GetP2PRoutes?locationCodeFrom=${from}&serviceTermFrom=Y&locationCodeTo=${to}&serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=${d(4)}&endDate=${d(34)}`);
  const n = Array.isArray(r.j) ? r.j.length : -1;
  console.log(JSON.stringify({ from, to, label, status: r.s, routes: n }));
}
console.log('YM-DONE');

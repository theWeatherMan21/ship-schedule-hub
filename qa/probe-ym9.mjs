
// 阳明 GetLocations：名字 → 它自己的码（批量）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const qs = ['Tianjin', 'Xingang', 'Shanghai', 'Ningbo', 'Qingdao', 'Shenzhen', 'Yantian', 'Xiamen', 'Dalian', 'Nansha', 'Guangzhou', 'Ashdod', 'Haifa', 'Hamburg', 'Rotterdam', 'Gdansk', 'Istanbul', 'Izmir', 'Aliaga'];
for (const q of qs) {
  try {
    const r = await fetch(`https://www.yangming.com/api/P2P/GetLocations?queryType=F&searchByCode=TRUE&locationName=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
    const j = await r.json().catch(() => null);
    const list = Array.isArray(j) ? j : (j && (j.data || j.items)) || [];
    const brief = (Array.isArray(list) ? list : []).slice(0, 6).map((x) => (x.locationName || x.name || x.LocationName || '?') + '=' + (x.locationCode || x.code || x.LocationCode || '?'));
    console.log(q, '→', JSON.stringify(brief));
  } catch (e) { console.log(q, 'ERR', String(e).slice(0, 60)); }
  await new Promise((r2) => setTimeout(r2, 1400));
}

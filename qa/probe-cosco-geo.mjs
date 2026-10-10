
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const geo = async (kw) => {
  const u = `https://elines.coscoshipping.com/ebbase/public/general/findCityDistrictByPrefix?prefix=${encodeURIComponent(kw)}`;
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    const list = (j && j.data && j.data.content) || [];
    console.log('GEO', kw, '=>', JSON.stringify(list.slice(0, 6).map((x) => (x.name || x.cityName || '?') + '/' + (x.code || x.cityCode || '?'))), '| HTTP', r.status);
  } catch (e) { console.log('GEO', kw, 'ERR', String(e).slice(0, 80)); }
};
for (const kw of ['xingang', 'tianjin', 'ashdod', 'haifa', 'ningbo']) { await geo(kw); await sleep(600); }

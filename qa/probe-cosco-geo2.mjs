
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const geo = async (kw) => {
  const u = `https://elines.coscoshipping.com/ebbase/public/general/findCityDistrictByPrefix?prefix=${encodeURIComponent(kw)}`;
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  const list = (j && j.data && j.data.content) || [];
  console.log('====', kw, '====');
  for (const x of list.slice(0, 8)) {
    console.log(' ', JSON.stringify({ cityLocName: x.cityLocName, unloCode: x.unloCode, state: x.state, country: x.country, cityUuid: String(x.cityUuid).slice(0, 12) }));
  }
};
for (const kw of ['tianjin', 'xingang', 'ashdod', 'israel']) { await geo(kw); await sleep(700); }

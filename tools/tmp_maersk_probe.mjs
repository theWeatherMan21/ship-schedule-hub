const MK = 'uXe7bxTHLY0yY0e8jnS6kotShkLuAAqG';
const get = async (u) => { const r = await fetch(u, { headers: { accept: 'application/json', 'consumer-key': MK }, signal: AbortSignal.timeout(20000) }); return { s: r.status, j: await r.json().catch(() => null) }; };
for (const [label, u] of [
  ['pageSize=100', 'https://api.maersk.com/synergy/reference-data/geography/locations?cityName=a&pageSize=100&sort=cityName&type=city'],
  ['pageSize=100&page=2', 'https://api.maersk.com/synergy/reference-data/geography/locations?cityName=a&pageSize=100&page=2&sort=cityName&type=city'],
  ['单字母 n', 'https://api.maersk.com/synergy/reference-data/geography/locations?cityName=n&pageSize=100&sort=cityName&type=city'],
]) {
  const { s, j } = await get(u);
  const arr = Array.isArray(j) ? j : [];
  console.log(`${label}: status=${s} 条数=${arr.length}`, arr[0] ? JSON.stringify(arr[0]).slice(0, 120) : '');
}

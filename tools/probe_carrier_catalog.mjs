// 探测各家船司「整份港口名录」接口（只读，不发查询）
const MK = 'uXe7bxTHLY0yY0e8jnS6kotShkLuAAqG';
const ZK = '9d63cf020a4c4708a7b0ebfe39578300';
const CAND = [
  ['maersk', 'https://api.maersk.com/synergy/reference-data/geography/locations?type=port&pageSize=100&page=1', { accept: 'application/json', 'consumer-key': MK }],
  ['maersk', 'https://api.maersk.com/synergy/reference-data/geography/ports?pageSize=100', { accept: 'application/json', 'consumer-key': MK }],
  ['maersk', 'https://api.maersk.com/synergy/reference-data/geography/locations?cityName=a&pageSize=25&type=city', { accept: 'application/json', 'consumer-key': MK }],
  ['one', 'https://ecomm.one-line.com/api/v1/common/port/list', { accept: 'application/json' }],
  ['one', 'https://ecomm.one-line.com/api/v1/master/port', { accept: 'application/json' }],
  ['one', 'https://ecomm.one-line.com/api/v1/schedule/port/list', { accept: 'application/json' }],
  ['one', 'https://ecomm.one-line.com/api/v1/location/port', { accept: 'application/json' }],
  ['hapag', 'https://schedule.api.hlag.cloud/api/locations', { accept: 'application/json', 'x-token': 'public' }],
  ['hapag', 'https://schedule.api.hlag.cloud/api/ports', { accept: 'application/json', 'x-token': 'public' }],
  ['hapag', 'https://schedule.api.hlag.cloud/api/masterdata/locations', { accept: 'application/json', 'x-token': 'public' }],
  ['yangming', 'https://www.yangming.com/api/P2P/GetLocationList', { accept: 'application/json' }],
  ['yangming', 'https://www.yangming.com/api/Common/GetPort', { accept: 'application/json' }],
  ['zim', 'https://apigw.zim.com/digitalSchedules/Ports/v1?subscription-key=' + ZK, { accept: 'application/json' }],
  ['zim', 'https://apigw.zim.com/digitalSchedules/Points/v1?subscription-key=' + ZK, { accept: 'application/json' }],
  ['cosco', 'https://elines.coscoshipping.com/ebusiness/common/getPortList', { accept: 'application/json' }],
  ['cosco', 'https://elines.coscoshipping.com/ebusiness/schedulequery/portList', { accept: 'application/json' }],
];
const out = [];
for (const [carrier, url, headers] of CAND) {
  try {
    const ctl = AbortSignal.timeout(15000);
    const r = await fetch(url, { headers, signal: ctl });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    // 估算"像名录"的程度：JSON 里数组元素数量
    let n = 0;
    const walk = (x) => { if (Array.isArray(x)) { n = Math.max(n, x.length); x.slice(0, 3).forEach(walk); } else if (x && typeof x === 'object') Object.values(x).slice(0, 8).forEach(walk); };
    if (j) walk(j);
    out.push([carrier, r.status, n, (t || '').slice(0, 90).replace(/\s+/g, ' ')]);
  } catch (e) { out.push([carrier, 'ERR', 0, String(e.message || e).slice(0, 70)]); }
}
for (const [c, s, n, head] of out) console.log(`${String(c).padEnd(9)} ${String(s).padEnd(5)} 数组最大长度=${String(n).padEnd(5)} ${head}`);


// Hapag 接口直测：厦门/青岛的候选码（对照：上海已知能出）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const start = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
const get = async (o, d) => {
  const u = `https://schedule.api.hlag.cloud/api/routes?startLocation=${o}&endLocation=${d}&startDate=${start}&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=42GP`;
  try {
    const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.hapag-lloyd.com', referer: 'https://www.hapag-lloyd.com/' } });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    const n = j && (Array.isArray(j) ? j.length : (j.routes ? j.routes.length : -1));
    return { s: r.status, n, head: t.slice(0, 70) };
  } catch (e) { return { s: -1, n: -2, head: String(e).slice(0, 60) }; }
};
for (const [o, d, tag] of [
  ['CNSHG', 'NLRTM', '上海对照(词典码)'], ['CNSHA', 'NLRTM', '上海对照(行业码)'],
  ['CNXAM', 'NLRTM', '厦门(词典码)'], ['CNXMN', 'NLRTM', '厦门(行业码)'], ['CNXMG', 'NLRTM', '厦门(新版码)'],
  ['CNQIN', 'NLRTM', '青岛(词典码)'], ['CNTAO', 'NLRTM', '青岛(行业码)'], ['CNQDG', 'NLRTM', '青岛(新版码)'],
]) {
  const r = await get(o, d);
  console.log(tag.padEnd(16), o, '→ NLRTM:', r.s, 'n=', r.n, r.n <= 0 ? r.head : '');
  await sleep(900);
}

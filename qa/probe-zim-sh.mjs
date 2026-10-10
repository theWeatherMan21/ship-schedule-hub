
// 直测 ZIM 词表：shanghai / xiamen / rotterdam 的解析行为
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const key = (eng.match(/const key = '([a-f0-9]+)'/) || [])[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loc = async (term) => {
  const u = `https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${key}&searchTerm=${encodeURIComponent(term)}&pageSize=100`;
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  const list = (j && j.results) || [];
  const brief = list.slice(0, 6).map((x) => (x.code || '?') + '/' + (x.name || '?') + '/' + (x.locationType || '?'));
  console.log(String(term).padEnd(14), '=>', JSON.stringify(brief));
  return list;
};
for (const t of ['CNSGH', 'CNSHA', 'CTsS', 'shanghai', 'Shanghai Pt', 'CNXAM', 'CNXMN', 'xiamen', 'Xiamen', 'NLRTM', 'rotterdam', 'PLGDN', 'gdansk']) {
  await loc(t); await sleep(600);
}


import { tryFastPath } from '../engine/fastpath.mjs';
const OM = ['CNTNJ','CNTXG','CNTSN','CNTJG','CNTJN','CNXGG','CNNGB','CNSHA'];
const DM = ['ILHFA','ILHFT','ILHFA-H','ILASH','ILHFA1'];
const hit = [];
for (const o of OM) for (const d of DM) {
  let r = null; try { r = await tryFastPath('yangming', [o], [d], ''); } catch {}
  const n = r && r.rows ? r.rows.length : 0;
  if (n) hit.push(o + '→' + d + ' = ' + n + ' 条');
}
console.log('  阳明有结果的码对:', JSON.stringify(hit) || '(全 0)');


import { resolvePort } from '../engine/lib/portsolve.mjs';
import { siblingPorts } from '../engine/portdb.mjs';
const carriers = ['msc','maersk','cma','cosco','hapag','one','evergreen','yangming','hmm','zim','oocl'];
const ports = ['tianjin','ningbo','shanghai','qingdao','istanbul','ashdod','haifa','rotterdam'];
for (const p of ports) {
  const line = [];
  for (const c of carriers) {
    let r = null;
    try { r = await resolvePort(c, p); } catch (e) { line.push(c + '=ERR'); continue; }
    if (!r || !r.locode) { line.push(c + '=未命中'); continue; }
    const txt = String(r.text || '');
    // 可疑标记：用了"码样式"文本（无空格且短小写）、或解析到与城市同名的其它码头
    const codeLike = /^[a-z0-9]{3,8}$/.test(txt) ? '⚠' : '';
    line.push(c + '=' + txt + codeLike);
  }
  console.log('  【' + p + '】');
  for (const x of line) console.log('     ' + x);
}

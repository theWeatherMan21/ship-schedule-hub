// 港口识别回归测试（爹地 10-08：只看英文名，要能正确识别 + 对上各船司名录）
// 跑法：node qa/port-compat.mjs        退出码 0=全过，1=有失败
// 期望值写死在这里 = 契约；改了词典/别名表就先跑这个。
import { findPort } from '../engine/portdb.mjs';

const CASES = [
  // ---- 必须命中（主流港 + 市场通行名 + 旧名 + 缩写）----
  ['Shanghai', 'CNSHA'], ['Ningbo', 'CNNGB'], ['Shenzhen', 'CNSNZ'], ['Yantian', 'CNYTN'],
  ['Qingdao', 'CNQIN'], ['Tianjin', 'CNTNJ'], ['Xiamen', 'CNXAM'], ['Dalian', 'CNDAL'],
  ['Hong Kong', 'HKHKG'], ['Singapore', 'SGSIN'], ['Busan', 'KRPUS'], ['Tokyo', 'JPTYO'],
  ['Yokohama', 'JPYOK'], ['Kaohsiung', 'TWKHH'], ['Port Klang', 'MYPKG'], ['Tanjung Pelepas', 'MYTPP'],
  ['Laem Chabang', 'THLCH'], ['Ho Chi Minh', 'VNSGN'], ['Jakarta', 'IDJKT'], ['Manila', 'PHMNL'],
  ['Jebel Ali', 'AEJEA'], ['Salalah', 'OMSLL'], ['Nhava Sheva', 'INNSA'], ['Mundra', 'INMUN'],
  ['Colombo', 'LKCMB'], ['Chittagong', 'BDCGP'], ['Chattogram', 'BDCGP'], ['Karachi', 'PKKHI'],
  ['Durban', 'ZADUR'], ['Cape Town', 'ZACPT'], ['Mombasa', 'KEMBA'], ['Tema', 'GHTEM'],
  ['Abidjan', 'CIABJ'], ['Alexandria', 'EGALY'], ['Piraeus', 'GRPIR'], ['Istanbul', 'TRIST'],
  ['Genoa', 'ITGOA'], ['Valencia', 'ESVLC'], ['Algeciras', 'ESALG'], ['Le Havre', 'FRLEH'],
  ['Felixstowe', 'GBFXT'], ['Southampton', 'GBSOU'], ['Gdansk', 'PLGDN'], ['Rotterdam', 'NLRTM'],
  ['Hamburg', 'DEHAM'], ['Antwerp', 'BEANR'], ['Bremerhaven', 'DEBRV'], ['Santos', 'BRSSZ'],
  ['Buenos Aires', 'ARBUE'], ['Callao', 'PECLL'], ['Cartagena', 'COCTG'], ['Vancouver', 'CAVAN'],
  ['Montreal', 'CAMTR'], ['Los Angeles', 'USLAX'], ['Long Beach', 'USLGB'], ['New York', 'USNYC'],
  ['Savannah', 'USSAV'], ['Houston', 'USHOU'], ['Seattle', 'USSEA'], ['Oakland', 'USOAK'],
  ['Sydney', 'AUSYD'], ['Melbourne', 'AUMEL'], ['Auckland', 'NZAKL'],
  // ---- 旧名 / 市场名（词典用的是官方名）----
  ['Pusan', 'KRPUS'], ['Saigon', 'VNSGN'], ['Genova', 'ITGOA'], ['Bombay', 'INBOM'],
  ['Madras', 'INMAA'], ['Calcutta', 'INCCU'], ['Tsingtao', 'CNQIN'], ['Port of Spain', 'TTPOS'],
  ['Port-of-Spain', 'TTPOS'], ['Ningbo-Zhoushan', 'CNNGB'], ['Los Angelos', 'USLAX'],
  // ---- 常用缩写 ----
  ['LAX', 'USLAX'], ['LGB', 'USLGB'], ['NYC', 'USNYC'], ['NGB', 'CNNGB'], ['SHA', 'CNSHG'],
  ['SZX', 'CNSNZ'], ['HKG', 'HKHKG'], ['SIN', 'SGSIN'], ['RTM', 'NLRTM'], ['HAM', 'DEHAM'],
  ['ANR', 'BEANR'], ['FXT', 'GBFXT'], ['PUS', 'KRPUS'], ['TYO', 'JPTYO'], ['KEL', 'TWKEL'],
  ['KHH', 'TWKHH'], ['SGN', 'VNSGN'], ['LCB', 'THLCH'], ['PKG', 'MYPKG'], ['JEA', 'AEJEA'],
  ['NSA', 'INNSA'], ['CMB', 'LKCMB'], ['CPT', 'ZACPT'], ['DUR', 'ZADUR'], ['MBA', 'KEMBA'],
  ['VAN', 'CAVAN'], ['MTR', 'CAMTR'], ['SYD', 'AUSYD'], ['MEL', 'AUMEL'], ['AKL', 'NZAKL'],
  // ---- 拼写错误（人工常见错拼表）----
  ['Roterdam', 'NLRTM'], ['Singapre', 'SGSIN'], ['Shangai', 'CNSHG'], ['Ningpo', 'CNNGB'],
  ['Hambrug', 'DEHAM'], ['Antwerpen', 'BEANR'], ['Manilla', 'PHMNL'], ['Columbo', 'LKCMB'],
  // ---- 同名港：必须选主干港（多源交叉：公开排名 + MSC 名录 + 多家船司别名 + 人工优先）----
  ['Portland', 'USPDX'], ['Alexandria', 'EGALY'], ['Valencia', 'ESVLC'], ['Barcelona', 'ESBCN'],
  ['Manzanillo', 'MXZLO'], ['Vancouver', 'CAVAN'], ['Kingston', 'JMKIN'], ['Cartagena', 'COCTG'],
  // ---- 必须拒绝（垃圾输入绝不随机命中）----
  ['', null], ['a', null], ['ab', null], ['Atlantis', null], ['@#$%', null], ['Ningbo123', null],
  ['true', null], ['false', null], ['undefined', null], ['null', null],
];

let pass = 0, fail = [];
for (const [input, expect] of CASES) {
  let got = null;
  try { const h = findPort(input, 'msc'); got = h ? h.locode : null; } catch (e) { got = 'ERR:' + e.message; }
  if (got === expect) pass++;
  else fail.push(`${JSON.stringify(input)} 期望 ${expect || '拒绝'} 实际 ${got || '拒绝'}`);
}
console.log(`港口识别回归：${pass}/${CASES.length} 通过`);
if (fail.length) { console.log('失败项：'); for (const f of fail) console.log('  ✗ ' + f); }
process.exit(fail.length ? 1 : 0);

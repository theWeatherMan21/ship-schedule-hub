
// 映射验证闸：候选码必须在真航线上出船才算数（YM + ONE 同步）
import { readFileSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymRoutes = async (from, to) => {
  const r = await fetch(`https://www.yangming.com/api/P2P/GetP2PRoutes?locationCodeFrom=${from}&serviceTermFrom=Y&locationCodeTo=${to}&serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=${d(5)}&endDate=${d(35)}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  return Array.isArray(j) ? j.length : -1;
};
const oneRoutes = async (from, to) => {
  const r = await fetch(`https://ecomm.one-line.com/api/v1/schedule/point-to-point?porCode=${from}&delCode=${to}&rcvTermCode=Y&deTermCode=Y&tsFlag=&fromDate=${new Date(Date.now()+864e5).toISOString().slice(0,10)}&toDate=${new Date(Date.now()+60*864e5).toISOString().slice(0,10)}&cargoNature=GP&searchType=List&sourcePage=schedule`, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  return j && Array.isArray(j.scheduleLines) ? j.scheduleLines.length : -1;
};
const { resolvePort } = await import('../engine/lib/portsolve.mjs');

// ① 阳明：候选（来自词表）逐条验证
const ymCases = [
  ['Dalian', 'CNDLC'], ['Fuzhou', 'CNFOC'], ['Guangzhou', 'CNCAN'], ['Yantai', 'CNYNT'],
  ['Laem Chabang', 'THLCB'], ['Manila', 'PHMNN'], ['Colon', 'PACFZ'], ['Ho Chi Minh City', 'VNIHV'],
];
console.log('== 阳明验证 ==');
for (const [name, cand] of ymCases) {
  const res = await resolvePort('yangming', name);
  const ours = res.locode;
  let out = { name, ours, cand, oursNL: -2, candNL: -2, oursDE: -2, candDE: -2 };
  if (ours !== cand) {
    out.oursNL = await ymRoutes(ours, 'NLRTM'); await sleep(1500);
    out.candNL = await ymRoutes(cand, 'NLRTM'); await sleep(1500);
    if (out.oursNL <= 0 && out.candNL <= 0) {
      out.oursDE = await ymRoutes(ours, 'DEHAM'); await sleep(1500);
      out.candDE = await ymRoutes(cand, 'DEHAM'); await sleep(1500);
    }
  }
  console.log(JSON.stringify(out));
}

// ② ONE：中国港候选验证
console.log('== ONE 验证 ==');
const oneCases = [['Fuzhou','CNFOC'], ['Guangzhou','CNCAN'], ['Lianyungang','CNLYG'], ['Qinzhou','CNQZH'], ['Rizhao','CNRZH'], ['Shekou','CNSHK'], ['Yantai','CNYNT'], ['Yingkou','CNYIK'], ['Nansha','CNNSA']];
for (const [name, cand] of oneCases) {
  const res = await resolvePort('one', name);
  const ours = res.locode;
  let out = { name, ours, cand, oursNL: -2, candNL: -2, oursDE: -2, candDE: -2 };
  if (ours !== cand) {
    out.oursNL = await oneRoutes(ours, 'NLRTM'); await sleep(1200);
    out.candNL = await oneRoutes(cand, 'NLRTM'); await sleep(1200);
    if (out.oursNL <= 0 && out.candNL <= 0) {
      out.oursDE = await oneRoutes(ours, 'DEHAM'); await sleep(1200);
      out.candDE = await oneRoutes(cand, 'DEHAM'); await sleep(1200);
    }
  }
  console.log(JSON.stringify(out));
}
console.log('VERIFY-DONE');

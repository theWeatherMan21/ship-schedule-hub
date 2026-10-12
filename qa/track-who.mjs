// 单号识别 CLI：node qa/track-who.mjs <号1> [号2 ...]
//   不带参数时跑「爹地真单批次」默认样例。
// 用途：直接看「输入一个号 → 路由到哪家 / 给哪些候选」（对应识别器卡 DoD）。
import { identify, PENDING } from '../engine/tracking/identify.mjs';

const argv = process.argv.slice(2);
const nums = argv.length ? argv : [
  '276759780', 'COSU6469105960', 'HLCU2B9E986E7C5E', 'HDMUSHAF36562700',
  'M237055674', '181AY12345', 'CANF123456789', 'NGP12345678',
  'MSKU1432299',
];

for (const raw of nums) {
  const r = identify(raw);
  const head = r.ok
    ? `✓ ${r.carrierName}  [${r.confidence} ${r.score} · ${r.matchedBy}/${r.docType}]`
    : `? 未定  [${r.confidence} · ${r.docType}]`;
  console.log(`\n${raw}  →  ${head}`);
  console.log(`   ${r.note}`);
  if (!r.ok) {
    const top = r.candidates.slice(0, 4)
      .map((c) => `${c.carrierName}${c.reason && c.reason !== '待确认（手选）' ? `(${c.reason})` : ''}`)
      .join(' | ');
    console.log(`   候选: ${top}${r.candidates.length > 4 ? ` … 共${r.candidates.length}家` : ''}`);
  }
}
console.log(`\n待归户（需人工确认，见 identify.mjs#PENDING）: ${PENDING.map((p) => p.number).join(', ')}`);

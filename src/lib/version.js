// 版本比较（更新检查用）—— 抽成独立模块便于单测
export const verParts = (v) => String(v).trim().replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);

/** latest 是否比 current 新（语义化，缺位补 0） */
export function isNewer(latest, current) {
  const a = verParts(latest);
  const b = verParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

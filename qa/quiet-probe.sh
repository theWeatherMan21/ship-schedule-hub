#!/bin/bash
# 静默探针包装器 —— 爹地红线（2026-10-09 重申）：任何自动化都不得在屏幕上出现窗口。
# 用法：bash qa/quiet-probe.sh qa/某个探针.mjs [其它参数...]
# ① 强制无头：探针里写了 headless:false 也会被改写成 true（在副本里改，不动原文件）
# ② 跑完自检：屏幕可见窗口数必须与跑之前一致，多出窗口 → 报错退出（非零）
# ③ 确需有头（破 Cloudflare 类）时用 qa/headed-minimized-probe.mjs 那套：CDP 最小化 + 回读 AXMinimized 验证
set -u
cd "$(dirname "$0")/.." || exit 1
ONSCREEN="$HOME/bin/onscreen"
# ⚠️ scratch 目录 24h 会被清理 → 助手曾悄悄消失、静默检查变成"永远通过"（最危险的失败）。
#    助手不在就尝试就地编译；编不出来就**报错退出**，绝不默默放行。
if [ ! -x "$ONSCREEN" ]; then
  bash "$(dirname "$0")/build-onscreen.sh" >/dev/null 2>&1 || true
fi
if [ ! -x "$ONSCREEN" ]; then echo "✗ 静默取证助手缺失（$ONSCREEN），拒绝在无法验证静默的情况下运行"; exit 4; fi
probe="$1"; shift || true
[ -f "$probe" ] || { echo "找不到探针：$probe"; exit 2; }
count_win() { "$ONSCREEN" --ours 2>/dev/null | python3 -c "import sys,json
try: print(len(json.load(sys.stdin)))
except Exception: print(0)" 2>/dev/null || echo 0; }
before=$(count_win)
dir=$(dirname "$probe"); base=$(basename "$probe" .mjs)
tmp="$dir/.quiet-$base.mjs"                      # 放在同目录：相对 import 才解析得到
sed 's/headless: *false/headless: true/g' "$probe" > "$tmp"
grep -q "headless: *false" "$probe" && echo "⚠️  已把探针里的 headless:false 强制改成 true（零窗口红线）"
node "$tmp" "$@"; code=$?
rm -f "$tmp"
sleep 2
after=$(count_win)
_diff=$((after - before))
if [ "$after" -gt "$before" ]; then
  echo "✗ 违规：屏幕上多出 ${_diff} 个窗口！"; "$ONSCREEN" 2>/dev/null | head -5; exit 3
fi
echo "✓ 静默自检通过（屏幕可见窗口 ${before} -> ${after}）"
exit $code

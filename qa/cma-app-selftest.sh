#!/bin/bash
# CMA 追踪 · App 原生自检截图（一次性验收脚本）
#
# 用途：真网确认 CMA 追踪可用后，跑一次「App 内点一次查询 → 截图结果卡」的原生验收。
# 前置：① 屏幕已解锁（锁屏时 WKWebView 的 setTimeout 被挂起，自检点击不会发生——2026-10-12 实测）
#       ② CMA 官网未处于 DataDome 限流期（同日别反复访问，会加深限流）
# 用法：bash qa/cma-app-selftest.sh [单号] [输出png]
# 注意：本脚本会**故意**让 App 窗口出现在屏幕上（这就是被验收的对象）；其余时间红线照旧。
set -u
cd "$(dirname "$0")/.." || exit 1
NUM="${1:-NGP3170431}"
OUT="${2:-$HOME/.hermes/cache/scratch/shiphub-cma-selftest.png}"
APP="/Applications/ShipScheduleHub.app"
TRACE="$(node -e 'console.log(require("os").tmpdir())')/ssh-app-trace.log"

# 0) 屏幕锁定检查：锁屏时 screenshot 会 "could not create image from display"，自检也点不动
if ! screencapture -x /tmp/.ssh-lockprobe.png 2>/dev/null || [ ! -s /tmp/.ssh-lockprobe.png ]; then
  echo "✗ 屏幕未解锁（或截屏权限不足）——请先解锁再跑本脚本，否则自检点击会被挂起、截图必然失败"
  rm -f /tmp/.ssh-lockprobe.png
  exit 4
fi
rm -f /tmp/.ssh-lockprobe.png

before=$(wc -l < "$TRACE" 2>/dev/null || echo 0)

# 1) 关掉旧实例（只关我们自己的 App，不动别的进程）
osascript -e 'quit app "ShipScheduleHub"' 2>/dev/null
sleep 3
pgrep -f "Applications/ShipScheduleHub.app" >/dev/null && { pkill -f "Applications/ShipScheduleHub.app"; sleep 2; }

# 2) 带自检单号启动（env 由 launchd 域注入 GUI App）
launchctl setenv SSH_TRACK_SELFTEST "$NUM"
open -a "$APP"
launchctl unsetenv SSH_TRACK_SELFTEST
echo "已启动 App（自检单号 $NUM），等待渲染…"

# 3) 等结果卡（前端 2.5s 后才点击，追踪本身 10-30s；给 30s 余量）
sleep 30
echo "--- trace（新增行） ---"
tail -n +$((before + 1)) "$TRACE" 2>/dev/null | tail -6

# 4) 截图
screencapture -x "$OUT" && echo "✓ 截图：$OUT" || { echo "✗ 截图失败"; exit 5; }
echo "请人工看一眼：结果卡应有 柜号（CMAU2081135 / CMAU7247424）、状态、Completed 等字段。"

#!/bin/bash
# ShipScheduleHub 本地部署：编译二进制 + **同步 engine 资源** + 重签 + 启动。
#
# 为什么需要这个脚本（10-23 连踩两次坑）：
#   `tauri build --no-bundle` 只产出二进制，**不会更新 .app 里的 Resources**。
#   新增/修改 engine 脚本后只 cp 二进制 → Rust 侧找不到文件 → 界面报错。
#   本脚本把「同步 engine/」变成固定动作，并在最后逐项核对。
#
# 用法：bash scripts/deploy.sh
set -e

PROJ="$(cd "$(dirname "$0")/.." && pwd)"
APP="${SSH_APP_TARGET:-/Applications/ShipScheduleHub.app}"
BIN_NAME="shipschedulehub"

echo "==> 项目: $PROJ"
echo "==> 目标: $APP"
[ -d "$APP" ] || { echo "✗ 目标 App 不存在: $APP"; exit 1; }

echo "==> ① 编译（--no-bundle：只出二进制，不生成 dmg/安装包）"
cd "$PROJ"
npm run tauri build -- --no-bundle 2>&1 | tail -3

echo "==> ② 退出正在运行的 App"
osascript -e 'tell application "ShipScheduleHub" to quit' 2>/dev/null || true
pkill -f "$APP/Contents/MacOS" 2>/dev/null || true
sleep 1

echo "==> ③ 替换二进制"
cp "$PROJ/src-tauri/target/release/$BIN_NAME" "$APP/Contents/MacOS/$BIN_NAME"
chmod +x "$APP/Contents/MacOS/$BIN_NAME"

echo "==> ④ 同步 engine 资源（关键：--no-bundle 不会做这一步）"
# 不 --delete：App 里的 node_modules 是必需的（playwright-core），绝不能删
rsync -a \
  --exclude 'node_modules' \
  --exclude '.cache' \
  --exclude 'evidence/' \
  --exclude '*.log' \
  "$PROJ/engine/" "$APP/Contents/Resources/engine/"

echo "==> ⑤ 同步版本号到 Info.plist（--no-bundle 不会重生成 plist，不改就永远显示旧版本）"
VERSION=$(node -p "require('$PROJ/package.json').version")
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$APP/Contents/Info.plist" 2>/dev/null || true
echo "    Info.plist → $VERSION"

echo "==> ⑥ 重签"
codesign --force --deep --sign - "$APP" 2>&1 | tail -1

echo "==> ⑦ 核对（缺一项就算失败）"
FAIL=0
check_file() {
  if [ -e "$2" ]; then echo "    ✓ $1"; else echo "    ✗ $1 缺失: $2"; FAIL=1; fi
}
check_file "二进制" "$APP/Contents/MacOS/$BIN_NAME"
check_file "船期引擎 query.mjs" "$APP/Contents/Resources/engine/query.mjs"
check_file "报价 ETD 脚本 quote-etd.mjs" "$APP/Contents/Resources/engine/quote-etd.mjs"
check_file "追踪适配器目录" "$APP/Contents/Resources/engine/tracking/akkon.mjs"
check_file "Playwright 依赖" "$APP/Contents/Resources/engine/node_modules/playwright-core"
codesign --verify --deep --strict "$APP" && echo "    ✓ 签名校验通过" || { echo "    ✗ 签名校验失败"; FAIL=1; }
echo "    二进制时间: $(stat -f '%Sm' "$APP/Contents/MacOS/$BIN_NAME")"
echo "    版本: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist" 2>/dev/null || echo '?')"
[ "$FAIL" -eq 0 ] || { echo "✗ 核对未通过，未启动"; exit 1; }

echo "==> ⑧ 启动"
open "$APP"
sleep 3
echo "    PID: $(pgrep -f "$APP/Contents/MacOS" | head -1)"
echo
echo "✓ 部署完成"

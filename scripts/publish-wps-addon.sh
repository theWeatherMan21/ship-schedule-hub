#!/bin/bash
# 把 WPS 加载项的「在线更新包」发到 ShipScheduleHub 的 GitHub Release（公共仓，国内镜像可代理）
#   用法: scripts/publish-wps-addon.sh [--notes "..."]
# 前置: ../WPSAddin 里已跑过 scripts/pack-update.sh；gh 已登录
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
SRC="$ROOT/../WPSAddin/dist-updates"
REPO="theWeatherMan21/ship-schedule-hub"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$SRC/version.json" ] || { echo "✗ 缺 $SRC/version.json（先在 WPSAddin 跑 scripts/pack-update.sh）"; exit 1; }

VER="$(python3 -c "import json;print(json.load(open('$SRC/version.json'))['version'])")"
PKG="$(python3 -c "import json;print(json.load(open('$SRC/version.json'))['file'])")"
SHA="$(python3 -c "import json;print(json.load(open('$SRC/version.json'))['sha256'])")"
NEWPKG="wps-shiptrack-$VER.tar.gz"
TAG="wps-latest"        # 滚动 tag：URL 固定，App 端不用跟着版本号改
HIST="wps-v$VER"

[ -f "$SRC/$PKG" ] || { echo "✗ 缺 $SRC/$PKG"; exit 1; }

# 资产改名 + 改写 manifest 里的 file 字段（sha256 不变，内容没动）
cp "$SRC/$PKG" "$TMP/$NEWPKG"
python3 - "$SRC/version.json" "$TMP/wps-version.json" "$NEWPKG" <<'PY'
import json, sys
src, dst, newfile = sys.argv[1:4]
m = json.load(open(src))
m['file'] = newfile
m['app'] = 'shiptrack'
json.dump(m, open(dst, 'w'), ensure_ascii=False, indent=2)
print('manifest:', m['version'], newfile, m['sha256'][:12] + '...')
PY

echo "== 发布 $TAG / $HIST → $REPO =="
# 历史 tag（按版本留档）
if gh release view "$HIST" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$HIST" "$TMP/wps-version.json" "$TMP/$NEWPKG" --repo "$REPO" --clobber
else
  gh release create "$HIST" "$TMP/wps-version.json" "$TMP/$NEWPKG" --repo "$REPO" \
    --title "WPS 插件 $HIST" --notes "${2:-ShipTrack WPS 加载项 v$VER}"
fi
# 滚动 tag（App 固定从这里拉）
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$TMP/wps-version.json" "$TMP/$NEWPKG" --repo "$REPO" --clobber
else
  gh release create "$TAG" "$TMP/wps-version.json" "$TMP/$NEWPKG" --repo "$REPO" \
    --title "WPS 插件 $TAG" --notes "${2:-ShipTrack WPS 加载项 v$VER}"
fi

echo "✓ https://github.com/$REPO/releases/tag/$TAG"
echo "  （App 固定拉 https://github.com/$REPO/releases/download/wps-latest/wps-version.json）"
echo "  资产: wps-version.json · $NEWPKG"
echo "  sha256: $SHA"

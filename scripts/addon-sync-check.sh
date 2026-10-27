#!/usr/bin/env bash
# 校验「引擎改动之后，插件侧有没有跟着发过版」
# 爹地的要求：船期软件改了，插件库那边要有对应的 hotfix/release，不然两边会漂移。
set -uo pipefail
ADDON="${WPS_ADDON_DIR:-$HOME/Documents/trae_projects/wps-shiptrack}"
[ -d "$ADDON" ] || { echo "skip: 找不到插件仓库 $ADDON"; exit 0; }

ENGINE_T=$(git -C "$(dirname "$0")/.." log -1 --format=%ct -- engine/ 2>/dev/null || echo 0)
ADDON_T=$(git -C "$ADDON" log -1 --format=%ct -- package.json 2>/dev/null || echo 0)
ENGINE_C=$(git -C "$(dirname "$0")/.." log -1 --format=%h -- engine/ 2>/dev/null)
ADDON_V=$(python3 -c "import json;print(json.load(open('$ADDON/package.json'))['version'])" 2>/dev/null)

if [ "${ENGINE_T:-0}" -gt "${ADDON_T:-0}" ]; then
  echo "❌ 引擎在插件之后改过，插件没跟版"
  echo "   引擎最后改动: $(date -r "$ENGINE_T" '+%m-%d %H:%M') ($ENGINE_C)"
  echo "   插件最后发版: $(date -r "$ADDON_T" '+%m-%d %H:%M') (v${ADDON_V})"
  echo "   → 跑：scripts/hotfix-addon.sh \"说明\""
  exit 1
fi
echo "✅ 插件与引擎同步（v${ADDON_V}，引擎改动 $(date -r "$ENGINE_T" '+%m-%d %H:%M') ≤ 插件 $(date -r "$ADDON_T" '+%m-%d %H:%M')）"

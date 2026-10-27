#!/usr/bin/env bash
# 已迁移：插件发布改在独立仓库 theWeatherMan21/wps-shiptrack
# 这里只做转发，避免有人误发到 App 仓库把 release 又混在一起
set -euo pipefail
DIR="${WPS_ADDON_DIR:-$HOME/Documents/trae_projects/wps-shiptrack}"
[ -d "$DIR" ] || { echo "找不到插件仓库：$DIR"; exit 1; }
cd "$DIR"
exec ./scripts/publish.sh "$@"

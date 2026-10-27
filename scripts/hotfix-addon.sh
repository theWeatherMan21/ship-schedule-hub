#!/usr/bin/env bash
# 船期引擎/App 有变更时，给插件一侧发一个补丁版（保持两边版本对齐）
# 用法：scripts/hotfix-addon.sh "变更说明"
# 插件仓库位置：$WPS_ADDON_DIR（默认 ~/Documents/trae_projects/wps-shiptrack）
set -euo pipefail
DIR="${WPS_ADDON_DIR:-$HOME/Documents/trae_projects/wps-shiptrack}"
NOTE="${1:-}"
[ -d "$DIR" ] || { echo "找不到插件仓库：$DIR"; exit 1; }
cd "$DIR"
CUR=$(python3 -c "import json;print(json.load(open('package.json'))['version'])")
NEW=$(python3 -c "v='$CUR'.split('.');v[-1]=str(int(v[-1])+1);print('.'.join(v))")
python3 - "$NEW" <<'PY'
import json,sys
v=sys.argv[1]
d=json.load(open('package.json')); d['version']=v
json.dump(d,open('package.json','w'),ensure_ascii=False,indent='\t')
p='src/components/TaskPane.vue'; s=open(p,encoding='utf-8').read()
import re
s=re.sub(r"const APP_VER = '[0-9.]+'", f"const APP_VER = '{v}'", s)
open(p,'w',encoding='utf-8').write(s)
print('bump ->', v)
PY
node scripts/build.cjs online >/dev/null
node scripts/template-lint.mjs
node scripts/invariants-test.mjs >/dev/null
git add -A && git -c user.name="Hermes" -c user.email="hermes@local" commit -m "hotfix: ${NOTE:-与船期 App 同步} (v${NEW})" >/dev/null
git -c http.version=HTTP/1.1 push origin main
./scripts/publish.sh --notes "${NOTE:-与船期 App 同步} (v${NEW})"
echo "hotfix 完成：v${CUR} -> v${NEW}"

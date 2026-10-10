#!/bin/bash
# 万无一失大排查：5 条代表航线 × 全 11 家（真实档案克隆）
cd /Users/russospencer/Documents/trae_projects/ShipScheduleHub
rm -f /tmp/sweep2.tsv; rm -rf /tmp/sweep2-logs; mkdir -p /tmp/sweep2-logs
rm -rf /tmp/sweep-prof && cp -Rc "$HOME/Library/Application Support/ShipScheduleHub/browser-profile" /tmp/sweep-prof 2>/dev/null
LANES=("ningbo|hamburg|" "qingdao|gdansk|" "shanghai|rotterdam|" "tianjin|ashdod|" "xiamen|rotterdam|2026-10-25")
i=0
for L in "${LANES[@]}"; do
  i=$((i+1))
  O=$(echo "$L" | cut -d'|' -f1); D=$(echo "$L" | cut -d'|' -f2); DT=$(echo "$L" | cut -d'|' -f3)
  echo "=== lane $i: $O -> $D ${DT:+(date=$DT)} ===" >> /tmp/sweep2.tsv
  ARGS=(--origin "$O" --destination "$D" --no-cache)
  [ -n "$DT" ] && ARGS+=(--date "$DT")
  SSH_PROFILE_DIR=/tmp/sweep-prof bash qa/run-engine-isolated.sh "${ARGS[@]}" > /tmp/sweep2-logs/lane$i.log 2>&1
  python3 - <<PY >> /tmp/sweep2.tsv
import json
for l in open('/tmp/sweep2-logs/lane$i.log', encoding='utf-8', errors='ignore'):
    l=l.strip()
    if not l.startswith('{'): continue
    try: d=json.loads(l)
    except: continue
    if d.get('type')=='carrier-status' and d.get('status')!='running':
        n=len(d.get('schedules') or [])
        msg=str(d.get('msg'))[:110].replace('\t',' ').replace('\n',' ')
        print('lane$i\t%s\t%s\t%d\t%s' % (d.get('carrier'), d.get('status'), n, msg))
PY
  sleep 3
done
echo "SWEEP2-DONE $(date '+%H:%M:%S')" >> /tmp/sweep2.tsv

#!/bin/bash
cd /Users/russospencer/Documents/trae_projects/ShipScheduleHub
rm -f /tmp/retest4.tsv; rm -rf /tmp/retest4-logs; mkdir -p /tmp/retest4-logs
CASES=("zim|shanghai|rotterdam" "zim|xiamen|hamburg" "evergreen|xiamen|rotterdam" "cosco|tianjin|ashdod")
i=0
for L in "${CASES[@]}"; do
  i=$((i+1))
  CAR=$(echo "$L" | cut -d'|' -f1); O=$(echo "$L" | cut -d'|' -f2); D=$(echo "$L" | cut -d'|' -f3)
  SSH_PROFILE_DIR=/tmp/prof-copy bash qa/run-engine-isolated.sh --origin "$O" --destination "$D" --carriers "$CAR" --no-cache > /tmp/retest4-logs/$i.log 2>&1
  python3 - <<PY >> /tmp/retest4.tsv
import json
seen = []
for l in open('/tmp/retest4-logs/$i.log', encoding='utf-8', errors='ignore'):
    l=l.strip()
    if not l.startswith('{'): continue
    try: d=json.loads(l)
    except: continue
    if d.get('type')=='carrier-status' and d.get('status')!='running':
        n=len(d.get('schedules') or [])
        msg=str(d.get('msg'))[:140].replace('\t',' ').replace('\n',' ')
        seen.append('%s | %s | %d | %s' % (d.get('status'), str(d.get('t'))[11:19], n, msg))
for s in seen: print('%s %s->%s | %s' % ('$CAR', '$O', '$D', s))
print('%s | 状态行数=%d（应为1）' % ('$CAR', len(seen)))
PY
  sleep 2
done
echo "RETEST4-DONE $(date '+%H:%M:%S')" >> /tmp/retest4.tsv

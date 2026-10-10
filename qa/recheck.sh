#!/bin/bash
cd /Users/russospencer/Documents/trae_projects/ShipScheduleHub
rm -f /tmp/recheck.tsv; rm -rf /tmp/recheck-logs; mkdir -p /tmp/recheck-logs
CASES=("zim|shanghai|rotterdam|" "zim|xiamen|rotterdam|" "hmm|qingdao|gdansk|" "hmm|xiamen|rotterdam|" "hapag|qingdao|gdansk|" "hapag|xiamen|rotterdam|" "evergreen|xiamen|rotterdam|" "yangming|qingdao|gdansk|" "cosco|tianjin|ashdod|" "cma|ningbo|hamburg|")
i=0
for L in "${CASES[@]}"; do
  i=$((i+1))
  CAR=$(echo "$L" | cut -d'|' -f1); O=$(echo "$L" | cut -d'|' -f2); D=$(echo "$L" | cut -d'|' -f3)
  SSH_PROFILE_DIR=/tmp/sweep-prof bash qa/run-engine-isolated.sh --origin "$O" --destination "$D" --carriers "$CAR" --no-cache > /tmp/recheck-logs/$i.log 2>&1
  python3 - <<PY >> /tmp/recheck.tsv
import json
for l in open('/tmp/recheck-logs/$i.log', encoding='utf-8', errors='ignore'):
    l=l.strip()
    if not l.startswith('{'): continue
    try: d=json.loads(l)
    except: continue
    if d.get('type')=='carrier-status' and d.get('status')!='running':
        n=len(d.get('schedules') or [])
        msg=str(d.get('msg'))[:150].replace('\t',' ').replace('\n',' ')
        print('%s\t%s\t%s\t%s\t%s\t%d\t%s' % ('$CAR', '$O', '$D', 'lane', d.get('status'), n, msg))
PY
  sleep 2
done
echo "RECHECK-DONE $(date '+%H:%M:%S')" >> /tmp/recheck.tsv

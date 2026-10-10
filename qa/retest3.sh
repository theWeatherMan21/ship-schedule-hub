#!/bin/bash
cd /Users/russospencer/Documents/trae_projects/ShipScheduleHub
rm -f /tmp/retest3.tsv; rm -rf /tmp/retest3-logs; mkdir -p /tmp/retest3-logs
CASES=("zim|shanghai|hamburg|" "zim|shanghai|rotterdam|" "zim|xiamen|hamburg|" "hmm|qingdao|gdansk|" "hmm|xiamen|rotterdam|" "evergreen|xiamen|rotterdam|")
i=0
for L in "${CASES[@]}"; do
  i=$((i+1))
  CAR=$(echo "$L" | cut -d'|' -f1); O=$(echo "$L" | cut -d'|' -f2); D=$(echo "$L" | cut -d'|' -f3)
  SSH_PROFILE_DIR=/tmp/prof-copy bash qa/run-engine-isolated.sh --origin "$O" --destination "$D" --carriers "$CAR" --no-cache > /tmp/retest3-logs/$i.log 2>&1
  python3 - <<PY >> /tmp/retest3.tsv
import json
for l in open('/tmp/retest3-logs/$i.log', encoding='utf-8', errors='ignore'):
    l=l.strip()
    if not l.startswith('{'): continue
    try: d=json.loads(l)
    except: continue
    if d.get('type')=='carrier-status' and d.get('status')!='running':
        n=len(d.get('schedules') or [])
        msg=str(d.get('msg'))[:130].replace('\t',' ').replace('\n',' ')
        print('%s %s->%s | %s | %d | %s' % ('$CAR', '$O', '$D', d.get('status'), n, msg))
PY
  sleep 2
done
echo "RETEST3-DONE $(date '+%H:%M:%S')" >> /tmp/retest3.tsv

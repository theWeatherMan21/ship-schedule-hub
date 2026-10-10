#!/bin/bash
# 全中国基港复测（msc+one 直测；验证"码头码映射"修复）
cd /Users/russospencer/Documents/trae_projects/ShipScheduleHub
for PORT in qingdao shanghai ningbo tianjin xiamen nansha; do
  rm -rf /tmp/cb-$PORT && mkdir -p /tmp/cb-$PORT
  echo "=== $PORT ==="
  SSH_PROFILE_DIR=/tmp/cb-$PORT bash qa/run-engine-isolated.sh --origin $PORT --destination hamburg --carriers msc,one --no-cache 2>&1 | grep '"type":"carrier-status"' | python3 -c "
import sys, json
for l in sys.stdin:
    d = json.loads(l)
    if d.get('status') != 'running':
        print('  [%s] %s %d | %s' % (d.get('carrier'), d.get('status'), len(d.get('schedules') or []), str(d.get('msg'))[:100]))
"
  rm -rf /tmp/cb-$PORT
  sleep 3
done
echo "SWEEP-DONE"

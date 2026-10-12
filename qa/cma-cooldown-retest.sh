cd /Users/russospencer/Documents/trae_projects/ShipScheduleHub
python3 -c "import time; time.sleep(1750)"
rm -rf /tmp/prof-copy4 && cp -Rc "$HOME/Library/Application Support/ShipScheduleHub/browser-profile" /tmp/prof-copy4
rm -rf /tmp/cma-cool && mkdir -p /tmp/cma-cool
SSH_PROFILE_DIR=/tmp/prof-copy4 bash qa/run-engine-isolated.sh --origin ningbo --destination hamburg --carriers cma --no-cache > /tmp/cma-cool.log 2>&1
echo "=== 达飞凉茶复测 $(date '+%H:%M:%S') ===" >> /tmp/cma-cool/results.txt
grep '"type":"carrier-status"' /tmp/cma-cool.log | python3 -c "
import sys, json
for l in sys.stdin:
    d = json.loads(l)
    if d.get('status') != 'running': print('[cma] %s %d | %s' % (d.get('status'), len(d.get('schedules') or []), str(d.get('msg'))[:110]))
" >> /tmp/cma-cool/results.txt
cat /tmp/cma-cool/results.txt
rm -rf /tmp/cma-cool
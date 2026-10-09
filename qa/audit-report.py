#!/usr/bin/env python3
"""从引擎审计日志生成 DoD 表：状态/条数 + 我们输入什么 + 表单填成什么（从消息解析）"""
import json, re, sys

def load(p):
    rows, audits = [], {}
    for l in open(p, encoding='utf-8', errors='replace'):
        l = l.strip()
        if not l.startswith('{'): continue
        try: d = json.loads(l)
        except Exception: continue
        if d.get('type') == 'carrier-status' and d.get('status') not in ('running',): rows.append(d)
        if d.get('type') == 'fill-audit': audits[d['carrier']] = d
    return rows, audits

rows, audits = load(sys.argv[1])
print('  %-10s %-10s %5s  %-42s %s' % ('船司', '状态', '条数', '表单里填成什么（消息解析）', 'DOM 审计'))
for r in rows:
    msg = str(r.get('msg') or '')
    m = re.search(r'已(?:填|预填)\s*([^→]{1,40})\s*→\s*([^，,（(]{1,40})', msg)
    filled = ('%s → %s' % (m.group(1).strip(), m.group(2).strip())) if m else ''
    if not filled:
        m2 = re.search(r'([A-Za-z ,()]{3,40})\s*→\s*([A-Za-z ,()]{3,40})', msg)
        filled = ('%s → %s' % (m2.group(1).strip(), m2.group(2).strip())) if m2 else ''
    a = audits.get(r['carrier'], {})
    dom = ' / '.join(x['v'] for x in a.get('fields', [])[:2])[:30]
    print('  %-10s %-10s %5d  %-42s %s' % (r['carrier'], r.get('status'), len(r.get('schedules') or []), filled[:42], dom))

d = sum(1 for r in rows if r.get('schedules'))
t = sum(len(r.get('schedules') or []) for r in rows)
print('\n  汇总：%d 家有船期 / %d 条（原始条数，前端会去重）' % (d, t))

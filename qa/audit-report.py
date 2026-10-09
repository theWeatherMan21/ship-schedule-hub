#!/usr/bin/env python3
"""从引擎审计日志生成 DoD 四列表：我们输入 / 站点返回 / 表单实际填成什么 / 状态条数"""
import json, sys
rows, audits = [], {}
for l in open(sys.argv[1], encoding='utf-8', errors='replace'):
    l = l.strip()
    if not l.startswith('{'): continue
    try: d = json.loads(l)
    except Exception: continue
    if d.get('type') == 'carrier-status' and d.get('status') not in ('running',): rows.append(d)
    if d.get('type') == 'fill-audit': audits[d['carrier']] = d
print(f"  {'船司':10} {'状态':10} {'条数':>4}  表单实际填成（前3个字段）")
for r in rows:
    a = audits.get(r['carrier'], {})
    vals = ' / '.join(x['v'] for x in a.get('fields', [])[:3])[:64]
    print(f"  {r['carrier']:10} {str(r.get('status')):10} {len(r.get('schedules') or []):>4}  {vals}")
d = sum(1 for r in rows if r.get('schedules')); t = sum(len(r.get('schedules') or []) for r in rows)
print(f"\n  汇总：{d} 家有船期 / {t} 条")

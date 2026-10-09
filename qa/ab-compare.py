#!/usr/bin/env python3
"""对比两份审计日志：哪些家的填表/结果变了（同航线 before/after）"""
import json, sys
def load(p):
    r, a = {}, {}
    for l in open(p, encoding='utf-8', errors='replace'):
        l = l.strip()
        if not l.startswith('{'): continue
        try: d = json.loads(l)
        except Exception: continue
        if d.get('type') == 'carrier-status' and d.get('status') not in ('running',):
            r[d['carrier']] = (d.get('status'), len(d.get('schedules') or []))
        if d.get('type') == 'fill-audit':
            a[d['carrier']] = ' / '.join(x['v'] for x in d.get('fields', [])[:2])[:50]
    return r, a
A, Aa = load(sys.argv[1]); B, Ba = load(sys.argv[2])
print('  %-10s %-16s %-16s %s' % ('船司', '改前(填成/条)', '改后(填成/条)', '变化'))
for c in sorted(set(A) | set(B)):
    a = A.get(c, ('-', 0)); b = B.get(c, ('-', 0))
    fa, fb = Aa.get(c, ''), Ba.get(c, '')
    mark = ''
    if b[1] > a[1]: mark = '↑ 变好'
    elif b[1] < a[1]: mark = '↓ 变差'
    elif a[1] == b[1] and a[1] == 0: mark = '= 都无'
    print('  %-10s %-16s %-16s %s' % (c, '%s/%d' % (a[0], a[1]), '%s/%d' % (b[0], b[1]), mark))
print('  填成对照:')
for c in sorted(set(Aa) | set(Ba)):
    if Aa.get(c, '') != Ba.get(c, ''):
        print('    %-10s 改前: %-30s 改后: %s' % (c, Aa.get(c, '') or '(无)', Ba.get(c, '') or '(无)'))

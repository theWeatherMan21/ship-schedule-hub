#!/usr/bin/env python3
"""港口命名对比：把各家对同一港口的命名拉平（MSC 全量表 + CMA/YangMing 候选）。"""
import json, os

msc = json.load(open('docs/msc-ports-raw.json'))
raw = json.load(open('docs/port-names-raw.json'))
msc_ports = msc.get('Ports', [])
print(f"MSC 港口总数: {len(msc_ports)}")

# 目标港口关键词 → 用于在各家结果里搜
TARGETS = {
    '南沙': ['NANSHA', 'NANSHAN', 'GUANGZHOU'],
    '深圳': ['SHENZHEN', 'SHEKOU', 'YANTIAN', 'CHIWAN', 'DA CHAN BAY'],
    '广州': ['GUANGZHOU'],
    '上海': ['SHANGHAI'],
    '宁波': ['NINGBO'],
    '青岛': ['QINGDAO'],
    '天津': ['TIANJIN'],
    '厦门': ['XIAMEN'],
    '大连': ['DALIAN'],
    '伊斯坦布尔': ['ISTANBUL', 'AMBARLI', 'HAYDARPASA', 'MARPORT', 'KUMPORT', 'GEBZE', 'IZMIT'],
    '鹿特丹': ['ROTTERDAM'],
}

def msc_hits(kws):
    out = []
    for p in msc_ports:
        n = (p.get('LocationName') or '').upper()
        if any(k in n for k in kws):
            out.append(f"{p['LocationName']} ({p['LocationCode']}) [{p.get('CountryIsoCode')}]")
    return out

def ym_hits(rec, kws):
    out = []
    for x in rec.get('yangming', []) if isinstance(rec.get('yangming'), list) else []:
        lab = (x.get('label') or '').upper()
        if any(k in lab for k in kws):
            out.append(f"{x['label']}")
    return out

def cma_hits(rec, kws):
    out = []
    for x in rec.get('cma', []) if isinstance(rec.get('cma'), list) else []:
        n = (x.get('name') or '').upper()
        if any(k in n for k in kws):
            out.append(f"{x['name']} [{x['type']}]")
    return out

# 把 CMA/YangMing 的候选全按关键词聚合（跨所有调研关键词）
all_cma, all_ym = [], []
for rec in raw.values():
    if isinstance(rec.get('cma'), list):
        all_cma.extend(rec['cma'])
    if isinstance(rec.get('yangming'), list):
        all_ym.extend(rec['yangming'])

lines = ['# 港口命名对比（同一港口 · 各船司命名差异）\n',
         '> 2026-09-23 调研 ｜ MSC 为全量表精确匹配，CMA/YangMing 为其地点接口候选\n',
         '| 港口 | MSC 命名 | CMA 命名 | YangMing 命名 |',
         '| --- | --- | --- | --- |']

for cn, kws in TARGETS.items():
    m = [x for x in msc_hits(kws)]
    c = []
    for x in all_cma:
        if any(k in (x.get('name') or '').upper() for k in kws):
            s = f"{x['name']} [{x['type']}]"
            if s not in c: c.append(s)
    y = []
    for x in all_ym:
        if any(k in (x.get('label') or '').upper() for k in kws):
            if x['label'] not in y: y.append(x['label'])
    fmt = lambda arr: '<br>'.join(arr[:6]) if arr else '**（无）**'
    lines.append(f"| **{cn}** | {fmt(m)} | {fmt(c)} | {fmt(y)} |")

lines.append('')
lines.append('## 观察\n')
lines.append('- **MSC 的港口表是「精选表」**：只有它实际挂靠的港口，因此很多中国港口查不到（如南沙）')
lines.append('- **同一港口各家命名/码不同**：南沙在 CMA=`NANSHA(CNNSA)`，YangMing 分新老港 `CNNNP/CNNSA`，MSC 可能无此港')
lines.append('- **CMA 返回带类型**：`[Port]` 才是港口，`[Door]/[Ramp • Door]` 是内陆点（选了没船期）')
lines.append('- **同名干扰普遍**：深圳南山 vs 广州南沙；鹿特丹 vs 美国/新加坡同名')

open('docs/PORT-NAMES-COMPARE.md', 'w').write('\n'.join(lines))
print('✅ 对比表 → docs/PORT-NAMES-COMPARE.md')
print('\n'.join(lines[:20]))

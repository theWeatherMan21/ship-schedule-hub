#!/usr/bin/env python3
"""导出前端港口数据 + 用坐标近邻自动建「港口圈」（同港区码头聚合）。
爹地 9-23 需求：输入 istanbul 要能智能识别到 Istanbul/Ambarli/Marport 等。
"""
import sqlite3, json, math, sys
from collections import defaultdict

DB = 'db/ports.db'
OUT = 'public/ports.json'   # 前端运行时 fetch（避免 3MB 打进 JS bundle）
NEAR_KM = 45.0   # 同港区半径（伊斯坦布尔圈含 Ambarli/Marport 约 23-35km，婉宜 9-23 调大）

def parse_coord(s):
    """'4058N 02842E' → (40.9667, 28.7)"""
    try:
        s = (s or '').strip()
        if not s or ' ' not in s:
            return None
        a, b = s.split()
        def cv(t, dlen):
            v = int(t[:dlen]) + int(t[dlen:dlen+2]) / 60.0
            # 秒只在确实存在时解析（'4101N' 长度 5，别把末尾的 N/S/E/W 当秒数 —— 婉宜 9-23 踩过）
            if len(t) >= dlen + 4 and t[dlen+2:dlen+4].isdigit():
                v += int(t[dlen+2:dlen+4]) / 3600.0
            return -v if t[-1] in 'SW' else v
        return (cv(a, 2), cv(b, 3))
    except Exception:
        return None

con = sqlite3.connect(DB)
rows = []
for locode, name, country, coord in con.execute(
        "SELECT locode, name, country, coordinates FROM ports "
        "WHERE name IS NOT NULL AND name != ''"):
    ll = parse_coord(coord)
    rows.append({'l': locode, 'n': name, 'c': country, 'll': ll})
con.close()

print(f"港口总数: {len(rows)}")

# 网格索引（0.5° ≈ 55km 纬向）加速近邻查询
grid = defaultdict(list)
for i, r in enumerate(rows):
    if r['ll']:
        grid[(int(r['ll'][0] / 0.5), int(r['ll'][1] / 0.5))].append(i)

def haversine(a, b):
    R = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(h)))

out = []
near_count = 0
for i, r in enumerate(rows):
    entry = {'l': r['l'], 'n': r['n'], 'c': r['c']}
    if r['ll']:
        gy, gx = int(r['ll'][0] / 0.5), int(r['ll'][1] / 0.5)
        cand = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cand.extend(grid.get((gy + dy, gx + dx), []))
        near = []
        seen_names = {r['n'].lower()}
        for j in cand:
            if j == i:
                continue
            o = rows[j]
            if not o['ll'] or o['n'].lower() in seen_names:
                continue
            if haversine(r['ll'], o['ll']) <= NEAR_KM:
                near.append({'l': o['l'], 'n': o['n'], 'd': round(haversine(r['ll'], o['ll']))})
                seen_names.add(o['n'].lower())
        near.sort(key=lambda x: x['d'])
        if near:
            entry['near'] = near[:10]  # 确保 Ambarli(23km) 这类关键集装箱码头不被截断
            near_count += 1
    out.append(entry)

json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
import os
print(f"导出: {OUT}  {os.path.getsize(OUT)/1024:.0f} KB")
print(f"有近邻的港口: {near_count}")

# 验证伊斯坦布尔圈
for e in out:
    if e['n'] == 'Istanbul' and e['c'] == 'TR':
        print(f"\n✅ 验证 Istanbul 圈: {json.dumps(e, ensure_ascii=False)}")
        break
for e in out:
    if e['n'] == 'Ningbo':
        print(f"✅ 验证 Ningbo: {json.dumps(e, ensure_ascii=False)}")
        break

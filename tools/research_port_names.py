#!/usr/bin/env python3
"""港口命名调研：同一港口在各船司系统里的不同搜索名。
爹地 9-23 需求：国内港口（南沙等）和国外港口都要，各家命名不一样。

直连可用的接口（2026-09-23 实测）：
  - CMA:      /api/PortsWithInlands/GetAllPlaces?id=<kw>
  - YangMing: /api/P2P/GetLocations?queryType=F&searchByCode=TRUE&locationName=<kw>
被 Akamai 拦需浏览器：MSC / ZIM（另用有头脚本）
"""
import json, subprocess, time, sys, os

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")

def curl(url, timeout=25):
    r = subprocess.run(['curl', '-s', '--max-time', str(timeout), '-A', UA,
                        '-H', 'Accept: application/json', url],
                       capture_output=True, text=True)
    return r.stdout

def cma(kw):
    """CMA 地点查询 → [{name, code, capsule}]"""
    raw = curl(f"https://www.cma-cgm.com/api/PortsWithInlands/GetAllPlaces?id={kw}")
    try:
        d = json.loads(raw)
    except Exception:
        return {'error': raw[:120]}
    return [{'name': x.get('actualName') or x.get('name'),
             'place': x.get('placeCode'), 'type': x.get('capsule')} for x in d][:12]

def yangming(kw):
    """YangMing 地点查询 → [{label, code}]"""
    raw = curl(f"https://www.yangming.com/api/P2P/GetLocations?queryType=F&searchByCode=TRUE&locationName={kw}")
    try:
        d = json.loads(raw)
    except Exception:
        return {'error': raw[:120]}
    return [{'label': x.get('label'), 'code': x.get('locationCode')} for x in d][:12]

PORTS = ['Nansha', 'Shenzhen', 'Shekou', 'Yantian', 'Chiwan', 'Guangzhou',
         'Shanghai', 'Ningbo', 'Qingdao', 'Tianjin', 'Xiamen', 'Dalian',
         'Istanbul', 'Rotterdam']

out = {}
for p in PORTS:
    print(f"\n{'='*70}\n### {p}")
    rec = {}
    c = cma(p)
    rec['cma'] = c
    print("  CMA:")
    if isinstance(c, dict):
        print("   ", c)
    else:
        for x in c:
            print(f"    [{x['type']:6s}] {x['name']}  ({x['place']})")
    time.sleep(1.5)
    y = yangming(p[:4])
    rec['yangming'] = y
    print("  YangMing:")
    if isinstance(y, dict):
        print("   ", y)
    else:
        for x in y:
            print(f"    {x['label']}")
    out[p] = rec
    time.sleep(1.5)

os.makedirs('docs', exist_ok=True)
json.dump(out, open('docs/port-names-raw.json', 'w'), ensure_ascii=False, indent=1)
print(f"\n\n原始数据 → docs/port-names-raw.json")

#!/usr/bin/env python3
"""把调研原始数据汇总成可读报告（同一港口在各船司的命名差异）。"""
import json, os

raw = json.load(open('docs/port-names-raw.json'))

# 港口 → 中文名（便于阅读）
CN = {
    'Nansha': '南沙', 'Shenzhen': '深圳', 'Shekou': '蛇口', 'Yantian': '盐田',
    'Chiwan': '赤湾', 'Guangzhou': '广州', 'Shanghai': '上海', 'Ningbo': '宁波',
    'Qingdao': '青岛', 'Tianjin': '天津', 'Xiamen': '厦门', 'Dalian': '大连',
    'Istanbul': '伊斯坦布尔', 'Rotterdam': '鹿特丹',
}

lines = []
lines.append('# 港口命名调研 —— 同一港口在各船司系统的不同搜索名\n')
lines.append('> 调研日期：2026-09-23 ｜ 目的：让引擎知道「同一个港口，每家船司该用什么名字搜」\n')
lines.append('## 调研方法\n')
lines.append('直连各家「地点查询」接口（无需登录、比驱动页面快百倍）：\n')
lines.append('| 船司 | 接口 | 状态 |')
lines.append('| --- | --- | --- |')
lines.append('| CMA CGM | `/api/PortsWithInlands/GetAllPlaces?id=<关键词>` | ✅ 直连可用 |')
lines.append('| Yang Ming | `/api/P2P/GetLocations?queryType=F&searchByCode=TRUE&locationName=<关键词>` | ✅ 直连可用 |')
lines.append('| MSC | `/api/feature/tools/GetAllAvailableCountriesAndPorts` | ⛔ Akamai 拦（需浏览器上下文）|')
lines.append('| ZIM | `apigw.zim.com/digitalMasterData/.../locations?searchTerm=` | ⛔ Akamai 拦 |')
lines.append('| COSCO | `/ebusiness/sailingSchedule/searchByCity` | ⏳ 待测 |')
lines.append('| Maersk / ONE / Evergreen / HMM / Hapag | 待挖 | ⏳ |')
lines.append('')

lines.append('## 核心发现（比名字差异本身更重要）\n')
lines.append('**① 同一个港口，各家的 LOCODE 可能不同** —— 不能假设「一个港口 = 一个码」：\n')
lines.append('- 深圳：YangMing 用 `CNSZP`，而业界常见写法是 `CNSZX`')
lines.append('- 南沙：CMA 用 `CNNSA`（老港），YangMing 区分 `CNNNP`（新港）/ `CNNSA`（老港）')
lines.append('')
lines.append('**② 同一港口在同一家还分 Port / Door / Ramp 多种类型** —— 查船期必须用 **Port**：\n')
lines.append('- CMA 的返回带 `capsule` 字段：`Port` = 港口，`Door` = 门到门内陆点，`Ramp • Door` = 铁路场站')
lines.append('- 例：伊斯坦布尔在 CMA 有 4 条 —— `ISTANBUL`(Door) / `ISTANBUL, TR`(Door) / '
             '`HAYDARPASA ISTANBUL ASIAN SIDE`(Port) / `ISTANBUL, AMBARLI PORT E. SIDE`(Port)')
lines.append('- **直接搜 ISTANBUL 可能命中 Door 点导致无船期**，这就是「马士基必须选 CY」的同类问题')
lines.append('')
lines.append('**③ 同名地点会污染候选** —— 必须靠国家/州省码消歧：\n')
lines.append('- 南沙：CMA 首条是 `NANSHAN, 44`（深圳南山，不是广州南沙）')
lines.append('- 鹿特丹：YangMing 返回 9 条，含德国小镇 Rottweil/Rottum/Rottenburg 等干扰项')
lines.append('- 鹿特丹：CMA 还有 `ROTTERDAM, NY`(美国) / `ROTTERDAM`(新加坡)')
lines.append('')

lines.append('## 逐港口对比\n')
for port, rec in raw.items():
    cn = CN.get(port, '')
    lines.append(f'### {port}{"（" + cn + "）" if cn else ""}\n')
    lines.append('| 船司 | 搜索名 | LOCODE | 类型 |')
    lines.append('| --- | --- | --- | --- |')
    c = rec.get('cma')
    if isinstance(c, list):
        for x in c:
            lines.append(f"| CMA | `{x['name']}` | {x['place']} | {x['type']} |")
    elif isinstance(c, dict):
        lines.append(f"| CMA | (失败: {str(c.get('error'))[:50]}) | | |")
    y = rec.get('yangming')
    if isinstance(y, list):
        for x in y:
            lines.append(f"| YangMing | `{x['label']}` | {x['code']} | — |")
    elif isinstance(y, dict):
        lines.append(f"| YangMing | (失败: {str(y.get('error'))[:50]}) | | |")
    lines.append('')

lines.append('## 结论 / 对引擎的意义\n')
lines.append('1. **别名表不能只按「港口」建，要按「船司 × 港口」建** —— 同一港口各家名字/码都不同')
lines.append('2. **必须带类型过滤**：只接受 Port 类候选，跳过 Door/Ramp（否则拿到门到门点，无船期）')
lines.append('3. **必须带国家消歧**：候选匹配时用国家码约束，避免南沙→深圳南山、鹿特丹→德国小镇')
lines.append('4. **首选策略**：查询时优先用「港口级」名字（如 NANSHA 而非 NANSHAN），再回退码头级')
lines.append('5. 各家接口可直连的优先直连（CMA/YangMing），被反爬拦的走浏览器上下文（MSC/ZIM）')
lines.append('')

os.makedirs('docs', exist_ok=True)
open('docs/PORT-NAMES-RESEARCH.md', 'w').write('\n'.join(lines))
print('✅ 报告 → docs/PORT-NAMES-RESEARCH.md')
print(f'   覆盖港口 {len(raw)} 个')

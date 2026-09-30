# 同港异名对照表 —— Ningbo → Istanbul（2026-09-21 实测）

> 婉宜 + 码农联合产出。每家船司对同一组港口的实际称呼、服务模式徽标、结果。
> **先证数据通，再谈壳** —— 本表是聚合查询的港口词典底座。

## 一、主表（Ningbo → Istanbul 系）

| 船司 | 起运港称呼 | 目的港称呼 | 服务模式 | 结果 | 备注 |
|---|---|---|---|---|---|
| **Maersk** | `Ningbo (Zhejiang), China` | `Istanbul, Turkey`（CY） | CY/SD 徽标在候选内 | **Istanbul: 无直航**；**Ambarli: 6 条** ✅ Transit 26-50 天 | ⭐ Istanbul 本身无船期，须选 `Ambarli Port Istanbul, Turkey`（CY）——即伊斯坦布尔实际集装箱主港 |
| **MSC** | `NINGBO, CHINA (CNNGB)` | `ISTANBUL, TURKIYE (TRIST)` | 无 SD/CY 徽标 | OK ✅（搜索结果有数据） | MSC 用 TÜRKİYE 新拼写；TRIST=阿姆巴利 |
| **COSCO** | `Ningbo,Ningbo,Zhejiang,China` | `Istanbul, ,Istanbul,Turkey` | 无徽标（有位置 modal） | OK ✅ 3 艘船多航次，最短 26 天 | 表单有「选择所在地」modal 需点 Confirm |
| **ONE** | `NINGBO, ZHEJIANG, CHINA (CY)`（词典短前缀 `ningbo`→CY 候选点选） | `ISTANBUL, TURKEY (CY)`（词典 `istanbul`→CY 候选点选） | **CY/DOOR 徽标**（DOOR≠SD） | OK ✅ Total 1 results（03:52 m4-one 版） | 婉宜 9-22 修复：词典 alias 改短前缀才出 CY 候选；引擎配方 v6b 已按此重写（role=option 轮询点 CY 行） |
| **Evergreen** | `NINGBO, CHINA (CNNGB) [ZIP:315000]` | `ISTANBUL (TRIST)` | 无徽标（带邮编） | OK ✅ | 组件点击后回读值含 ZIP |
| **Yang Ming** | `NINGBO, ZJ (CNNGB)` | `ISTANBUL (TRIST)` | 表单内 CY/SD 单选（默认 CY） | OK ✅ | Service Term 是独立单选，非候选徽标 |
| **HMM** | location 表单（"Ningbo, China"） | HAYDARPASA TMNL（Haydarpaşa） | — | **EMPTY=真实答案**：Ningbo→Istanbul(HAYDARPASA) 0 条直航 | 9-22 复核确认无直航（run8 曾误判 OK） |
| **ZIM** | `Ningbo (ZJ), China. People's Republic`（CNNGB;10，词典 `ningbo`） | `Besiktas (ISTANBUL)., Turkiye`（TRBTS;10）/`Istanbul Ambarli, Turkiye`（TRKPX;10）/`Istanbul - Haydarpasa`(TRHYY;10)/`Istanbul`(TRIST;0)，词典 `istanbul`（默认选 Besiktas TRBTS;10 anchor 港） | 无徽标；anchor/land 图标（anchor=MARINE） | 🟡 半闭环定案（v6b XHR 铁证）：表单通、Search 已点、深链被 Akamai Challenge Validation 服务器级拦截 | 候选行文本不含 LOCODE，按名称匹配；候选首位是干扰项 Dronningborg（land）；aliases 已入库 besiktas istanbul→TRBTS、istanbul ambarli→TRKPX、istanbul haydarpasa→TRHYY |
| **CMA CGM** | `ningbo(CNNGB)•China Port`（词典 `ningbo`） | `istanbul, ambarli port e. side(TRAVC)•Turkiye Port`（Ambarli=实际集装箱港）；`haydarpasa istanbul asian side(TRHAY)•Port` 次选 | 行尾 Port / Ramp • Door 标签 | ✅ 词典版闭环（v6b 06:49）：预填→Search→**Transit 45 Days** | Kendo：点 `li.place-suggestion` 后 input 变 `NAME ; COUNTRY ; LOCODE`（回读读 #AutoCompletePOL/POD，role 回读恒空）；IP 频率限制实存 |
| **Hapag-Lloyd** | — | — | — | 🔴 降级档：Cloudflare 交互式挑战（403 Just a moment），仅开页 | 无头实测 9-22 复核仍拦，非环境抖动 |

## 二、关键结论

1. **「Istanbul」在马士基语义里不是集装箱港口**：CY 模式直接搜 Istanbul = 0 船期；
   要选 **Ambarli Port Istanbul**（阿姆巴利 = 伊斯坦布尔欧洲侧集装箱主港，UN/LOCODE TRAMB/TRIST 系）。
   —— 这正是爹地说的「Izmit≈Gebze≈Izmit Korfezi」类同港异名的实例。
2. **六家通用词根**：NINGBO/CNNGB（中国宁波）、ISTANBUL/TRIST（阿姆巴利/伊斯坦布尔）。
   MSC/Evergreen/Yang Ming 直接用 **TRIST**；ONE/马士基用 **Istanbul/Ambarli 文字**。
3. **服务模式徽标各家不同**：Maersk/ONE 在候选里带 CY/DOOR 徽标（ONE 用 DOOR 不用 SD）；
   Yang Ming 是表单单选；MSC/COSCO/Evergreen 无此概念。
4. **土耳其拼写**：MSC 已用新官方拼写 **TÜRKIYE**，其余用 TURKEY —— 检索词要两者都兼容。
5. **中转 reality check**：宁波→伊斯坦布尔多数航线经地中海枢纽中转，Transit 26-50 天，
   「最短 26 天」出现在 COSCO 和 Maersk-Ambarli 两家，交叉可信。

## 三、证据索引

- 逐家：`evidence/m4-<carrier>.txt / .png / -xhr.json`（10 家全套）
- Maersk-Ambarli 6 条船期：`engine/evidence/autonomous-maersk-ambarli.{txt,png}` + `-xhr.json`
- Maersk Istanbul=0（CY 对照实验）：`engine/evidence/autonomous-maersk-page.txt`
- 配方脚本：`qa/autonomous-maersk-ambarli.mjs`（v6 打法 + Ambarli 消歧）

## 四、待办（下一时间盒）

- [ ] CMA：IP 冷却后用「Kendo 行点击法」（qa/cma-kendo-diag6 已单点验证）跑全链留证
- [ ] ZIM：等 Akamai 对深链接的挑战放宽（或换出口 IP）后补结果页证据
- [ ] Hapag：保持「只开页」降级档，除非 CF 挑战策略变化
- [ ] 对照表接入 App：查询时按本表做「港口词典映射」（用户输 Istanbul → 自动映射各家正确称呼）——已由 portdb+portsolve 落地（engine/lib/portsolve.mjs）

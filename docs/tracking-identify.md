# 提单/箱号识别器（SCAC 前缀路由表 + 兜底）

> 卡片：`【提单追踪】单号识别器 · SCAC 前缀路由表 + 兜底`（kanban t_e66aa5a1）
> 落地：`engine/tracking/identify.mjs`（单一事实来源）+ `engine/tracking/prefixes.json`（机器可读导出）
> 测试：`qa/track-identify-test.mjs`（108 条断言）· 演示：`qa/track-who.mjs`

## 一句话

输入一个号码 → 判断归哪家船司（决定查谁）；**能确定就路由，不能确定就给「可手选的候选 + 原因」**——与业界做法一致（Terminal49 SCACbot / project44 皆「预测 + 置信度/人工兜底」）。

## 两类前缀别混（最常见的「查不到」原因）

| 类型 | 含义 | 走向 | 置信度 |
|---|---|---|---|
| **SCAC**（提单前缀，4 字母） | 出单船司自己的代码 | **跟提单走** | high（0.95）→ 直接路由 |
| **箱主码**（BIC owner code，4 字母，末位常 U/J/Z） | 箱子的主人 | **跟箱子走**；租箱/共享箱可能挂在别家提单上 | medium（0.7）→ 路由但提示可换 |
| 订舱号形态 | 各家不一，不可靠 | 仅作线索 | low（0.3–0.6）→ 多为「候选」 |

## 覆盖（11 家，App 全量）

| 船司 | 提单前缀 SCAC | 箱主码（部分） | 追踪适配器 |
|---|---|---|---|
| Maersk 马士基 | MAEU（+9 位纯数字） | MSKU MRKU MRSU MIEU MNBU SEAU PONU | **live** |
| MSC 地中海 | MSCU MEDU | MSCU MEDU MSDU MSMU MSNU MSPU MSYU GTIU | live |
| Hapag-Lloyd 赫伯罗特 | HLCU HLUS HPET（+8 位纯数字订舱） | HLCU HLXU HLBU UACU UAEU HAMU | live |
| COSCO 中远海运 | COSU COAU COEU | CSNU CBHU CCLU CSLU | live |
| HMM 现代商船 | HDMU HMMU | HDMU HMMU | live |
| ONE 海洋网联 | ONEY | ONEU MOAU NYKU KKFU KKTU KLFU | live |
| ZIM 以星 | ZIMU | ZIMU ZCSU ZMOU | live |
| CMA CGM 达飞 | CMDU | CMAU CGMU ECMU APZU APHU CNCU | none |
| Evergreen 长荣 | EGLV | EGHU EGSU EMCU EISU EITU EGMU EVGU EMEU IMTU LTIU UGMU HMCU | none |
| OOCL 东方海外 | OOLU | OOLU OOCU | none |
| Yang Ming 阳明 | YMLU YMJA（2023 起主码迁 YMJA） | YMLU YMMU | none |

> 来源（R1/R2）：project44 Ocean SCAC appendix；Terminal49 SCAC/箱主码；Vizion「Bill of lading number formatting」；Hapag-Lloyd EDI MIG（8 位订舱）；MSC 2018 公告（MEDU 为提单前缀）；ISO 6346。

## 兜底逻辑（识别不出也不硬猜）

1. 箱号（4 字母 + 7 数字）→ 先做 **ISO 6346 校验位**；校验不过 → 只提示「疑似输错」，不路由。
2. 4 字母是船司 SCAC → high 路由。
3. 4 字母是已知**箱主码**但形态不像完整箱号 → low 线索（候选置顶）。
4. 订舱号形态（9 位→Maersk、8 位→Hapag、M+数字→ZIM）→ 够把握才路由，否则只给候选。
5. 4 字母但**不是海洋船司 SCAC** → 标记「疑货代分单 HBL / 非提单引用」，请手选；**若是分单，改用箱号**更靠谱。
6. 其余 → 认不出，给全部候选（App 顺序）手动选。

返回结构见 `identify()` 头注释：`ok / carrierId / confidence / score / matchedBy / docType / candidates[] / note / flags`。

## 待归户（人工确认中，勿猜死）

| 号码 | 现状 | 假设 |
|---|---|---|
| `M237055674` | 未定（low） | **ZIM 订舱号形态（M+数字，Terminal49 文档）**；亦被当作 MSC 候选——两说未定 |
| `181AY…` | 未定 | 非船司前缀，疑货代分单/他项引用 |
| `CANF…` | 未定 | 4 字母但非海洋船司 SCAC，疑货代/NVOCC 自有 SCAC（分单） |
| `NGP…` | 未定 | 非船司前缀，疑货代分单/他项引用 |

> 需要爹地补一句「这几个是什么单据（提单/订舱/箱号）、跟哪票货」，才能定案。识别器对这些一律只给候选，不硬指。

## 怎么用

```bash
node qa/track-who.mjs COSU6469105960 HLCU2B9E986E7C5E M237055674   # 直接看归属/候选
node qa/track-identify-test.mjs                                    # 回归（108 条）
node qa/track-identify-test.mjs --sync                             # 改表后重建 prefixes.json
```

前端要用：`import('./engine/tracking/prefixes.json')`（纯数据）或按 `identify()` 的逻辑镜像一份（与 `engine/portdb.mjs`↔前端同款做法）。

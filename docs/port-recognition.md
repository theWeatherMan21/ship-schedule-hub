# 港口英文名识别（爹地 10-08 定稿）

用户只输入**英文名**，要求：能正确识别 + 对上各船司名录 + 搜出对应船期。

## 识别顺序（引擎 engine/portdb.mjs 与前端 src/main.js 必须一致）
1. **归一化**：大小写 / 空格 / 连字符 / 点号一律忽略（`Port-of-Spain` = `port of spain` = `portofspain`）
2. **别名精确命中**（船司专属 → 通用）：市场通行名、旧名、常用缩写、常见拼错
3. **词典名字**：归一化相等 → 前缀 → 包含（包含要求 ≥5 字符，防 `true`→`sTruer` 事故）→ 归一化前缀兜底
4. **多候选排序**（同名港「主干港优先」，**必须多源交叉，不能只看一家船司**）：
   人工优先表 > 公开吞吐量排名 > MSC 名录 > 多家船司已验证别名命中数 > 名字完全相等

## 数据源（都在 `data/`，每条都经存在性核验，绝不编造 LOCODE）
| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `data/port-aka.json` | 620 条别名 + 20 条同名优先 | 词典括号名自动抽取(214) + 人工核对的市场名/旧名/缩写/拼错 |
| `data/major-ports.json` | 39 个主干港带吞吐量排名 | 维基百科整理 Lloyd's List Top 100 / WSC 2024 |
| `db/ports.db` 的 `msc_ports` | 580 港 | MSC 官方名录（本地缓存）|
| `db/ports.db` 的 `aliases` | 93 条 / 10 家船司 | 各家实测映射（`source='verified'`）|

**多源交叉**：主干港 = 至少 2 个独立来源命中（公开排名 / MSC / 各家船司别名）。
单看一家会把「这家不走但别家走」的港误判成小港（爹地 10-08 纠正）。

## 落地命令
```bash
node tools/build_port_aka.mjs     # 把别名/优先表/信号写进 db，并导出 src/port-aka.json
node qa/port-compat.mjs           # 引擎识别回归（130 例：主流港/旧名/缩写/拼错/同名/垃圾输入）
node qa/port-hint-verify.mjs      # 界面提示验收（真实 dist + Tauri 桩，逐字输入读提示栏）
```

## 实测修复记录（10-08）
| 输入 | 改前 | 改后 |
| --- | --- | --- |
| Portland | 澳大利亚 AUPTJ | **美国 USPDX** |
| Alexandria | 美国小镇 USAXR | **埃及 EGALY** |
| SHA | **沙迦 AE**（静默查错！）| **上海 CNSHG** |
| Genoa / Chittagong / Pusan / Port-of-Spain | 词典查不到（走原词兜底）| 全部命中 ITGOA / BDCGP / KRPUS / TTPOS |

## 未识别时的行为（保持不变）
词典与别名都没命中 → **原样交给各船司网站**由站内自动补全去认（实测 Chittagong→MSC 预填成功 / ONE 查到 12 条）；
界面明确提示「词典里没有」+ 建议用英文港名 —— 绝不静默换一个看起来像的港。

## 2026-10-09 补充（真机反馈驱动的三条硬规则）

### 1. 识别用的别名 ≠ 提交给站点的字符串
通用 aka（市场名 / 缩写 / 码样式串，如 `nbshan`）**只用于"认出用户输入是什么"**；
提交表单时一律用 **该站实测过的别名（source=verified）→ 否则词典港名 + LOCODE**。
反例：`nbshan` 被当港名填进 HMM 的表单 → `Search Results (0)`，用户只看到"无结果"。

### 2. 多词港名要试「去城市前缀的尾巴」
各家候选多为**前缀匹配**，且对方库里可能**没有城市名条目**：
长荣家打 `tianjin` **零候选**、打 `xingang` 才给 `XINGANG (CNTXG)`。
所以变体序列除全名外必须给出 `Tianjin Xingang Pt → Xingang Pt → Xingang`，
并把这类"更可能命中"的排在前面。（`portVariants()` 已实现）

### 3. 同一实体的等价码要应用到**每条取数路径**
填表候选 / 页内接口 / 回读校验三条路都要吃"同组港码"，只改一条 = 用户回"依旧有问题"。
实测 MSC 递 `CNTNJ`（Tianjin）→ 0 条；递 `CNTXG`（Tianjin Xingang Pt）→ **7 条**。
同理 ONE 12 条、Hapag 10 条都靠这条才出结果。

### 4. 官网的"明确否定"要如实转达
`No solution has been found`（达飞）/ `No schedules available`（马士基）/ 接口回 0 条（阳明）
都是**业务答案**，界面引用官网原话；不要和"我们没抓到"渲染成同一句"已填表·无结构化结果"。

### 5. 站点改版的第一症状是入口 404
长荣 2026-10-09 整站改版：旧 `TVS2_JspIndex.jsp` **404**、字段从 `txt_schedule_ori_name`
换成 `tvs2OriAC`、候选从 `li` 换成 `#tuf1ac_tat_table` 的行（且**必须真实鼠标点击**）。
排查顺序：证据里的 `httpStatus` → curl 现网页 → grep `input/select` 的 id → 读 `<form action>`。

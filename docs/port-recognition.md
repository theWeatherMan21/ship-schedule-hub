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

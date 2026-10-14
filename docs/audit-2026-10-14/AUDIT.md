# ShipScheduleHub 全面审阅报告

**日期**：2026-10-14 ｜ **范围**：全项目（Rust 壳 / 前端 / engine 核心 / recipes 11 家 / tracking 16 文件，约 12000 行核心代码）
**方法**：分层精读 + 运行时探针实测 + 行业对照（Exa）＋三路独立并行审阅交叉
**纪律**：本轮只读不改；每条问题带证据；两个 P0 由审阅人**亲手复现**确认

---

## ① 结论速览

| 级别 | 数量 | 一句话 |
|---|---|---|
| **P0** | **2** | 马士基深链卡片"运输天数"取成航次号；追踪层把"预计事件"标成"当前位置" |
| **P1** | **14** | 配方超时被静默钳到 60s、CLI 数值零校验可致死循环、反爬升级路径是死代码、ONE 箱主码查不到、大结果被 64KB 管道截断 等 |
| **P2** | **55+** | 集中在：候选盲点兜底、静默降级、注释与实现漂移、falsy 默认值吞值、资源回收、跨家口径不一致 |

**总体判断**：核心体系（缓存/降级/事件流/静默红线/识别算法）**扎实**；行业标准类实现（ISO 6346 校验位）**完全正确**；问题集中在**边界参数**、**静默失败路径**与**文档漂移**三类，无架构级风险，全部可增量修复。

---

## ①.5 修复进度（2026-10-14 晚 · 审阅当日落地）

**拍板**（ross）：① 并发无红线按需求来 ② COSU 先不碰 ③ 60s 足够 ④ 多箱在不影响现状前提下可提升。

**已修 15 项**（全部带测试回归，18 套测试全绿）：

| # | 项 | 级别 | 修复内容 |
|---|---|---|---|
| 1 | maersk transitDays 取错组 | **P0** | 改取天数段（25天22时→26，与 API 口径一致）+ 单测 7 组 |
| 2 | 追踪全 EXPECTED 误标当前位置 | **P0** | 无 ACTUAL 时 current=null + 断言 4 条 |
| 3 | maersk 卡片无小时整卡丢弃 | P1(B1) | 小时段改整体可选（顺手修） |
| 4 | 配方超时声明与 60s 上限矛盾 | P1(A1) | 6 配方声明统一 60000（声明=生效，历史留注释） |
| 5 | CLI 数值参数零校验 | P1(A2) | `--batch 0/-1/abc`、`--timeout 0/abc` 全部 fail fast + 测试 5 组 |
| 6 | ONE 箱主码查不到（NYKU 类） | P1(C1) | 判型放宽任何 4+7 → **真网验证 NYKU8753231 修复后 ok:true** |
| 7 | HAMG12062700 被 Hapag 抢 | P1(C2) | ②b 后移，订舱形态优先 → 正确路由 ONE |
| 8 | 大结果 64KB 管道截断 | P1(C3) | flushExit（800KB 实测完整） |
| 9 | 追踪无总时长上限 | P1(C4) | 外层硬截止（默认 timeoutMs×4，env 可覆盖） |
| 10 | one/msc eta 形状不一致 | P1(C5) | 统一为对象 + 归一层字符串兜底 |
| 11 | zim 候选索引错位 | P1(B2) | 存原始下标对齐 + 未命中不盲点 |
| 12 | pickOnce 盲点第一个候选 | P1(B3) | 未命中 return null（与 pickOption 口径对齐） |
| 13 | one pickPt 盲点 CY 候选 | P1(B6) | 去掉盲点，退回词典兜底 |
| 14 | OOCL direct 硬编码 true | P1(B4) | 改 null=未知 + UI 徽章三值（诚实降级） |
| 15 | 并发注释"红线≤3"失效 | — | 注释改为"按需求传（App 默认 12）" |

**列后续批次 2 项**：B5 三家（msc/hapag/yangming）DOM 结果页解析（架构级，需结果页解析器）；A3「运行时被拦自动升级」（机制已在，用法已注释，进一步自动化待评估）。

**待更新**：P2 清理（按"静默失败 / 注释漂移 / 资源回收"三主题分批）——尚未开工。

---

## ② 方法与可复现路径

- 基线：全部自带单测通过（identify 108/0、update-check 11/0、maersk-cutoffs 17/0、cma-track 23/0、portsolve 8/0、overlay 8/0、hmm/evergreen 全过、normalize 通过）
- 行业对照（Exa 检索）：
  - ISO 6346 箱号校验位（Wikipedia / prefixcheck.com / Wolfram Blog 三源交叉）
  - 船期数据字段（X12 323 / IFTSAI / Linescape bulk formats）
  - 提单格式（Vizion API / Tyllus SCAC 指南）
- 运行时探针实测：
  - 箱号校验位标准样例：`MSKU849250→9` ✓、`CSQU305438→3` ✓（与标准一致）
  - P0-1：模拟卡片文本跑生产正则，确认捕获组错位（复现见下）
  - P0-2：构造"全 EXPECTED"结果跑 `normalizeTracking`，确认 `isCurrent` 误标（复现见下）
  - 更新链路：`SSH_UPDATE_SELFTEST=full` 真实进程端到端（检查→镜像下载→安装→重启）四步全通
- 三路独立并行审阅（engine 核心 / recipes / tracking），分别产出问题清单后与本报告交叉合并

---

## ③ P0 问题（2 条，均已亲手复现）

### P0-1 · 马士基深链卡片「运输天数」取成航次号

- **位置**：`engine/recipes/maersk.mjs:44,56`
- **复现证据**（跑生产正则）：
  ```
  cm[5] = "639W"  ← 代码用的是这个（第5组=航次）
  cm[6] = "25"    ← 应该用这个（第6组=天数）
  代码实际取: transitDays = "639W"  ❌ 应为 25
  ```
- **影响**：深链兜底路径每行"运输天数"全错（显示航次号）；与 API 路径口径（小时折算天数）不一致。
- **修复方向**：改用 `cm[6]`，按 API 同口径 `Math.round((天*24+时)/24)`；补解析单测。

### P0-2 · 追踪层把「预计（未发生）事件」标成当前位置

- **位置**：`engine/tracking/normalize.mjs:109-111`（消费方 `src/main.js:1034-1037`）
- **复现证据**（构造全 EXPECTED 结果实跑）：
  ```
  current = { activity: "Container Delivery", timeType: "EXPECTED", isCurrent: true }
  → UI 主行显示「Container Delivery · 11-30 @ GDANSK」当作现状 ❌
  ```
  与同文件 16-18 行自述口径（"不能把 EXPECTED 当当前位置"）直接冲突。
- **影响**：新订舱/仅计划事件的票，UI 最显眼处把未来事件显示成现状。
- **修复方向**：无 ACTUAL 时 `current = null`（UI 已有 `ev.current || {}` 兜底，改动无副作用）；补"全 EXPECTED"单测。

---

## ④ P1 问题（14 条）

### A. engine 核心层

| # | 位置 | 问题 | 影响 |
|---|---|---|---|
| A1 | `query.mjs:480` | 配方 `timeoutMs` 被 `Math.min(...,60000)` 静默钳到 60s（6 个配方声明 80–230s 全失效；`\|\| perCarrier` 吞合法 0） | COSCO/Hapag/MSC/ONE/Maersk/HMM 每次 60s 被掐断 → prefilled/opened 降级 |
| A2 | `query.mjs:149,740` | 数值 CLI 参数零校验：`--batch 0/负` → 死循环；`--batch abc` → NaN → 需浏览器船司静默全丢（无错误事件） | 引擎挂死或静默漏查整批 |
| A3 | `query.mjs:703` | `needsRealFingerprint` 全项目无人声明 → "硬拦自动切有头"是死代码，实际只剩 `SSH_ALLOW_HEADED=1` 入口 | 被 CF/Akamai 拦的船司永不自动走有头真指纹 |

### B. recipes 层（11 家适配器）

| # | 位置 | 问题 | 影响 |
|---|---|---|---|
| B1 | `maersk.mjs:44` | 卡片正则把 Transit Time 小时段写成必填 + 强绑定版式（去掉小时整卡不匹配） | 官网省略小时/版式变 → 卡片静默丢弃 |
| B2 | `zim.mjs:50-53` | 候选点击索引错位（texts 过滤了 Searching 占位、点击用未过滤索引）+ 未命中盲点第一个 | 点到不一致元素 / 静默选错港口 |
| B3 | `lib/utils.mjs:307-312` | 共享 `pickOnce` 未命中兜底点 `texts[0]`（盲点第一个候选）；cosco/hapag/yangming 不回读（同文件 `pickOption` 已写"绝不盲点第一个"未同步） | 静默选错港口（与历史事故同型） |
| B4 | `oocl.mjs:160-168` | 结构化行硬编码 `direct: true`、via 恒空 | 中转航线被标"直达" |
| B5 | `msc.mjs / hapag.mjs / yangming.mjs` | 三家只预填+点 Search，不等结果、msg 一律"searched" | 永不产出结构化船期；失败与无结果无法区分 |
| B6 | `one.mjs:84-88` | `pickPt` 三级回退取第一个 CY 候选，不校验相关性 | 静默选中无关港口 |

### C. tracking 层

| # | 位置 | 问题 | 影响 |
|---|---|---|---|
| C1 | `one.mjs:57-63` + `identify.mjs:70` | 识别器把 NYKU/MOAU/KKFU 等 5 个箱主码归 ONE，但适配器只认 `ONE[UY]\d{7}` → 其余以 BKG_NO 提交（实测 `NYKU8753231` 查不到） | 合法 ONE 箱号必然失败且文案误导 |
| C2 | `identify.mjs:266-274` | ②b 箱主码分支在 ③ 订舱形态之前评估 → ONE 官方样例 `HAMG12062700` 被 Hapag 抢走 | 官方真单无法自动路由 |
| C3 | `cli.mjs:125-133` | `emit` 后立即 `process.exit(0)`，管道异步写被截断（实测 807KB 只到 64KB） | 多箱大票拿不到结果 |
| C4 | `cli.mjs:118-119` + 各家 | `timeoutMs` 只是单次超时非总预算（Hapag 最坏≈10-17 分钟、COSCO≈14 分钟） | 查询挂十几分钟只能手动停（evergreen 共享 deadline 是正确范式未推广） |
| C5 | `one.mjs:200 / msc.mjs:168` | `eta` 给字符串而归一层只认 `r.eta?.time`（对象）→ 站点 ETA 被静默丢弃 | MSC/ONE 显示 `ETA —` |

---

## ⑤ P2 问题（55 条，按主题归类）

**Rust 壳 / 前端（本审）**：`open_external` 白名单 `starts_with` 可被 `@evil.com` 类 URL 绕过；`stop_track/stop_query` 裸 `taskkill`（同文件其它处全路径，不一致）；`chrono_like_now` 死代码；selftest 默认日志写死 `/tmp`；「停止」按钮文案 `+=` 连点叠加（船期/追踪两处）；诊断面板部分字段未转义。

**engine 核心**：`apiEmptyHint` 只写不读（"短超时"承诺未实现）；单家无总时限（in-page API 最坏 810s/家）；portdb 别名码与名字跨行拼装（findPort('Shanghai') 返回词典没有的 CNSHA）；aliases 表 416 行列语义写反（输入"msc"随机命中危地马拉港口）；前缀兜底下标公式恒等于原词长（'Portofs' 误中 Port-of-Spain）；Dock 隐藏只匹配系统 Chrome（Edge/CfT 漏）；UA/指纹三处不一致；in-page API 整块 catch 无日志 + CA 兜底固定返回 200；ZIM 兜底会选 LAND 内陆点；ZIM noService 判定过宽；DataDome 清理写死 `carrier.id==='cma'`；缓存三坑（--no-cache 不跳写/文案硬编码/非原子写）；运行产物无回收（154 个 ndjson、80MB 临时 profile 残留）；退出丢缓冲 + 恒 exit 0；batch 注释红线 ≠ 实际传 12；`--window onscreen` 未实现；死代码（q Proxy/oneDeep/idx）；falsy 吞值残余；首次 Chrome 下载 150MB 无进度事件。

**recipes**：候选匹配子串过宽；no solution 检测顺序错；maersk 月份大小写敏感；箱型硬编码两路径不一致（45G1 vs 40/HDRY）；one DOM 回退按下标对船长；evergreen 日期失败静默空串；**9 家保留硬编码示范城市兜底（ningbo/istanbul）**；ZIM 成功判定扫全页宽泛词；consumer-key 硬编码；调试路径写死 `/tmp/dom-*.txt`；日期工具无防御；日期留空填今天但文案说 site default；transitDays 类型漂移；10 家空 catch；oocl 年份本地年/UTC 混用；oocl blocked 无入口级降级。

**tracking**：scac-loose 契约不一致（ok=true 但 0.55）；订舱规则先到先得不比总分；三家用 UTC 今天判 ACTUAL/EXPECTED；无时刻事件排时间线最前（仅 ONE 修）；MSC 页内 fetch 无超时；错误分类被压平丢弃；Hapag/YM 的 ETA 取最早（与其余 5 家相反）；ZIM ETA 无陈旧校验；箱号 size/type 三家三样（显示 `22G1'`）；COSU/EGLV/CMDU 识别表缺口（合法箱号不路由、非法反放行）；硬编码常量（ZIM 订阅键/COSCO CA 私有路径/MSC 魔法入口）；多箱详情静默截断；缓存键用原始输入；registry 判据脆弱；船司名三处各写；文档漂移（说 95 断言实际 108、覆盖表说 planned 实际 live）。

---

## ⑥ 健康项（确认"做得好"）

1. **ISO 6346 校验位算法完全正确**（标准样例双过 + 独立参照 0 差异 + 21 真箱号全通过）
2. **静默红线落实严格**：`browser.mjs:129-132` 强制降级 + 最小化失败即关闭，屏幕不留窗口
3. **反爬诊断有分寸**：fastpath 永不抛错、失败回退浏览器；缓存回放带"⚡ cached"诚实标注
4. **错误处理骨架完备**：全局 error/unhandledrejection 监听；引擎 stderr"信息行 vs 致命"判别
5. **路径规范化有事故沉淀**：Windows `\\?\` 前缀 + 裸盘符修复带单测
6. **两份好范式可推广**：evergreen 共享 deadline 超时；tracking 各家 errorKind 分级
7. **README 承诺逐条核对通过**（20min 缓存、headless 默认、独立降级、缓存标注）
8. **更新链路端到端实测通过**（检查→镜像下载→安装→重启四步）

---

## ⑦ 测试盲区

| 盲区 | 说明 |
|---|---|
| 大 payload | >64KB 事件流截断（C3）无用例 |
| 全 EXPECTED 场景 | P0-2 无用例 |
| 箱主码 ∩ 适配器一致性 | NYKU 类（C1）无一致性测试 |
| 官方样例回归 | ONE `HAMG12062700`（C2）未进矩阵 |
| 跨适配器 eta 形状 | 字符串/对象两形态无断言 |
| 非法 CLI 参数 | batch=0/NaN、timeout 非法值无测试 |
| Windows 实机 | 全在 macOS 验证；Windows 侧依赖 CI 编译 |
| 更新下载中断 | 中途断网行为未测 |
| 识别模糊边界 | scac-loose 低置信路径误报率无系统样本 |
| 极端取消竞态 | 8 秒内多次切换未压测 |

---

## ⑧ 修复批次建议

- **批次一（P0，各约 10 分钟）**：P0-1 改 `cm[6]` + 单测；P0-2 `current=null` + 单测
- **批次二（P1 核心）**：timeout 上限放开（A1）、CLI 数值校验（A2）、ONE 箱主码判型（C1）、cli exit 前 flush（C3）
- **批次三（P1 其余 + 甄选 P2）**：候选兜底清理（B2/B3/B6）、三家结果回读（B5）、timeout 总预算（C4）、eta 形状统一（C5）
- **批次四（P2 清扫）**：按"静默失败 / 注释漂移 / 资源回收"三主题成批处理

## ⑨ 待拍板口径（需要 ross 定的）

1. **batch 并发策略**：注释写"红线 ≤3"，App 实际固定传 12 —— 以哪个为产品口径？
2. **COSU 是否为有效箱主码**：Terminal49 与 BIC 名册口径冲突（影响识别表补全）
3. **渲染超时 60s 上限**：放开后被最慢一家拉长总时长，可接受吗？
4. **多箱详情抓取上限**（Hapag 1 箱 / YM 4 柜）是否提升？

---

*审阅：婉宜 + 三路独立并行审阅（engine 核心 / recipes / tracking）· 2026-10-14 · 只读不改，修复另行批次*

# ShipScheduleHub 驾驶舱（PROJECT.md）

> 唯一真相源。中断后靠这份 + 芝麻仓重建上下文。更新频率：每轮收工 3 行。
> 主管：婉宜 · 执行：婉宜主线 · 最近更新：**2026-10-12**
> 路径：`/Users/russospencer/Documents/trae_projects/ShipScheduleHub`
> 部署位置：**`/Applications/ShipScheduleHub.app`**（已上线自用）
> 仓库：**https://github.com/theWeatherMan21/ship-schedule-hub**（私有，2026-09-30 首推，402 文件）

## 〇、当前状态（2026-10-09 晚 · 婉宜）

### 发布卡 t_9ae00f7c（2026-10-10）

进行中：v1.3.0 发布。关键路径：安装包重建与部署冒烟 → commit/tag/push → CI 三资产核验 → 爹地亲手验收。当前时间盒 60 分钟；不使用 Windows 真机、不弹自动化窗口。

### CMA 追踪卡 t_55c20bdb（本轮）

受阻：官网追踪入口 curl 和无头 Chrome 均 HTTP 403，明确 captcha-delivery 挑战 iframe，表单不存在；项目档案副本同样受阻（原档案复制时在用，不能据此判断原档案必失败）。静默 0→0。未新增适配器、未标 live、未部署；继续需可访问的官网结果/真实号或受限解除。证据见任务 t_55c20bdb 附件 CMA-FINDINGS.md。

### OOCL 追踪卡 t_34917d7e（本轮）

受阻：官方 Cargo Tracking → ExpressLink → 新版 Control Tower，连续两轮无头显示 `Please slide to verify`；尚未取得真实清单/事件响应。需要 OOCL 真实提单/箱号与人工验证通路。未建未经验证的适配器、未标 live、未部署；静默探针窗口 0→0。证据：`/Users/russospencer/.hermes/kanban/workspaces/t_34917d7e/OOCL-FINDINGS.md`。

### 本轮 WIP（≤2）

**①【关键路径 · 进行中】填表 approach + 港口/船司特定名称匹配 全量复核**
- 爹地 10-09 判断（原话）：「我不认为换写法有问题，我认为你在船司页面填表的 approach 有问题」「名录和船司特定名称匹配还是有问题」「这个你重点检查」
- **DoD（不达不叫完成）**：三条航线（**天津→伊斯坦布尔 / 宁波→阿什杜德 / 上海→鹿特丹**）各跑一次全量 11 家，逐家留档四件事：
  ①我们输入什么 ②站点给的候选里**最匹配的那条**是什么 ③**我们实际选中了哪条** ④站点返回什么。
  凡出现「选中的不是最匹配条目」或「站点有结果而我们没拿到」= 未达 DoD。
- **静默要求**：全程无头 + 屏幕可见窗口数监控留证（爹地红线）。
- 证据落：`evidence/` 新档 + 本文件下方「本轮证据」。

**②【已交付待验收】按爹地 10-09 四条决定改完**
- 换写法重查：**保留**（爹地认可）✓ ｜ 超时：**统一回 60 秒** ✓ ｜ 限流冷却：**关闭**（不再跳船司）✓ ｜ 别名匹配：重点查（见 ①）⏳

### 维度现状

| 维度 | 现状 |
|---|---|
| **北极星** | **已达成** —— 填一次「起运港+目的港+日期」→ 11 家船司并发查 → 结果**直接显示在 App 内** |
| 覆盖 | **11 家**：YangMing / MSC / Maersk / ONE / COSCO / Hapag / ZIM / CMA / Evergreen / OOCL / HMM |
| 版本 | 部署态 `/Applications/ShipScheduleHub.app` = **1.1.1**（含 10-09 全部修复）；最近提交 `a255a30` |
| 站侧事实（非我方 bug） | 达飞官网在线查询**不覆盖以色列**（爹地亲自确认）；马士基/阳明部分航线官网确实无服务 |
| 打扰 | **零窗口**（无头 + 探针包装器 `qa/quiet-probe.sh` 跑完比对屏幕窗口数）；测试一律独立 profile，绝不抢爹地 App 的 profile |

## 2026-10-10 · 提单/箱号追踪聚合接入验收

**状态：已交付待爹地验收**。提单/箱号页签已落到 `/Applications/ShipScheduleHub.app`（当前包版本仍为 `v1.2.4`，本轮未升版本号）；统一入口按 SCAC/箱主码/9 位 Maersk 形态识别，未知号要求手选船司。当前可用追踪器：Maersk、MSC、COSCO、HMM、ONE；Hapag 仍因交互式挑战未完成真实验收。

- **源码离线 UI 回放**：`bash qa/quiet-probe.sh qa/ui-track-verify.mjs ~/.hermes/cache/scratch/track-ui-verify` 全部通过；Maersk/MSC/ONE 保存的官方结果快照、未知号前端拦截、摘要/ETA、折叠/展开、事件桥接、布局与 JS 错误断言通过；可见窗口 `0 → 0`。
- **安装包内引擎真单**：`node /Applications/ShipScheduleHub.app/Contents/Resources/engine/tracking/cli.mjs --number 276759780` → `track-result ok:true`，`4.630s`，7 事件；`In Transit`，当前 `Container Departure`（ACTUAL），ETA `2026-11-26`。
- **安装包真实 UI**：LaunchServices `open -a /Applications/ShipScheduleHub.app` + `SSH_TRACK_SELFTEST=276759780` 一次性自检；实机截图 `~/.hermes/cache/scratch/shiphub-tracking-selftest.png` 显示追踪页签、Maersk 摘要、路线、当前 ACTUAL、ETA、默认折叠；AX 展开复核显示 `Hide ▴`、4 条实际事件 + 3 条 `· est` 预计事件，无截断/重叠。
- **代码/构建回归**：`npm run build`、`cargo check`、`node qa/track-normalize-test.mjs`、`node qa/track-identify-test.mjs`、JS `--check` 全通过；源码与 `/Applications` bundle 的 `engine/tracking/cli.mjs`、`normalize.mjs` 字节一致。
- **边界**：本轮没有发布 v1.3.0；没有打 Windows 包/测 Windows；Hapag、ZIM、CMA、Evergreen、Yang Ming、OOCL 尚未进入追踪页可用下拉（避免伪成功）。

### UI 卡 t_bb4f4e3c 本轮收口（2026-10-10）
- 实施阶段已验证，交给下游发布卡 `t_9ae00f7c`；最终安装版验收由发布卡完成。
- 本轮真实执行：`npm run build`、识别器 95 通过/0 失败、归一化回归、JS 语法检查、三家官方缓存 UI 回放全部通过；静默窗口 `0 → 0`，无 JS 报错、布局截断/重叠。
- 新截图与验证报告通过任务附件留档：`UI-VERIFICATION.md`、`track-summary.png`、`track-timeline.png`、`track-one-timeline.png`。安装包 CLI 本轮复查 `276759780` 返回 7 事件，明确为 6 分钟缓存命中。
- 发布注意：旧实机截图侧栏仍写仅 Maersk；新源码侧栏已列五家可用船司，发布时须重建最新源码。Hapag 模块存在不等于通过真单验收。

## 2026-10-12 · v1.3.0 本地发布完成（待 GitHub push）

**状态：已部署到 `/Applications/ShipScheduleHub.app`（v1.3.0），待爹地实机验收；GitHub 推送+CI 待确认。**

- 背景：10-10 傍晚 ChatGPT（gpt-6.1-sol）协助已将版本升至 1.3.0（pkg/tauri/cargo 三处）+ 冻结发布快照 + 构建出 bundle，随后因 modelrelay 余额不足（403）中断在"部署前"。
- 本轮（婉宜主线）接续：核对快照与主仓库关键文件字节一致 → 从主仓库生产源码重新构建（vite + tauri build 全绿）→ 部署 /Applications（旧版留档 `ShipScheduleHub.app.tmp-old`）→ 实机启动自检真单 `276759780` 通过。
- 实机证据：`~/.hermes/cache/scratch/shiphub-v130-selftest.png`（追踪页签选中、Maersk 摘要卡、XINGANG→GDANSK、Container Departure ACTUAL、ETA 11-26、In Transit、7 events、无错误条）。
- 本地提交：`feat(v1.3.0)` commit + tag `v1.3.0`（本地）；探针脚本不纳入提交。
- 待办：①爹地验收；②push + tag → CI 三件套（dmg×2 + exe）；③验收通过后清理 `.tmp-old` 回滚档。

### 2026-10-12 · 自动识别修复（爹地实机验收反馈）

- **现象**：非 Maersk 的提单号（4字母+7数字，11 位常见 MBL 形态）无法自动识别船司。
- **根因**：11 位形态被 ISO 6346 箱号校验拦杀——提单号没有校验位，被误伤拒绝路由（除 Maersk 9 位数字形态外普遍中招）。
- **修复**：`identify.mjs`——「11 位 + 提单前缀(SCAC) 且校验位不符」改为低置信放行（`scac-loose`，0.55）；纯箱主码（非提单前缀）维持原拦截（防打错箱号）。UI hint 增加「前缀命中，校验位不符」提示；`detect.mjs` 透出 `flags`。
- **回归**：identify 99/0（新增 4 条断言）；12 家形态表全绿；对照 MSKU3077039 仍拒。

## 2026-10-12 · Hapag 追踪接入（无头化收口）· 追踪 7/11

**状态：已部署 `/Applications`（11:34 构建）并实机验收通过；追踪线 6/11 → 7/11。**

- **通路**：legacy 深链 `track-by-booking-solution-legacy.html?blno=<号>` GET 免提交直出结果；列表 → Details（JSF）→ 容器详情 + 事件表（站方口径：粗体=ACTUAL、非粗体=EXPECTED）。
- **无头化（爹地指名：有头测试 OK 后转回无头）**：根因＝`cf_clearance` 绑定 UA——无头曾写死 UA Chrome/140 ≠ 真机 Chrome 152，带凭证仍被挑战；修复＝`browser.mjs` 新增 `realChromeUA()` 动态对齐真机 Chrome 版本。架构＝**auto 双模**：无头先行（8~10s），被拦自动升级有头真指纹过盾并刷新凭证（自适应）。三连无头 8.2 / 9.1 / 10.2s 全通。
- **真单验收**：`HLCUTS12608CSOQ6` → UWLU4114042 · 45GP · NINGBO→ISTANBUL（9 事件 8-23→10-05 全程，10-05 ISTANBUL 卸船）。App 内 selftest 无头真跑 → UI「1 container(s) · 9 events」、NINGBO → ISTANBUL、Discharged · MAERSK SIRAC 638N。
- **回归**：identify 108/0、UI 回放全绿、船期线 App 自检跑通（browser.mjs 的 UA 修正是全项目级，船期无头家一并受益）。
- 识别元数据 `hapag tracking:'live'`；UI 说明栏「已接通：… / Hapag-Lloyd」；文档 `docs/TRACKING-HAPAG.md`。

## 2026-10-12 · 阳明 / 长荣接入 · 追踪 9/11

**状态：已部署 `/Applications`（14:10 构建）并实机验收通过；追踪线 7/11 → 9/11。**

- **阳明（`yangming.mjs`，站内 API）**：`/api/CargoTracking/GetTracking?paramTrackNo=&paramTrackPosition=&paramRefNo=`——`SEARCH` 直查 + `BL_CT` 提单下钻柜事件（参数矩阵实测）。真单：`YMLU3560471` 柜 20 事件（SURABAYA→KEELUNG，Completed）；`N237068499` 提单 SHANGHAI→ROTTERDAM（下钻 8 事件）。
- **长荣（`evergreen.mjs`，纯 HTTP 无浏览器）**：ShipmentLink `TDB1_CargoTracking.do` POST（summary + 逐柜 moves 两段式）。真单：`EGLV142552582916` 10 事件（SHANGHAI→PORT AU PRINCE，Completed）。网络抖动自动重试一次。
- **工人复核合并**：阳明卡由独立 worker 复核出 5 个缺口（多柜遍历 / booking 误报 / 空返 Completed 映射 / 下钻 ETA / 未知分类），**全部修复并补测试**；长荣卡由 worker 实施 + 主线复核（fixture 转正入库、App selftest 补齐）。
- **回归**：identify 108/0、yangming 单测 36/0、evergreen 官方 fixture 断言、zim 23/0、normalize 回归（含 YM 空返用例）、静默 0→0。
- App 实机 selftest：YM `1 container(s) · 20 events`（路线短名化）、EGLV `1 container(s) · 10 events`，均 Completed。
- 文档：`docs/TRACKING-YANGMING.md`、`docs/TRACKING-EVERGREEN.md`。
- **仍待**：OOCL（官方入口跳 Control Tower，人机滑块验证，需真单+人工过验证）、CMA（官网 403 + DataDome，A 路线保留 planned）——两家等真单/站点限制解除。

## 2026-10-12 傍晚 · CMA 接入（代码完成）+ 弹窗根治

- **CMA 适配器完成**（`cma.mjs`）：入口 GA `eBusiness/Tracking`（`#Reference` + `#btnTracking`）→ POST `/ebusiness/tracking/search` → 结果区解析；**冷却重试**（25s×2）+ not-found/blocked 如实区分；纯解析单测 **23/0**；CLI 已识别（**10/11 家可用**）。
- **真单验收**：`NGP3170431`（爹地提供）**首次实测通过**（2 柜 CMAU0822049/CMAU3124587 · 伊斯坦布尔 Ambarli · 2026-03-05）；随后进入 **DataDome 限流**（探路访问过密；换 IP/干净档案均受制）——按站方机制，**待冷却后复核一次**即可收口。identify 暂保持 `tracking:'none'`（不宣称可用，直到真网复核过）。
- **"每次打开弹通知"根治**：根因 = macOS「应用管理」（`kTCCServiceSystemPolicyAppBundles`）未授权——每次替换 /Applications 里的 app 触发一次拦截通知。排查：实测启动对 /Applications **零改动** → 查系统日志定位 TCC → **爹地手动授权**（日志确认 `full`，通知清除）。加固：构建卫生（旧证据目录移出 bundle）+ **部署后 ad-hoc 重签**（Sealed Resources 封条）。
- 提交：`e2808c8`（CMA）、`2f3a68e`（构建卫生+部署须知）、`4883328`（自检 input 事件 + 停止逻辑）。

## 2026-10-12 · CMA CGM 达飞 · 真网复核通过 → 升级 live（t_55c20bdb）

- **背景**：白天探路访问过密 → CMA 官网 DataDome 对出口限流（追踪表单页不出现）；14:47 最后一次成功。
- **19:29 冷却复核**：`node engine/tracking/cli.mjs --number NGP3170431 --carrier cma` → **ok:true, cached:false, 11.6s**
  - 2 柜：**CMAU0822049 / CMAU3124587**（22G1 (20ST)），`GATE IN EMPTY AT DEPOT` @ ISTANBUL, AMBARLI PORT E. SIDE，2026-03-05 14:41 / 14:35（与 14:47 首测一致）
  - 静默红线：窗口 0 → 0 ✓
- **收口**：`identify.mjs` cma `tracking: 'none' → 'live'`；UI 说明栏「已接通」追加 ` / CMA CGM`；单号识别器 **108/0**（prefixes.json 已 sync）；CMA 单测 23/0；重新构建 + `ditto` 部署 /Applications + ad-hoc 重签（部署态实测：bundle 内 `identify.mjs` 已是 `live`、`cma.mjs` 在包内）；commit `6902abb`。
- **待办（唯一）**：**App 原生自检截图**未完成——跑自检时本机屏幕处于锁定态（`CGSSessionScreenIsLocked=1`），`screencapture` 报 `could not create image from display`，且锁屏下 WKWebView 的 `setTimeout` 被挂起，自检点击根本不发生（trace 无新增 `run_track`，缓存未被 App 触碰）。**结论：App 侧视觉验收必须等屏幕解锁后再跑**；已备一键脚本 `qa/cma-app-selftest.sh`（内含锁屏前置检查，锁屏即 exit 4 不瞎跑）。

## 2026-10-13 · 马士基船期补齐截关/截单时间 ⭐

- **爹地提问**：「MSK的船期搜索为什么没有截关截单时间这些信息，官网上都有」
- **根因**：走的是 `routings-queries` 接口，**54 个字段实测不含任何截单**；官网数据在**另一个端点**（代码里当时留了注释「未取」就一直没做）。
- **破解**：`POST api.maersk.com/deadlines/queries`（同一把公开 consumer-key，**无需登录**）。
  - 请求三元组 = routings 装运段 `facility.alternativeCodes[GEO_ID]` + `vesselMaerskCode` + `departureVoyageNumber`（**实测该 GEO_ID 即接口所需 facilityId**，无需码↔ID 转换）。
  - 响应含 ECPL/SGIN/SI/VGM/DGD/FMDGFD/ANID 等。
- **展示口径对齐官网**（从站点 `main-*.js` 硬编码 + i18n 挖出）：固定 5 行 —— Empty container pickup / Container gate-in（**截关**）/ Shipping Instructions（**截单**，取 min(SINONAMS,SIAMS)）/ Verified Gross Mass / Dangerous Goods Declaration；**官网不展示的 FMDGFD、ANID 一律不展示**（要的是「官网上有的」）。
- **双路径接入**：API 路径（`maerskInPage` + recipes API）+ 深链卡片文本路径（`maerskCutoffsFromText`）。
- **验证**：单测 `qa/maersk-cutoffs-test.mjs` **17/0**；实测与官网**逐行一致**（Ningbo→Ambarli：gate-in 10-19 03:00 / SI 10-18 04:00 / VGM 10-18 17:00 / 提空箱 10-18 11:00 / DG N/A）；App 实机展开可见「Cut-off times (site values)」。
- commit `11dd4c6`；口径映射部分由 kanban worker t_c189cf96 从站点 JS 挖出（本次为并行重复施工，主线已统一为一套实现）。

## 2026-10-12 · v1.4.0 发布 🚀

- **GitHub Release**：https://github.com/theWeatherMan21/ship-schedule-hub/releases/tag/v1.4.0（15:54）
- **三资产**：`ShipScheduleHub_1.4.0_aarch64.dmg`（42MB）· `_x64.dmg`（43MB）· `_x64-setup.exe`（27MB）；**CI run 38218998197 success**
- **本版内容**：提单追踪 6→10 家（ZIM/Hapag/阳明/长荣/达飞[代码就位]）+ Hapag 无头化（realChromeUA + auto 双模）+ 自动识别补课 + 自检 input 事件 + 构建卫生（证据目录移出 bundle）
- **流程教训（重要）**：`src-tauri/src/lib.rs` 的改动**必须检查 Windows 分支编译影响**——macOS 条件编译会掩盖 Windows-only 代码引用的变量（本轮 `_app` 形参即此坑，首次 CI 失败）；本机 `cargo check`(macOS) 不能替代。
- **部署要点**：`ditto` 新构建 → `/Applications` + `xattr -dr com.apple.quarantine` + **`codesign --force --deep --sign -`（ad-hoc 重签）**；部署动作本身会触发 macOS「应用管理」提示（需给终端授权一次，非 App 问题）。

## 2026-10-12 · Evergreen t_96b18a61

进行中：适配器/UI 已部署到 /Applications。真提单 EGLV142552582916 → 上海→太子港，FCIU7515190，10 ACTUAL 事件，Completed；箱号独立查询通过（更新一票 6 事件）。纯 HTTP 零浏览器；identify 108/0、normalize、官方 HTML 断言、既有 UI 回放与 Evergreen selftest 回放全绿，窗口 0→0。证据：`~/.hermes/kanban/workspaces/t_96b18a61/VERIFICATION.md` 与 evergreen-timeline.png。剩余：原生 App selftest 截图尚未跑（显示 App 与零窗口约束冲突），交 review 明确验收方式；回放截图不冒充原生截图。

## 一、北极星（一句话）
> 做完的那天，**爹地能填一次「起运港 + 目的港 + 日期」，一键查到 Top10 船司的船期，
> 结果直接显示出来看得见** —— 不用再手工逐个开网页、重复输入。

**边界**：不做归一化对比表、不走官方 API 授权（复制各家网页自己发的 XHR）、不嵌 iframe。
**9-24 爹地追加硬指标**：结果至少 10 条及以上；全部船司同时开始（并发）。

## 二、里程碑表

| # | 里程碑（可演示的结果） | DoD | 时间盒 | 状态 |
|---|---|---|---|---|
| M1 | 引擎跑通：命令行能并发打开船司页并预填 | 真跑过 + NDJSON 事件 + 截图 | 1 天 | **已交付待验收**（9-10 实测：Maersk 预填成功、MSC 兜底开页、窗口真静默） |
| M2 | **Tauri 桌面 App 能打开** | 爹地能亲手双击打开看到窗口 | 1 天 | **已交付待验收**（9-21：壳已建、`cargo check` 通过、.app + .dmg 构建成功；婉宜复核属实） |
| M3 | App 里点「并发查询」真能跑：UI ↔ 引擎接通 | 在 App 内点一次，逐家状态实时回显 | 1 天 | **已交付待验收**（Rust 真 spawn 引擎 + `engine://event` 转发，事件名与前端一致；婉宜复核属实） |
| M4 | Top10 配方铺满并实测，状态如实标注 | ≥5 家 `prefilled`，其余如实标兜底/失败 | 2 天 | 未开始（10 家配方已写，仅 2 家实测） |
| M5 | 交付到 `/Applications`，爹地验收 | 视觉验收截图 + 一句话使用说明 | — | 未开始 ← **发现硬缺陷，见风险日志 9-21** |

> 状态只用四态，禁百分比。

## 三、当前 WIP（≤2）

| # | 在制事项 | 下一步动作 | 负责人 | 时间盒截止 | 距可验收还差 |
|---|---|---|---|---|---|
| 1 | **🚀 部署态 10/10 验收通过（2026-09-23）**：把引擎同步进 `/Applications/ShipScheduleHub.app/Contents/Resources/` （含此前**缺失的 `db/ports.db` 词典库**）后，用**部署态引擎真跑** `cd "/Applications/ShipScheduleHub.app/Contents/Resources/engine" && node query.mjs --origin Ningbo --destination Istanbul` → **prefilled 10 / opened 0 / failed 0**，窗口 `AXMinimized=true`（零打扰）。部署态专属修复：**①msc 加 `timeoutMs:130000`**（默认 60s 在部署态 profile 下会超时）；**②hapag 需完整站点 cookie 履历**——部署态 profile 缺 `OptanonAlertBoxClosed`/`FPID`/`_ga` 等导致候选 20s 不出，同步源码态 profile（376M，旧 profile 备份为 `browser-profile.bak-20260923`）后翻绿。**教训：同一份代码在不同 profile 下结果可能不同（站点 cookie 履历影响 SPA 行为），部署态必须真跑。**

**🎉 10/10 全通（2026-09-23）**：`node engine/query.mjs --origin Ningbo --destination Istanbul` → **prefilled 10 / opened 0 / failed 0**（msc/maersk/zim/cma/cosco/hapag/one/evergreen/yangming/hmm）。两项关键突破（均来自爹地指点）：**①日期改可选**（默认不填=用网站默认当天，少一个脆弱交互，重跑 8/10 不掉）；**②有头 + CDP 最小化 + 单页复用**——CF/Akamai 只看指纹不看窗口可见性，故有头真指纹自动过盾，而 CDP `windowState=minimized` 让窗口全程不可见（`AXMinimized=true` 硬证据）。由此 hapag（Managed Challenge，无头永远被拦）与 zim（旧配方**无条件 throw** 导致表单全通也显示 opened，已改成真被拦才降级）双双翻绿。引擎新增 `launchHeadedQuiet()`：有头+立即最小化，**最小化失败自动降级无头**（屏幕绝不留下窗口）。「M4+词典驱动」原记录：：并发端到端 **prefilled 8/10**（run-2026-09-22 最新）：msc/maersk/cma/cosco/one/evergreen/yangming/hmm 全绿（cma Transit 45 Days、cosco Shortest Transit 27 天）；剩 opened 2 = **zim**（Akamai 深链）/ **hapag**（CF）= 硬边界降级档「只开页」。本轮婉宜修的四处：①isBlockPage SPA 空 body 二次采样 ②批内累加错峰+默认串行 ③抖动重试 ④**COSCO 词典 alias 前缀修正**（"ningbo china"→"ningbo"，autocomplete 前缀匹配）+ typeAndPickCandidate 候选池 pick 不中时继续轮询（同容器先渲染 BOTH/CY/DOOR 服务模式项 30 个）。0 崩溃 | **9-23 追加**：①日期改可选（默认不填=用网站默认当天，传 --date 才填）→ 重跑仍 **8/10**，CMA 因默认日期不同出 Transit 52 Days（数据真实）；②**Hapag CF 实测定案**：Managed Challenge **无头永远被拦**（无可点验证界面）、**有头真窗口 10-15s 自动放行**、有头 cookie（仅 __cf_bm）**救不了无头** → hapag 只能走有头或维持降级档，等爹地定 A/B。剩 zim/hapag 硬边界，可按需做「手动接管」体验优化 | 婉宜 | — | 8✅ 2硬边界 |
| 2 | **港口词典 db/ports.db**（爹地定的架构）：UN/LOCODE 全量 17,521 港入库 + aliases 船司实测映射 66 条 + engine/portdb.mjs 查询层 | 已验证：Ningbo/Istanbul/Ambarli/Gebze/Izmit/Haydarpasa 全命中；词典驱动 Evergreen 实测通过 | 婉宜 | — | ✅ 底座完成，配方可调用 portdb 消歧 |
| 2 | **补 App 内界面截图**（DoD-2/4） | 爹地屏幕解锁后跑 `npm run tauri:dev` 截图 | 婉宜 | — | 等爹地解锁屏幕 |

## 四、关键路径（当前里程碑 → 验收）
```
[M1 引擎 ✅] → [M2 壳 ✅] → [M3 接线 ✅] → [★ 自主查询闭环 ✅ 9-21 已证] → [M4 配方铺满] → [M5 部署+验收]
现在卡在：M4 —— Maersk 全自主跑通（见 FINDINGS-2026-09-21.md），把 v6 逻辑写回配方 + 铺其余 9 家
```

## 四·五、船司链路台账（跑通一家记一家，当轮更新；细节挂 FINDINGS 与 evidence）

| 船司 | 状态 | 跑通链路（入口→填法→结果） | 关键配方要点 | 证据 | 更新 |
|---|---|---|---|---|---|
| Maersk | ✅ 自主闭环×2 | ① Shanghai→Rotterdam: 5 条船期(33-47 天) ② **Ningbo→Istanbul 系**: Istanbul 本身无直航,须选 `Ambarli Port Istanbul (CY)` → 6 条船期(26-50 天) | ariaSnapshot 读候选；CY 按徽标选；**同港异名: Istanbul→Ambarli Port**；country 消歧 | engine/evidence/autonomous-maersk-*、qa/autonomous-maersk-ambarli.mjs、docs/PORT-ALIASES.md | 9-21 |
| MSC | 🧪 入口 A/B 通过 | search-a-schedule 入口 200（headless=new+伪装 UA，新 profile 3 连 200）；全链(候选/搜索)验证中 | Playwright 默认 headless:true=旧模式仍 403；`--headless=new`+`ignoreDefaultArgs:['--enable-automation']`+真 UA → 新 profile 也过 | /tmp/headless-{ab,pro,fresh}.mjs 输出 | 9-21 |
| ZIM | ✅ 词典版回归（半闭环定案，v6b 铁证） | 主页 200 → Schedules tab → Origin `ningbo`(词典)→点 "Ningbo (ZJ), China. People's Republic"(CNNGB;10) → Destination `istanbul`(词典)→点 "Besiktas (ISTANBUL)., Turkiye"(TRBTS;10) → Search 已点；结果深链 `point-to-point?portcode=CNNGB;10&portdestinationcode=TRBTS;10` 服务器直接返回 **Akamai "Challenge Validation" HTML（v6b XHR 铁证）** | 深链拦截是服务器级、与浏览器无关；表单链路全通即降级档上限 | evidence/m4-zim.{txt,png,-xhr.json}（06:38 版，XHR 内含 Challenge Validation HTML 全文） | 9-22 |
| CMA CGM | ✅ 词典版闭环（v6b 修复后） | ebusiness/schedules 200；Kendo 行点击法：输入 `ningbo`/`istanbul`（词典）→ 点 `li.place-suggestion` CNNGB/TRAVC Port 行 → input 回读 `NINGBO ; CN ; CNNGB` / `ISTANBUL, AMBARLI PORT E. SIDE ; TR ; TRAVC` → Search → 结果页 **Transit 45 Days** | v6b 两处 bug 修复：①回读须读 #AutoCompletePOL/POD（getByRole('combobox').inputValue() 恒空、隐藏域 ArrivalPlaceCode 残留旧值）②dest group combobox 定位 .catch?.() 永假；IP 频率限制实存（连跑需隔 2min+） | evidence/run-2026-09-22T06-49-08-703Z.ndjson（prefilled, Transit 45 Days）、qa/cma-v6b-diag{2,3,4}.mjs | 9-22 |
| Hapag-Lloyd | 🔴 降级档定案：只开页 | 无头实测仍 Cloudflare 403（title="Just a moment..."，waitChallenge 12s 不放行）→ **判定从 ❌ 改为「降级档：只开页」**，CF 交互式挑战无法自动通过 | 与 9-10 结论一致，复测确认非环境抖动 | qa/zim-cma-hapag-check.mjs 输出（01:58） | 9-22 |
| COSCO | ✅ 词典驱动回归 | searchByCity 入口 200；输入 `ningbo china`(词典)/`istanbul`(词典) → 结果页 "Ningbo,Ningbo,Zhejiang,China Istanbul: :Istanbul:Turkey"，**Shortest Transit Time: 26 Days** | aliases: ningbo china→CNNGB；位置 modal Confirm | evidence/m4-cosco.{txt,png,-xhr.json}（03:26 版） | 9-22 |
| ONE | ✅ 词典驱动回归 | point-to-point-schedule 200；输入 `ningbo zhejiang china cy`/`istanbul turkey cy`（均词典）→ 表单回显 "NINGBO, ZHEJIANG, CHINA (CY) to ISTANBUL, TURKEY (CY)"，**Total 1 results** | ONE 输入框直接吃词典文本无需点候选；9-21 版本曾出 YM WELCOME 051W 55 天 | evidence/m4-one.{txt,png,-xhr.json}（03:29 版） | 9-22 |
| Evergreen | ✅ 词典驱动回归 | shipmentlink 200；输入 `ningbo china cnngb`/`istanbul trist`（均词典）→ 结果 "from NINGBO, CHINA (CNNGB) [ZIP:315000] to ISTANBUL (TRIST) [ZIP:34315]"，**BEX 28/33 天、MD2 38/39 天真船期** | aliases 全命中；表单无候选下拉也直出（搜索按钮触发） | evidence/m4-evergreen.{txt,png,-xhr.json}（03:27 版） | 9-22 |
| Yang Ming | ✅ 词典驱动回归 | P2P 入口 200；react-select 表单：**打主词首段**（`ningbo`，词典全串 `ningbo zj cnngb` 匹配不到），候选点 `NINGBO, ZJ (CNNGB)` + `ISTANBUL (TRIST)` → 结果表含 Voyage Code（9-21 版 1 条 63 天） | YM 特例：origin 选完 to 才 enable；input 定位用 `xpath=//label[contains(.,"Location From")]//following::input[1]` | evidence/m4-yangming.{txt,png,-xhr.json}（03:42 版） | 9-22 |
| HMM | ✅ 词典驱动回归（EMPTY=真实答案） | hmm21 200；输入 `ningbo`/`istanbul`（词典）→ 候选点中 `NINGBO, CHINA` + `ISTANBUL(HAYDARPASA TMNL), TURKIYE [TRHAY]`，**Search Results (0) = 宁波→Haydarpaşa 无直航（真实答案，非误判）** | HMM 候选列表混入导航 menu，靠文本匹配港口行；run8 曾误判 OK 已定案 | evidence/m4-hmm.{txt,png,-xhr.json}（03:30 版） | 9-22 |

## 五、DoD 清单（本项目特化，全绿才算完成）
- [x] 真跑过一次，证据：`evidence/run-msc-maersk.log`、`evidence/run-2026-09-10T07-51-24-661Z.ndjson`
- [ ] 端到端可用（爹地能亲手双击打开 App 用一次）← **未达：无 Tauri 壳**
- [ ] 已部署到：`/Applications/ShipScheduleHub.app`
- [ ] 视觉/功能验收截图（App 界面本身）
- [ ] 回归：非 Tauri 浏览器环境下 UI 降级提示正常
- [ ] 一句话使用说明 + 已知边界

## 六、芝麻仓（不丢，只是不做）
| 日期 | 想法/杂事 | 为什么记它 | 处置 |
|---|---|---|---|
| 2026-09-21 | MSC 配方补 Search 按钮选择器 | M1 实测卡在「找不到可见的 Search 按钮」 | 排 M4 |
| 2026-09-21 | 8 家未实测配方（zim/cma/cosco/hapag/one/evergreen/yangming/hmm） | 配方只写了、没验证 | 排 M4 |
| 2026-09-21 | `git init` + README | 项目非 git 仓库、无 README | 排 M5 |
| 2026-09-21 | 达飞「profile 预热」按钮 | 新 profile 403，爹地日常 Chrome 能通 | 二阶段 |
| 2026-09-21 | 二阶段：抓各家结果页 XHR 做统一对比表 | 达飞结果页 AJAX，背后有 JSON 接口 | 二阶段（需爹地点头） |

## 七、风险与决策日志
| 日期 | 事件/风险 | 裁决 | 影响 |
|---|---|---|---|
| 2026-09-10 | 无头浏览器被 Akamai 全拦（MSC/ZIM/CMA 403、Hapag Cloudflare） | 必须用有头 Chrome | 引擎默认 `headless:false` |
| 2026-09-10 | macOS 把窗口位置钳回屏幕内（-2400/-10000 都变 left=60,top=30） | 改用 CDP `Browser.setWindowBounds` 最小化 | 真·静默，爹地看不到窗口 |
| 2026-09-10 | 码农两次被 provider 额度掐断（zai glm-5.3 → 429；commandcode → 400） | 切 `volcengine-agent-plan`；zai 条目已从 5 个 profile 清除 | 已恢复；**commandcode 仍挂在 5 个 profile 的 custom_providers 里，待清** |
| 2026-09-21 | 项目跑了 11 天无 PROJECT.md、非 git、无 README | 本次补齐驾驶舱 | 中断即失忆风险 |
| 2026-09-21 | **【婉宜复核发现·码农未报】`.app` bundle 内不含 `engine/`** —— `project_root()` 靠从可执行文件向上探 12 级目录找 `engine/query.mjs`，在项目目录里能用，**一旦拷到 `/Applications` 就找不到引擎**，`run_query` 必报「找不到引擎脚本」 | 列为当前 WIP 第 1 项，派码农修：engine 作为 Tauri resource 打进 bundle，改用 `resource_dir()` 解析 | **M5 部署即失效**，必须修完才能交付 |
| 2026-09-21 | 界面截图（DoD-2/4）两次未取到：码农遇 QQ 悬浮视频窗遮挡，婉宜遇屏幕锁屏（`screencapture` 只得到锁屏播放器画面） | 等爹地解锁屏幕后补 | 交付证据链缺一环 |
| 2026-09-21 | **★ 爹地指点破局**：「MSC 要选 CY 才有船期」+「输入后没点选项导致空值」→ v6 全自主验证通过：cookie→填港→选CY→搜索→**读回 5 条真实船期**（Transit 33-47 天） | 候选级 SD/CY 徽标 + ariaSnapshot 读 Shadow DOM + type 触发补全，写进 FINDINGS-2026-09-21.md 和 web-scraping 技能 | **项目最大风险解除**：自主闭环成立，M4 只剩铺量 |
| 2026-09-21 | 打包缺陷已修（v4 轮码农）：engine/ + playwright-core 已打进 .app，已部署 /Applications | 已复核（Resources/engine/query.mjs 存在） | M5 部署路径打通 |

## 八、关联文档
- 需求与任务卡：`TASK_CARD.md`（v1）、`TASK_CARD_V2.md`（v2 续派）
- 反爬实测结论：`FINDINGS-2026-09-10.md`
- 引擎实测证据：`evidence/`（`run-*.ndjson`、`run-msc-maersk.log`、`*.png`）
- 页面结构探测记录：`qa/`（`aria-*.txt`、`probe-*.mjs`）

### 9-23 收尾（爹地报错 + 两点需求）

**① App 启动报错 —— 已修并验证** ✅
- 报错：`启动引擎失败：No such file or directory (os error 2)（PATH 里找不到 node？）`
- 根因：`lib.rs` 的 `find_node()` 无 `SSH_NODE_PATH` 时回退字符串 `"node"`，而 Finder 双击启动的 GUI App **不继承 shell PATH**（只有 `/usr/bin:/bin:/usr/sbin:/sbin`）
- 修复：`find_node()` 改为四级探测（显式环境变量 → 常见安装位 `/opt/homebrew/bin/node` 等 → login shell `command -v node` → nvm 目录扫描）
- 验证：干净 PATH + homebrew node 跑引擎 → `maersk prefilled 59.7s`，windowState=minimized

**② 日期默认当天、不强制 —— 已修** ✅
- 前端：`src/main.js` 日期校验改为「非空才校验格式」，标签改为「日期（YYYY-MM-DD，留空=当天）」
- **顺带抓到真 bug**：`parseArgs` 把 `--date ""` 的空串当 falsy → 解析成布尔 `true` → `dateFormats(true)` 崩 `iso.split is not a function`
- 修复：`parseArgs` 认空串为合法值 + 取值处只认字符串
- 验证：`--date ""` 跑通，各家显示「日期用网站默认」

**③ 港口别名调研（爹地核心要求）** ✅
- 调研方法：直连各家「地点查询」接口（比驱动页面快百倍）
  - CMA `/api/PortsWithInlands/GetAllPlaces?id=<kw>` ✅ 直连
  - YangMing `/api/P2P/GetLocations?locationName=<kw>` ✅ 直连
  - MSC `/api/feature/tools/GetAllAvailableCountriesAndPorts` ✅ 浏览器上下文（全量表 580 港）
  - COSCO `/ebbase/public/general/findCityDistrictByPrefix?prefix=<kw>`（已挖到）
  - ZIM `apigw.zim.com/.../locations?searchTerm=`（需 subscription-key，401）
- **核心发现**：
  1. 各家的命名逻辑不同：MSC 只收录**自己实际挂靠的码头**（搜「深圳」无，得搜蛇口/盐田/大铲湾；广州压根没有）；YangMing 用「城市, 省 (LOCODE)」
  2. **CMA 返回大量内陆点（Door）混在港口里** —— 只有标 `Port` 的才有船期（伊斯坦布尔 4 条只有 2 条是 Port）
  3. **同一港口 LOCODE 各家不同**：深圳 CMA `CNPHU` / YangMing `CNSZP` / MSC 码头码 `CNSHK`；南沙老港 `CNNSA` / 新港 `CNNNP`
  4. **同名干扰**：CMA 搜 nansha 首条是 `NANSHAN`（深圳南山）；鹿特丹混美国/新加坡同名
- 产出：`docs/PORT-NAMES-RESEARCH.md`（253 行）+ `docs/PORT-NAMES-COMPARE.md`（对比表）
- **对引擎的意义**：静态别名表（78 条）永远覆盖不全 → 应改为**查询时动态解析**（输入 → 各家接口拿候选 → 只选 Port 类型 + 国家消歧）

### 9-23 爹地实机反馈（第二次）—— 三个 bug 已修

**现象**：点查询后 10 家全显示「未查询」+ 弹出一个 chrome 空白页

**诊断过程**（用 App 内 evidence/*.ndjson 还原现场）：
```
14:17:14  Ningbo→Istanbul  → msc/maersk/zim/cma/cosco 全部 prefilled ✅（但没写 summary）
14:20:31  Ningbo→Izmit     → summary: total=0 ❌（连 window 事件都没有）
14:20:39  Ningbo→Izmit     → summary: total=0 ❌
```
→ 根因链：第一次查询未跑完（点了停止/异常）→ **残留 Chrome 占着 browser-profile** → 后续
`launchHeadedQuiet()` 有头启动失败 → 无头降级**也用同一 profile** → 同样失败 → 引擎崩 →
而 `engine-error` **只写 stdout 没写 ndjson** → 前端只看 ndjson → 停在「未查询」；
空白窗口即启动失败的残留。

**修复（4 处）**：
1. `engine/browser.mjs` 新增 `killStaleProfileChrome()` —— 启动前清理占用**我们自己的** PROFILE_DIR 的残留进程
   （只匹配 profile 路径，绝不碰爹地日常 Chrome）+ 等待 1.5s 让锁释放
2. `engine/query.mjs` 崩溃时**同时写 ndjson**（`engine-error`），不再只写 stdout —— 前端从此能看到原因
3. `engine/query.mjs` `selected.length === 0` 时**立刻退出、绝不启动浏览器**（防空白窗口）
4. `src/main.js` 三处解锁：`engine-error`/`engine-exit`/点「停止」时重置 `engineRunning` + `updateGoBtn()`
   （此前点过「停止」后 `engineRunning` 永远为 true → 再点查询毫无反应）

**验证**：干净环境 + 部署态跑 `Ningbo → Izmit --carriers maersk` → `prefilled 59.0s`、`windowState=minimized`、`total=1 failed=0` ✅

**顺带**：`--date ""` 空串在 `parseArgs` 里是 falsy 会被当 flag → 已修为「空串是合法值」；
`args.carriers || 默认全选` 意味着传空串=全选（保留此行为，符合直觉）。

### 9-23 关键根因：Tauri v2 缺 capabilities → 前端收不到任何事件（决定性修复）

**现象**：点查询后界面永远停在「engine 未启动 / 全部未查询」，但**引擎其实在正常跑**（evidence/*.ndjson 里
`msc prefilled` 等一应俱全），无任何报错。

**定位过程**：
1. 用 `test-stdout.mjs` 模拟 Rust 的读取行为 → 证明**引擎 stdout 是实时 flush 的**（0.2s 就到 `engine-started`）→ 排除引擎侧
2. 检查 dist 产物 → `engine://event` 监听代码在、无 JS 错误 → 排除前端代码本身
3. 查 `src-tauri/` → **发现根本没有 `capabilities/` 目录**

**根因**：**Tauri v2 的权限系统**——
- `invoke`（调用自定义命令）**默认放行** → 所以 `run_query` 能成功启动引擎，制造了「后端正常」的假象
- `listen`（接收后端事件）属于 **core 插件，必须显式授权** → 无 capability 时**监听被静默拒绝**（不报错）
- 结果：引擎全程正常、界面全程不动

**修复**：新建 `src-tauri/capabilities/default.json`，权限含 `core:default`、`core:event:default`、
`core:event:allow-listen`、`core:event:allow-unlisten`、`core:event:allow-emit`、`core:window:default`；
另给前端 `listenEngineEvents()` 加 try/catch（注册失败时把原因显示到界面，不再静默）。

**验证（婉宜自己走完整流程，不依赖爹地）**：
- 自建 `uitool.swift`（CGEvent 点击/粘贴）+ `ocr_boxes.swift`（带坐标 OCR）定位控件并操作
- 点击「并发查询」后界面实时显示：`● engine 在线` / `已预填并搜索` /
  `已预填 Shanghai (CNSGH) → istanbul turkiye trist（日期用网站默认）并点搜索` / `查询中…` / 其余 `待查询` ✅

**经验固化**：Tauri v2 项目**必须**有 capabilities 目录；只测「命令能否调用」不足以证明前后端通道健康，
**必须验证事件能否到达界面**。

### 9-23 晚 · API 直查改造（fastpath）—— 速度与结果两大问题的正解

**爹地反馈**：①查询极慢不如手查 ②结果界面看不到。根因：此前 100% 走浏览器填表（每家 30-90s），
且只回「已预填」不回船期数据 —— 手段（自动化填表）盖过了目标（快速拿到船期）。

**正解：fastpath（API 直查层）** —— 不是官方 API，就是各家**网页自己查询时发的请求**，原样复制：
- `engine/fastpath.mjs`：每家一个适配器，直连拿结构化船期（船名/航次/ETD/ETA/航程/直转/截关）
- 引擎流程改为：**先并发打 fastpath（1-2s）→ 拿到的直接出结果 → 拿不到的才开浏览器填表**
- MSC 特殊：API 被 Akamai 护着 → 第二档「页面内 fetch」（开页后在它自己页面里调它的 API，仍免填表）

**已打通 2/10**（其余 8 家继续挖）：
| 船司 | 接口 | 实测 |
| --- | --- | --- |
| YangMing | `GET /api/P2P/GetP2PRoutes?locationCodeFrom=CNNGB&...` | **1.3s / 4 条船期** ✅ |
| MSC | `POST /api/feature/tools/SearchSailingRoutes`（页面内） | **5-12s / 1 条** ✅ |

**关键坑（全部实测得出）**：
1. MSC 请求体 `{FromDate, fromPortId:441, toPortId:106, language:"en", dataSourceId:"{GUID}"}` ——
   PortId 来自其全量表（已入库 `db/ports.db` 的 `msc_ports` 表 580 港）；dataSourceId = 页面 `[data-setting-id]`
2. MSC 缺头 `x-requested-with: XMLHttpRequest` → **200 但返回空字符串**（最阴的一个坑）
3. **GUI App 环境无 SSL_CERT_FILE** → node fetch 报 `unable to get local issuer certificate`
   （Clash TUN MITM 证书不被 node 认）→ fastpath 里读 `/etc/ssl/cert.pem` 显式做 CA 重试 ✅
4. fastpath 命中后 runCarrier 的 finally 会重复 emit → App 同一家显示两条（已修）

**前端**：每家一行下面直接显示船期（`船名 航次 开→到 天数 直达/转XX`），不要表格；
新增 `done`（✓ 已查到）状态徽章。

**部署态实测（模拟 GUI App 环境）**：yangming 1.6s(4条) + msc 15.4s(1条) 全 [API] 完成，0 浏览器 ✅

### 9-23 深夜 · API 直查扩容 2→5 家（Ningbo→Istanbul 部署态实测）

| 船司 | 档位 | 速度 | 结果 | 关键 |
|---|---|---|---|---|
| YangMing | 直连 fetch | 1.9s | 4条 | （已有）|
| MSC | 页内 fetch | 7.7s | 1条 | （已有）|
| **COSCO** | 页内 fetch | 3.8s | 4条 | findCityDistrictByPrefix 拿 cityUuid → POST purpoShipmentWs（body 从抓包挖出）|
| **Hapag** | 页内 fetch | 11.4s | 8条 | schedule.api.hlag.cloud/api/routes + **头 x-token: public** + containerType=42GP（错值时 API 自己报允许列表）|
| **ZIM** | 页内 fetch | 17.0s | 8条 | apigw PointToPoint/v2 + SPA 公开 subscription-key + 日期格式 23-September-2026 |

技术要点：
- 引擎加 `--record-xhr` 开关（fetch+XHR 双拦截 init script），一键挖任意家的 API
- Hapag/ZIM 直连都被 CF 挡 → 页内 fetch 档；HMM 直连 403、ONE 站侧 hydration 挂（清 cookie 无效，暂配方兜底，oneDeep 已写好待站恢复）
- 其余 5 家（Maersk/ONE/Evergreen/HMM/CMA）仍走浏览器 30-90s：Maersk 挖到 geography API、CMA 是两段式表单、HMM 有完整 body 但 WAF 拦页内
- 部署态 rsync 同步；inpage 超时 25s→90s（ZIM/ONE 深链渲染需要）

### 9-24 · 「结果条数太少」修复（爹地：结果至少 10 条）

三个堵点全修：
1. **MSC 只回 1 条** → 根因：Data 按航线聚合、每条 Data[i].Routes 是多班次数组，之前只取 Routes[0]。改成每班一行（9-24 实测 8 条：MSC VIVIANA 10-08 → MSC MIRJA 11-18）
2. **前端只显示 5 条** → main.js slice(0,5) 删掉，全部显示
3. **YangMing 开始 400** → 挖出 API 隐含规则：startDate ≥ 今天+4、窗口 ≤ 30 天；改 start=+4/end=+34 后恢复（7 条）

窗口 21→35 天、各 slice 上限 8→12。

部署态终验（Ningbo→Istanbul）：YangMing 2.5s/7条 · MSC 4.1s/8条 · COSCO 4.1s/6条 · Hapag 8.9s/12条 · ZIM 7.3s/9条 = **42 条船期，合计 ~27 秒，failed=0**（build8 已部署）
周班航线 30 天窗的物理条数就是 4-5 条/家；想更多就把窗口再拉长（YangMing 上限 30 天卡着，MSC 天然 6 周）。

### 9-24 · 并发查询落地（爹地：查询依旧一家一家查）

- Rust `run_query` 固定传 `--batch 3`（build9 已部署）：浏览器阶段 3 家并发（批内错峰 4-6s/家 保留，防同 IP 齐射）
- fastpath（API 直查）本来就是全并发 Promise.all
- 部署态实测（5 家浏览器系）：批1=maersk,one,evergreen 同跑（34.8s 首个出结果），批2=hmm,cma；总时长 388s→230s
- 窗口不弹屏：newPage 后立即 quietWindow minimized（browser.mjs:150 已有机制，并发时每页都会压回）
- ONE 批内 173s（它站 hydration 慢，已知问题，拖批尾）

### 9-24 · 「App 里还是串行」根因 = 部署错版本

- build9（Rust --batch 3）12:05 才构建完，我 11:46 就把旧 bundle 拷去了 /Applications → App 跑的仍是 build8 二进制
- 症状对比法：strings 查二进制 batch=0 实锤
- 13:47 重新部署（二进制含 batch），混合自测：yangming 1.8s API 秒回不占批；批1=cosco/hapag/maersk 同跑（57.2s 首个浏览器结果）；批2=evergreen
- 教训：构建是后台任务时，必须等 EXIT 回执再部署，不能并行赶

### 9-24 · 全并发（爹地：为什么只能3家？不能全部同时开始吗？）

- --batch 3 → 12（10 家一批全开）；错峰 4-6s×j → 0.8-1.6s×j（只让开页动作错开，加载全并行）
- 部署态 10 家实测：批1 一次开出 9 家浏览器页；总时长 = 最慢家 41s（vs 串行 ~10 分钟）
  YangMing 2.8s / COSCO 6.9s / ZIM 8.5s / Hapag 9.7s / MSC 10.3s（API）· CMA 30.1s / HMM 34.3s / ONE 34.5s / Maersk 39.7s / Evergreen 41.3s（浏览器）
- 反爬顾虑：10 家是 10 个不同域名，互相不冲突；单家内部行为不变

### 9-24 · 结果格式统一 + 航次补全（爹地：只有两家查到船期、格式不统一、只有船名没航次）

**字段映射修复（Ningbo→Gdansk 部署态实测）：**
- MSC：航次字段名是 `DepartureVoyageNo`（之前猜 VoyageNumber 落空）；天数用每班自己的 `TotalTransitTimeHours`（x 级聚合值会错班）；摘要「转」vs 明细「直达」矛盾 = RoutingType 是航段级，明细按班展开后逐班判断 → 现在一致。15 条带航次 GL638W…
- Hapag：船名在 `leg.vesselDetails.name`（locationName 是地名 NINGBO，之前错把它当船名）；承运航段 = 第一个 modeOfTransport===VESSEL 的 leg；航次 = scheduleVoyageNumber（638W）。MANILA MAERSK / 638W ✅

**顺带工程化：**
- fillAutocomplete 从 query.mjs 抽到 lib/dom.mjs 导出（qa 脚本可直接复用）
- HMM 配方按钮修复：clickByText 会误点导航栏 Search（跳 company.do）→ 精确点 onclick=gotoPortToPort 的按钮
- YangMing Gdansk 直连返回 []：该线无直班，数据事实非 bug

**遗留（下一步）：** 浏览器兜底的 5 家（Maersk/CMA/COSCO/ONE/Evergreen）prefilled 后仍不抓结果 —— 需逐家加结果页抽取。

### 9-24 · 维运网兜底（爹地：查不到/慢的用维运网查）

**API 攻坚结论（停损）：** 维运网 wywapi 网关摸清（/api/getAllShipStartPorts、getCarriersByStartPort、getFleetRoutes 等全通），但船期明细走 Next.js RSC 内部协议 + anti-dom 反爬（CDP 会话页面不渲染、截图超时），自动化成本 >> 直调船司官网。停损。

**已交付（build11）：** App 每行查询结束后，无船期的行显示「🔍 维运网查『起点 → 终点』」链接，点一键用系统浏览器打开维运网船期页（Rust open_external 命令，URL 白名单只允许 weiyun001.com）。查不到的船司一键人工兜底。

### 9-24 下午 · 5 家浏览器船司「结果抓取」补齐（码农执行，婉宜复验）

**部署态全量复验（婉宜亲测，非子代理自报）：**
- Ningbo→Istanbul：**8/10 家出船期，61 条**，0 failed。新增：Maersk 2条（MOGENS MAERSK/639W）、Evergreen 7条、CMA 10条（含转Malta详情）；API 5家照常（yangming 7/msc 8/cosco 6/hapag 12/zim 9）
- Ningbo→Gdansk：**5/10 家出船期，43 条**。Maersk 12条、CMA 10条、MSC 15条、Hapag 6条
- 未出船期的都是真实数据/站侧原因：HMM Istanbul TRHAY 无班次、ONE 站侧 hydration 挂、Evergreen Gdansk 真实无结果、YangMing Gdansk 无直班、COSCO/ZIM Gdansk 候选库缺

**关键改动：**
- query.mjs：配方返回 schedules 数组 → 升级 done/level=1 并 emit；修 res.status 判据漏 done 的 bug
- maersk 配方重写：纯地名填表（词典串致 geography API 404）+ Ambarli 特判 + 卡片正则
- hmm 配方重写：入口改 e-service ScheduleMain.do + TRHAY 船司级 fix + btnRetrieve
- evergreen：#txt_schedule_ori/dest_name + LOCODE 候选 + 隐藏域验证
- cma：Main vessel/Voyage Ref. 卡片正则 + 纯词 fallback
- one：oneDeep 接通（主页预热12s→深链→60s 轮询，不渲染返 null）；站侧 hydration 挂保 prefilled
- cosco：候选 pick 动态纯词

**工程化：** fillAutocomplete 抽到 lib/dom.mjs；探针留 qa/probe-*.mjs。

### 9-24 傍晚 · 第 11 家 OOCL 接入（爹地：好像没有 oocl？）

- 入口：`moc.oocl.com/nj_prs_wss/#/sailing_schedules/search`（官网 Sailing Schedule 的 Angular SPA；ecomm.oocl.com 已废弃 NXDOMAIN）
- 表单：input[ng-model="user.origin"/"user.destination"]（commonLookupInput）；候选 ul.th-dropdown-menu；port_of_* 在 Advanced Search 折叠区（默认收起，别用）
- 主查询：页面自己 POST `mocss/secured/supportData/nsso/searchHubToHubRoute`（参数 originId 等，无需自己构造）
- 结果行级解析：`港名/日期 DD Mon (Ddd)/CY/Schedule Details/CY/港名/日期/N day(s)/.../服务/船名 航次`
- aliases 加 oocl 4 条（纯城市词，OOCL 候选对纯城市名最稳）
- 部署态实测：Istanbul 4 条（TEXAS TRIUMPH 039W 等）、Gdansk 2 条（OOCL TURKIYE 012W / OOCL GDYNIA 011W）——两条线全通
- registry/前端列表 +oocl = 11 家；build12 已部署
- 坑：OOCL SPA 渲染偶发慢（轮询 ng-model 出现再动）；istanbul 候选偶发不弹（等待 7s + 首词匹配）

### 9-29 · 「点击查询无反应」修复（真凶：async 里被静默吞掉的 ReferenceError）

- **症状**：点「并发查询」完全无反应，engine 一直「未启动」，无任何报错
- **真凶**：`src/main.js` 第 233 行引用未定义变量 `originInput` / `destInput`（9-24 加维运网链接时改错）；
  它在 `async` 点击处理函数里抛 ReferenceError，**被静默吞掉**，UI 无任何反馈
- **为什么之前没测出**：空表单时 handler 在前面就 return，跑不到那一行（我浏览器测试用的空表单）
- **修复**：改为 `lastQuery = { origin, destination }`；并加防线：`window.onerror` + `unhandledrejection` → 写进可见的 #summary（未捕获错误不再静默）
- **验证方式（可复用）**：
  1. `qa/click-repro.mjs` —— Playwright 载入真实 dist + **注入 `__TAURI_INTERNALS__` 桩**，点 #btnGo，断言 engine 变「执行中」+ 11 行状态 + `invoke run_query` 真发出（0 页面错误）
  2. Rust `run_query` 入口写 `/tmp/ssh-app-trace.log` 留痕 + `SSH_SELFTEST=1` 自检开关（前端自动填表并点击同一代码路径）
  3. 真 App 自检跑通：trace 有 `run_query ENTER`、引擎进程起、ndjson 有结果
- **真机结果（Ningbo→Istanbul，11 家）**：63 条船期 —— yangming 5 / msc 8 / cma 10 / cosco 6 / hapag 12 / evergreen 7 / zim 12 / oocl 3；maersk 配方超时(116s)→仅打开页；one 站侧挂；hmm 官网站侧真实 0（同配方 Rotterdam 出 12 条，证明抓取通）
- **教训**：Tauri 里改 `document.title` 不会改 NSWindow 标题 → 不能用标题当探针；要看状态就用 DOM 可见元素或文件留痕

### 9-29 下午 · HMM 结果抓取修复（爹地：「MSK ONE HMM 都是可以查到的」）

- **真凶（两层）**：①我 9-24 给 HMM 打了硬映射 `TRIST→TRHAY`(Haydarpaşa TMNL)，选到了没船的码头；②改回 TRIST 后仍 0 条——HMM 候选列表是 `ac_results` 组件，**用 JS 程序化 `el.click()` 它不认**，隐藏域 `srchPointTo_code` 被写成默认第一项 TRHAY → Search Results 0
- **实探候选**（`qa/probe-cands.mjs`）：istanbul → `ISTANBUL(HAYDARPASA TMNL), TURKIYE [TRHAY]` / `ISTANBUL, TURKIYE [TRIST]` / `TRAKYA FREE ZONE (ISTANBUL), TURKIYE [TRTRA]`
- **修复**：候选点选改用 Playwright locator 真实鼠标点击 + **回读隐藏 code 校验**（不符则重试，最多 3 轮）；去掉 TRHAY 硬映射
- **部署态实测**：Ningbo→Istanbul = **done 6 条**（SEASPAN BREEZE 0064W / YM WELCOME 0051W / MSC VIVIANA 0103W …，与爹地官网截图逐条吻合），38s
- **通用教训**：凡「候选点选」环节（各家 autocomplete 组件），一律用真实鼠标事件 + 回读被写入的隐藏域/输入框值自校验——JS `el.click()` 在部分组件上会静默选中默认项
- **仍待办**：Maersk（硬映射 Ambarli 已失效，153s 无结果回显）、ONE（结果页不渲染 → prefilled）已派码农按同一方法修，deleg_60e09a34 + cron 兜底 0fbe8ea2d82d

### 9-29 傍晚 · Maersk/ONE 修复 + 全站切「零窗口」模式

**Maersk（码农修，婉宜复验）**：改走 API 直查 —— `maerskResolve`（geography API 取 GEO_ID，cityName 必须小写）+ POST `routing-unified/routing/routings-queries`（抄页面公开 consumer-key）。实测 **done 5 条 / 9s**（此前 153s 无结果）。真相：TRIST 城市级对该线确实无船期（HTTP 422），马士基卖的是 Ambarli（TRAMB）——旧结论方向对，错在硬编码单点 + 脆表单点选。三级路径：API → 深链 → 老表单兜底。遗留：via 是中转港 facility 码（EGPSDTM）非地名。

**ONE（码农修，婉宜复验）**：站侧改版 mag-* 组件后老流程失效（候选渲染成 tag 但 React 状态没吃到 → 点 submit 报 Destination is mandatory）。新路径：node 直连站内船期 API（`/api/v1/schedule/point-to-point`，无鉴权）+ 配方兜底（页内 API → suggest 取官方名 → 带名深链 → DOM 正则）。实测 **done 2 条 / 6s**。坑：深链只带 LOCODE 会停 728B 壳页，必须同时带 `oriLocNmParam/destLocNmParam`；页内 fetch 必须用绝对 URL（API 在 ecomm 域）。

**全站切零窗口（爹地要求：Chrome 窗口别一直弹）**：
- 原来默认是「有头 + CDP 最小化」（为过反爬），屏幕上会闪窗 → 改为默认 **`--headless=new` 零窗口**（`engine/query.mjs` 启动处；`SSH_ALLOW_HEADED=1` 可回退有头调试）
- 爹地问「能不能从 GitHub 植入轻量浏览器」→ 实测结论：不用。GitHub 上的轻量引擎（Servo/Ladybird/Ultralight/miniblink）要么太早期、要么 Windows 专用/闭源，反爬能力不如真 Chrome；真要「真·植入」应走 **Tauri 隐藏 WebView（系统 WebKit）**，代价是 11 家配方重写（未做，列为后续）
- **关键坑**：验证无头可用性时**不要用 Chrome profile 副本**——副本会给出假失败（Evergreen/OOCL 在副本下失败、真实 profile 下全通）。用真实 profile 才是真结论。
- 部署态全量实测（零窗口）：**11/11 done，76 条船期，屏幕上 Chrome 窗口 0 个**，全程 ~60s
  （yangming 2.5s / one 1.5s / cosco 4.7s / msc 5.4s / maersk 7.8s / evergreen 11.8s / zim 11.9s / hapag 13.1s / hmm 14.2s / cma 26.8s / oocl 62.6s）

### 9-29 晚 · 「改港口再查就失败」修复（爹地反馈）

- **症状**：查过一次后换港口再查，全部船司失败
- **真凶**：词典 `aliases` 表一行坏数据 `shanghai | oocl | CNSHA`，而 `ports` 表里上海的 locode 是 **CNSGH**（CNSHA 不存在）→ `findPort()` 里 `port` 取到 undefined → 抛
  `Cannot read properties of undefined (reading 'name_ascii')` → 11 家船司在港口解析阶段 **0ms 全秒挂**
  （所以只有"换到上海"这类命中坏词时才炸，宁波/伊斯坦布尔不受影响，看起来像"第二次查询失败"）
- **数据修**：`shanghai` alias → CNSGH；ZIM 两个码头级 alias（TRHYY/TRKPX 不在 ports 表）→ TRIST；全表体检后坏行为 0
- **代码防线**（`engine/portdb.mjs`）：alias 行的 locode 必须先验证存在于 ports 表，否则跳过继续按名字查；取不到 port 行一律返回 null（走 unknown 兜底），**绝不让一行坏数据拖垮整批**
- **验证**：shanghai→gdansk 从「11 家全秒挂」→ 正常跑（maersk 7 条 / one 2 条 / oocl 5 条，其余为真实无班次或站侧限制）；紧接着 ningbo→istanbul 复跑 65 条、failed=0；再跑 shanghai→gdansk 可重复、无 failed
- **附带发现（非我方 bug）**：Maersk geography 接口对**土耳其城市**（istanbul/ambarli）返 **401 ERR_GW_001 API Key Validation Failed**，而 ningbo/shanghai/gdansk/rotterdam 均 200；试了 6 种参数绕行（countryCode/大写/query/autocomplete/consumer-key）全 401 —— 站侧问题（当天早些时候同查询是通的）。当前 Maersk 查 Istanbul 会掉兜底

### 9-30 上午 · 上海别名组补齐（码农执行，婉宜复验）

**地基修正（婉宜）**：`aliases.locode` 语义澄清 = **船司自己用的码头码**（允许 CNSHA 这类不在 UN/LOCODE 表的值）；`ports` 表才是权威地名来源，别名命中后 name/country 先按码查 ports、再按港名兜底查，都查不到返回 null（unknown 兜底，绝不抛错）。根因：我们库里上海=CNSGH，而 HMM 官网用 CNSHA —— 码对不上候选永远点不中。

**码农产出**：
- `db/aliases-shanghai.sql` + `db/ports.db`：12 条上海别名（11 家 + un 兜底，source=verified）；**ZIM 的上海码是 CNSNH**（≠CNSHA，Locations API `CNSNH;10`）
- `engine/portdb.mjs`：`findPort(word, carrierId)` 按船司查别名（其次 un，最后旧行为）——修掉「谁先被查到就用谁」的隐患
- `engine/lib/portsolve.mjs` 透传 carrierId；`engine/fastpath.mjs` zimInPage 码头码后缀逐试（`;10`/`;0`）、coscoInPage 增港名兜底；`engine/query.mjs` cosco 注入港名；`hapag.mjs`/`yangming.mjs` 候选匹配去写死宁波/伊斯坦布尔（并集追加动态词/码）

**婉宜独立复验（部署态，自己跑自己数）**：
- shanghai→rotterdam：**done 9 家 / 83 条**，起运港候选类失败 **0**（evergreen、zim 为站侧无该航线/抽取正则写死宁波动词，已记录）
- 部署态 engine 与源 `diff -rq` 一致、`db/ports.db` `cmp` 一致
- 已知站侧限制：ZIM 上海→鹿特丹/格但斯克无航线（Bad Request）；evergreen 结果页抽取正则仍写死 NINGBO/ISTANBUL（非宁波起运止于 prefilled）；ZIM 的 CNSNH 与 UN/LOCODE「Shenhu」撞码（ZIM 配方不读 name，无功能影响）
- 引擎 summary 事件 `prefilled` 字段**有意**把 done 归入（"done(artapi)=prefilled 档"），UI 侧由 refreshSummary 按行徽章自行重算，口径不受影响

### 9-30 · 上海别名组验收 + 垃圾输入加固（婉宜独立复验）

**婉宜独立复验（部署态，自己跑自己数；干净环境，无并发互抢）**：
- `shanghai→rotterdam`：**done 9/11，83 条**，起运港候选类失败 **0**
- `shanghai→gdansk`：**done 7/11，59 条**，起运港候选类失败 **0**
- `ningbo→istanbul` 回归：**done 10/11，72 条，failed=0**（达标 ≥70）
- 代码一致性：`diff -rq engine/` 一致、`db/ports.db` `cmp` 一致

**新发现并加固（婉宜）——垃圾输入静默查成错港口**：
- 起因：我一条测试命令的 shell 拆词写坏，把 `--destination` 传成了布尔 `true`，引擎居然照查不误，结果变成了 **"Struer (DKSTR)"**（丹麦小港，"sTRUE r" 里含 "true"）；空串则命中全表第一行 **"Abu al Bukhoosh"**
- 加固 1（`engine/portdb.mjs::findPort`）：拒绝非字符串 / 长度 <3 的输入；港名兜底改为 **精确 → 前缀 → （≥5 字符才）包含**，杜绝 "true"→Struer 这类误命中
- 加固 2（`engine/query.mjs`）：`--origin/--destination` 非空字符串校验，非法立即 `engine-error` 退出（exit 2），不再发起荒谬查询
- 验证：`--origin "" ...` → 立刻报「参数 --origin 非法」；`shanghai→rotterdam`（yangming）仍 done 10 条；`shanghai/ningbo/istanbul/gdansk/rotterdam/kobe/oslo` 解析全部正确
- 教训：**测试命令本身也会骗人**——shell 拆词/引号写坏会产生"看起来是产品 bug"的假故障；复验前先确认命令传参正确（本次两条"失败"就是我自己造成的）

### 9-30 · Evergreen 结果抽取正则去硬编码（婉宜）

- **问题**：`engine/recipes/evergreen.mjs` 结果页正写死了 `NINGBO, CHINA` / `ISTANBUL` —— 只有查宁波→伊斯坦布尔能抽出行，换起运/目的港一律停在「已预填」（0 条）
- **修**：改为**按本次查询的港口名动态构造正则**（取解析出的港名首词大写；缺失则退化为通配），捕获组顺序不变，下游映射零改动
- **验证**：`shanghai→rotterdam` evergreen **done 10 条**（改前 prefilled/0）；`ningbo→istanbul` 回归 **done 6 条**（与改前一致，无回退）

### 9-30 · 全量复跑最终验收（婉宜，部署态）

| 航线 | done | 总船期 | 起运港候选类失败 | 未出结果的家 |
|---|---|---|---|---|
| shanghai → rotterdam | **10/11** | **93 条** | 0 | zim（官网无此航线，prefilled）|
| ningbo → istanbul | **10/11** | **77 条** | 0 | maersk（官网土耳其地理接口 401，站侧）|

- Evergreen 修好后 shanghai→rotterdam 从 83 条 → **93 条**（evergreen 贡献 10 条）
- Maersk 在 shanghai→rotterdam **4 条 done** —— 说明它只有"土耳其目的地"受影响（站侧 401），其他航线正常
- HMM ningbo→istanbul 出 **12 条**（Search Results 20），较此前 6-7 条更全

### 9-30 · Maersk 土耳其 401 破案并修复（婉宜）

- **破案过程**：先确认 401 与城市无关（宁波/上海/欧洲 200，Istanbul/Ambarli 401）→ 怀疑是请求头 → 探针抓 **Maersk 页面自己发的同一个 geography 请求**，发现它带 `Consumer-Key`（**官网页面明文公开常量，与我们代码里 MAERSK_KEY 是同一个值**）→ 对比代码发现：**这个 Key 只在船期 POST 时带了，查城市时漏了** → 网关对缺 Key 的请求返回 `401 ERR_GW_001 API Key Validation Failed`（只对部分区域严格拦截，所以之前时通时不通）
- **修复**：`engine/fastpath.mjs::maerskResolve` 的 geo fetch 补上 `consumer-key` 头（Key 经 evaluate 参数传入）
- **验证**：`maersk` ningbo→istanbul **done 7 条**（MOGENS MAERSK 等；修前连续多轮 opened/0 条）——`Ningbo(CNNPO) → Ambarli Port Istanbul(TRAMB)`，试过 TRIST(HTTP422)/TRAMB(HTTP200/7)
- **方法论沉淀**：接口 401/403 时，先抓「页面自己发的同一请求」比对自己的请求头（探针 `qa/probe-maersk-geoharvest.mjs` / `probe-maersk-headers.mjs`），往往差的就是一个公开常量；不要急着判定"站点限流/封 IP"

### 9-30 · 里程碑：11/11 家全部出真船期（婉宜终验，部署态）

| 航线 | 出船期 | 总条数 | 说明 |
|---|---|---|---|
| **ningbo → istanbul** | **11/11** | **79 条** | 全员出结果（Maersk 修好后 7 条）|
| shanghai → rotterdam | 10/11 | 93 条 | 仅 ZIM 无此航线（站侧）|

这一轮累计修复：上海别名组（各家港口码显式化）· Evergreen 抽取正则去硬编码 · 垃圾输入加固（含 CLI fail-fast）· **Maersk 土耳其 401（缺 Consumer-Key 请求头）**。

### 9-30 · 两个优化（婉宜）

**① 结果缓存（20 分钟 TTL）**：同条件（起运/目的/日期/船司集合）重复查询直接回放上次结果 ——
实测冷查 77s → 复查 **0s**；行内明确标注「⚡ 缓存（刚刚的结果，20 分钟内有效）」，不冒充实时。
关闭：`--no-cache` 或 `SSH_CACHE_TTL_MS=0`；只有「至少一家真出结果」才写缓存（不把整批失败固化）。
实现：`engine/query.mjs` 读缓存（在 fastpath/浏览器之前，命中即 emit + summary + exit）/ 写缓存（finally 里）。
意义：重复查询提速 + 显著减少对船司官网的重复请求（防限速/防封）。

**② OOCL 接口调查（结论：暂不做 fastpath）**：抓到它的两个端点 ——
`GET .../gsp/cityAutoComplete?userQuery=X&bound=OB|IB`（城市联想，含 `_id`）与
`POST .../nsso/searchHubToHubRoute`（body 带 originId/countryCode/haulageMode…，响应 `data.standardRoutes[]`）。
**但请求体含 `captchaToken`（页面 JS 现场生成，回放直接被拒：`Captcha Error!`）** → 无法复用；
OOCL 维持 DOM 填表路径（38-77s）。它慢不影响体验：结果是流式显示的，其它 10 家先出。

### 9-30 · 结果展示改版：浅色 + 时间轴行程卡（爹地选定 002 稿）

- **流程**：先 grill 问清偏好（风格/主题/主信息/动效/分组）→ 出 3 个可点设计稿（票根式 / 时间轴 / 网格卡，`sketches/00*`）→ 爹地选 **002 时间轴行程式** → 落地 App
- **主题**：全站转**浅色干净风**（原为跟随系统的深色）
- **结果区结构**：每家船司 = 一张分组卡（色条 + 船司名 + 状态徽章 + 摘要行），卡内每条船期 = 时间轴一行：
  左侧**开船日期大字**（`10.06` + 星期）→ 时间轴节点 → 航线 + 船名/航次徽标 + 到港日 → 右侧**天数** + 直达/转胶囊
- **hover 反馈**（爹地指定的动效）：整行右移 3px + 底色透出船司色 + 时间轴节点放大发光
- **数据流零改动**：只改渲染层（`src/main.js` 渲染函数 + `src/styles.css`），查询/引擎逻辑未动
- **视觉验收抓到的 3 个真 bug（已修）**：
  1. `refreshSummary` 仍在查已改名的 `.st-badge` → 每轮查询报 TypeError（改为 `data-st` 属性统计）
  2. 摘要行单行硬截、日期被折断 → 有船期行时摘要只留前导说明（如「API 直查 8 条」）
  3. 左侧「Hapag-Lloyd 赫伯罗特」换行致行高不齐 → 侧栏加宽 248px + 名称不换行
- **验收**：部署态真机截图（`docs/ui-v2-timeline.png`），无报错、行高一致、层次清晰（自评 8.5-9/10）
- **可继续打磨（未做）**：查询中 spinner、次要文字对比度、滚动到底提示、停止按钮样式层级

### 9-30 · 修「ShipScheduleHub 被阻止修改 App」弹窗（婉宜）

- **现象**：macOS 反复弹「"ShipScheduleHub.app" was prevented from modifying apps on your Mac.」（App 管理保护）
- **实锤**：系统日志 `com.apple.tcc.notification.kTCCServiceSystemPolicyAppBundles.com.ross.shipschedulehub`
- **真凶**：运行期可写数据（evidence 截图/ndjson、20 分钟结果缓存、Chrome profile）写在
  `/Applications/ShipScheduleHub.app/Contents/Resources/` 里 —— **macOS 的 App 管理会拦截 App 修改任何 .app 包（包括它自己）**，
  于是每次查询写文件就触发一次通知
- **修复**：`engine/browser.mjs` 新增 `DATA_DIR = ~/Library/Application Support/ShipScheduleHub/`，
  profile / evidence 全部搬过去（含**一次性自动迁移**，rename 旧目录以保住已养熟的 Chrome profile）；包内只留只读资源（engine/ 配方、db 只读副本）
- **验证**：迁移日志 `data-migrated` 两条 → 数据落在 `~/Library/Application Support/ShipScheduleHub/`（78MB）；
  包内 Resources 只剩 `ShipScheduleHub.icns / db / engine`，修后再无新写入；
  修后跑完整查询（msc 19 条 + maersk 5 条）→ **App 管理相关事件新增 0**
- **附带收益**：以后重装 App 不再丢 Chrome 档案与缓存；无需给「App 管理」权限（保持拒绝更安全）

### 9-30 · 转 git 仓库并推 GitHub（婉宜）

- `git init -b main` + 提交 402 文件（`.gitignore` 挡住 node_modules / src-tauri/target / dist / evidence / browser-profile —— 项目 4.0G，实际入库 ~15MB）
- 提交身份：`theWeatherMan21 <theWeatherMan21@users.noreply.github.com>`（gh 已登录账号）
- **私有仓库**：https://github.com/theWeatherMan21/ship-schedule-hub （`gh repo create --private --source=. --push`）
- 远端核验：`visibility=PRIVATE`、`defaultBranchRef=main`、远端文件数 **402**、本地 HEAD 与 origin/main 一致（fa1af78）
- 安全体检：源码内**无密码/私钥/token**；命中的是各家页面**公开常量**（Maersk consumer-key、ZIM subscription-key 等，本就写在对方页面 JS 里），私有仓库无外泄风险
- 项目管理同步更新：`PROJECT.md` 〇节当前状态 + `PORTFOLIO.md`（在推区 + 芝麻仓）

### 9-30 · 并发串词真凶（重大可靠性修复 · 婉宜）

**症状**：全量查询稳定出现「随机某一家失败」，且每轮掉的那家不一样（HMM 报「起运港候选未出（ningbo china cnngb/CNNGB）」——
注意这串词根本不是 HMM 的词，是 Evergreen 的）。

**根因**：`query.mjs` 的 `runCarrier` 在 **12 家并发**时把「本家港口解析结果」写进**共享的 `qBase`**（`qBase._o = ...`），
各家互相覆盖 → A 家读到 B 家的输入词 → 候选点不中 → 整家失败。

**修复**：每家一份**私有 q**（`Proxy` 包 `{...qBase, _o, _d}`），`originText/destText` 从私有对象取；
fastpath 的 in-page 闭包与配方调用全部改用私有的 `oRes/dRes/qLocal`。**共享可变状态在并发路径上是禁区。**

**验证**（部署态、`--no-cache`、连跑两轮）：

| | done | 条数 |
|---|---|---|
| 修复前 | 10/11（随机掉一家）| 72–79（每轮不同）|
| **修复后 第 1 轮** | **11/11** | **84** |
| **修复后 第 2 轮** | **11/11** | **84**（与上轮完全一致）|

### 9-30 · Windows 适配（P1+P2 落地 · 婉宜）

- **P1 引擎跨平台**：`DATA_DIR` 平台化（Win → `%LOCALAPPDATA%\ShipScheduleHub`）；清理残留 Chrome 走 PowerShell+taskkill；
  CA 兜底跨平台（Windows 无 PEM 包 → **自动从系统证书存储导出**一次，企业 HTTPS 检查环境必需）；临时文件路径平台化
- **P2 壳/配置跨平台**：`find_node` 支持 ①`SSH_NODE_PATH` ②**随包 node（`engine/node-bin/`）** ③Win 常见路径（含 nvm-windows/Volta）④`where node` ⑤版本管理器扫描；
  `stop_query` 改「记 PID → Windows `taskkill /T`（杀进程树）/ mac `kill`」；spawn 加 **`CREATE_NO_WINDOW`**（否则科研窗闪黑框）；
  `open_external` 三平台；`bundle.targets=all`；WebView2 `downloadBootstrapper`；字体栈补 `Segoe UI/微软雅黑`；新增 `.gitattributes` 防 CRLF
- **分发关键件（新增 `engine/chrome.mjs`）**：浏览器解析器 ①`SSH_CHROME_PATH` ②系统 Chrome ③Playwright 自带 Chromium
  ④**按需自动下载 Chrome for Testing**（~150MB，只下一次，无需管理员权限）→ **同事机器没装 Chrome 也能跑**
- **CI**：`.github/workflows/build-windows.yml`（`windows-latest` 出 NSIS 安装包，自动下载 node.exe 打进包 → 上传 artifact / 打 tag 发 Release）
- 方案与待办见 `docs/WINDOWS-PORT-PLAN.md`

### 9-30 · 船期条数太少 → 三家窗口全查修（婉宜）

用户报「ONE 还是只有两条船期，至少 5 条以上」。查下来**不是站侧问题，是我们把查询窗口设太窄**：

| 家 | 原窗口 | 实测 | 改为 | 结果 |
|---|---|---|---|---|
| **ONE** | 14 天（`toDate=fromDate+14`）| 14 天 2 条 / 28 天 3 条 / **42 天 8 条** / >42 天 **0 条** | **42 天**（上限）| 2 → **8 条** |
| **OOCL** | 官网默认 `user.weeks=2` | 2 周 3 条 / 6 周 6 条 / **12 周 11 条** | 配方把 `select[ng-model="user.weeks"]` 设成 **12**（回读校验）| 3 → **11 条** |
| **COSCO** | 35 天 | 35 天 5 条 / 56 天 7 条 / **84 天 11 条** | `dateWindow(iso, 84)` | 5 → **11 条** |

顺手修的：
- **OOCL 跨年年份错**：页面只给「10 Dec (Thu)」没有年份，原来写死「今年」→ 12 周窗口必然跨年，
  会把 `2027-01-16` 显示成 `2026-01-16`。改为按参照时间（ETD 参照今天、ETA 参照 ETD）向前滚年份；
  验证 11/11 条「日期差 == 天数」自洽。
- `dateWindow` 加 `daysArg` + `SSH_WIN_DAYS` 覆盖（调窗/探针用；MSC 不受该参数影响，仍走自己 6 周逻辑）。

**全量回归（部署态 · 宁波→伊斯坦布尔）**：`11/11 家 · 104 条`（修前 90 条），每家 ≥6 条。
新增探针：`qa/probe-oocl-window.mjs`（抓页面真实请求体 → 定位 `weeks=2` 这个真凶）、`qa/probe-oocl-form.mjs`。

### 9-30 · 全平台安装包发布（Release v1.0.0 · 婉宜）

- **CI 出包成功**：`.github/workflows/build-installers.yml`（三 job：windows / macos×2 架构 + release 汇总）
- **Release 产物**（github.com/theWeatherMan21/ship-schedule-hub/releases/tag/v1.0.0）：
  | 文件 | 大小 | 系统 |
  |---|---|---|
  | `ShipScheduleHub_1.0.0_x64-setup.exe` | 25.9 MB | Windows 10/11 |
  | `ShipScheduleHub_1.0.0_aarch64.dmg` | 42.1 MB | Mac M 系列 |
  | `ShipScheduleHub_1.0.0_x64.dmg` | 43.3 MB | Mac Intel |
- **零依赖已实测验证**（挂载 dmg 读真包，非 CI 自述）：`Contents/Resources/engine/node-bin/node` = **112.9 MB**、
  engine 12 项、11 个船司配方齐全 → 同事机器**不需要装 Node**；没 Chrome 时引擎自动下载 Chrome for Testing
- **踩坑（已修）**：CI 第一次 Windows 打包失败，报 ``icons/icon.ico` not found; required for generating
  a Windows Resource file during tauri-build` —— Tauri 在 Windows 上强制要 .ico，macOS 构建不需要所以本地不报。
  同时发现原图标是占位黑方块 → 用 `qa/make-icon.mjs`（SVG→1024 PNG，走 playwright-core 渲染）重做，
  `tauri icon` 生成全套
- **打包与源码一致性**：改 UI 后必须重打 tag 才会进安装包（本次 UI 折叠/对齐改动重出了一次）

### 9-30 · UI：卡片折叠 + 搜索框对齐（爹地要求 · 婉宜）

- 卡片头整条可点折叠/展开（事件委托挂 #statusList，重建 DOM 后仍有效；Enter/Space 可用）
- 指示箭头改**内联 SVG**：先试 10px 字体符号 `▾`，真机截图里几乎看不见还被压扁（视觉验收抓出来的）
- 搜索框「一高一低」真因：`.formbar` 用 `align-items:flex-end`，字段底部是港口识别提示，
  提示行数不同（起运港两行/目的港一行）→ 输入框被顶到不同高度；改 `flex-start` + 标签定高 + 按钮 margin-top:20px
- 实测（Playwright 量像素）：三输入框顶边极差 **0.0px**
- 新工具 `qa/ui-verify.mjs`：不开真实屏幕验 UI（Tauri 桩 + 事件回调捕获 + 量几何 + 点折叠 + 截图 + 数报错）

### 9-30 · Windows「点查询毫无反应」真因：装在盘符根目录（婉宜）

**现象**（爹地在另一台 Windows：PC-20260212GEZA，App 装在 `D:\` 根目录）：
装了 Chrome 也一样，点「并发查询」毫无反应，11 家全是「待查询」。

**定位过程**（这版新加的「错误条」直接把它逼出来了，否则还是一片安静）：
```
Error: EISDIR: illegal operation on a directory, lstat 'D:'
    at Object.real...
```
→ 出现**驱动器相对路径**（`D:` 光秃秃没反斜杠），Node 模块解析拿它做 `realpath` 直接抛错，
**引擎在启动阶段就死**，所以前端连一个事件都收不到 —— 表现为「毫无反应」而非「报错」。

**修复（v1.0.2）**：
- Rust `fix_root()`：路径形如 `D:`（长度 2、以冒号结尾）→ 补反斜杠；`project_root` 的三条返回路径
  （resource_dir / current_dir / 逐级向上找）与 `find_node` 全部过一遍
- Rust：给引擎**显式指定 TEMP/TMP/TMPDIR** 到 `<安装目录>/engine/.tmp`（系统 TEMP 指向盘符根时的兜底）
- Rust：`diagnose` 的引擎自检 cwd 从 root 改为 engine_dir
- 引擎：启动守卫（cwd 是光秃秃盘符就补分隔符 + 对驱动器相对入口脚本告警）
- 单测：`cargo test` 2 passed（`D:`→`D:\`；正常路径不受影响）

**教训**：① 报错可见性就是生产力 —— 没有错误条，这个 bug 会一直表现为「玄学没反应」；
② 不能假设安装目录长什么样，**盘符根是合法但极端的输入**；
③ 跨平台路径代码必须用平台的绝对路径语义（Windows 的 `D:` ≠ `D:\`）。

**建议**：安装时用默认目录（`%LOCALAPPDATA%\ShipScheduleHub`），别选盘符根目录。

### 9-30 · 船期详情：点一下看「航程 + 截单时间」（MSC 先行 · 婉宜）

爹地要求：点 MSC 官网的船期能看航程和截单时间，评估能否整合 → **能，而且零额外请求**。

**关键发现**：MSC 列表接口（我们已在用的 `SearchSailingRoutes`）的每条船期里**本来就带着**：
- `CutOffs`：**5 类截单时间** —— CY 截关 / VGM 截止 / 提单指示 / 危险品 / 冷藏箱
- `RouteScheduleLegDetails[]`：每段航程（起运/到达港 + **码头名** + ETD/ETA + 船名/**IMO/建造年/船旗** + 服务名 + **挂靠港序列** + 该段 CO₂）
- 顶层 `LoadingService` / `IsDirectRoute` / `RoutingType` / `TransitTime`

之前只取了 6 个字段（船名/航次/ETD/ETA/天数/直达），其余全丢。

**实现**：
- 引擎 `fastpath.mjs`：新增 `mscDetail()`，把上述字段归一化成 `detail: { service, routing, co2, legs[], cutoffs{} }`，
  挂在每条船期行上（**严格按官网返回值，不做任何推断/换算**）
- 前端：船期行整行可点 → 行内展开（与卡片折叠同一套事件委托），上部航程、下部截单时间；
  截单用 `display: contents` + 父级 grid 做到 label/value 严格两列对齐
- 数据关系已核对：每班的截单与**它自己的 ETD** 是对应的（10.17 开船→10.04 截关、11.21 开船→11.15 截关），字段没取错
- 验收：harness 第 ⑥ 节（可展开行 → 点开 → 航程段 1 / 截单项 5 / 再点收起）+ 截图目视

**待办**：其他 10 家逐家探测同类字段（ONE/ZIM/COSCO 已知有 `cutoffCY` 但前端未显示 → 下一步接进同一视图）。

### 9-30 · 船期详情扩面：马士基 / 赫伯罗特 / 达飞（婉宜）

| 船司 | 航程分段 | 截单时间 | 来源 |
|---|---|---|---|
| **赫伯罗特** | ✅ 2 段真实中转（宁波→塞得港→伊斯坦布尔，换船换服务）| **9 类**（FCO/LCO/VCO/DOC/SHI/DGD/OOG/REF/DBC）| `routes[].legs[]` + `gateInCutOffDateTimes[]` |
| **马士基** | ✅ 2 段（含设施码 CNNPOMT/EGPSDTM/TRAMBKP + 服务名）| 未取（截单在另一个接口）| `routings[].routingLegs[].carriage` |
| **达飞** | 未取 | 1 类（官网卡里的 Port Cut-off 原文）| 正则原本就匹配了这一行，之前用非捕获组丢掉了 |

实现要点：
- 新增通用 `mkDetail()` 归一化（service/routing/co2/legs[]/cutoffs{}）+ `dedupeLegs()`（同一「起运港+开船时间」= 一班实体）
- 马士基只给设施码 → 首尾港口名用查询上下文补齐，中间的查端口词典
- 赫伯罗特截单是**官网自己的编码** → 代码原样显示，括号里只加中文备注；未收录的码（DBC）不猜
- 调试钩子：`SSH_DUMP_RAW=maersk`（落盘原始响应）、`SSH_DUMP_DOM=<carrier>`（落盘结果页文本），后面探针都能复用

覆盖进度：**7 家**已有详情（MSC/ONE/阳明/COSCO/ZIM/赫伯罗特/马士基/达飞），剩 3 家 DOM（长荣/OOCL/HMM）正在挖。

### 9-30 · 船期详情全 11 家覆盖完成 + 修长荣开船日错误（婉宜）

**最终覆盖**（宁波→伊斯坦布尔，实测 11/11 家 102 条，天数自洽 73/73）：

| 船司 | 截单类数 | 航程段 | 说明 |
|---|---|---|---|
| MSC | 5 | 1 | CY/VGM/提单指示/危险品/冷藏 + 码头 + 挂靠港序列 |
| 赫伯罗特 | 9 | 2 | 官网代码原样 + 中文备注；真实中转（宁波→塞得港→伊斯坦布尔）|
| ONE | 3 | 1 | cct/dct/inlandCct + 码头名 |
| 阳明 | 3 | 1 | CY/SI/VGM + 码头名 |
| HMM | 3 | 0 | Inland/Port/DOC Cut-off（官网原值，"Unavailable" 照实标）|
| OOCL | 2 | 0 | CY/SI Cutoff |
| 长荣 | 2 | 0 | Port Cut Off + VGM（**顺带修了开船日 bug，见下**）|
| COSCO | 1 | 1 | CY 截关 + 分段 |
| 达飞 | 1 | 0 | 卡里的 Port Cut-off |
| 马士基 | 0 | 2 | 分段（设施码+服务名）；截单在另一个接口，未取 |
| ZIM | 0 | 5 | 分段；官网接口无截单字段 |

**长荣真 bug（重要）**：原来的 `etd` 取的是 **Port Cut Off Date（截单日）**，不是开船日 —— 用官网
Transit Time 列反推实锤（OCT-10→NOV-14=35 天但官网写 33；改取 OCT-12→NOV-14=33 ✓）。
修后 **7/7 条天数自洽**（修前 0/7）。教训：**抽取字段必须用站内其它列交叉验证**（天数/ETA 就是最好的校验器）。

调试钩子（复用价值高）：`SSH_DUMP_RAW=<carrier>` 落盘原始响应、`SSH_DUMP_DOM=<carrier>` 落盘结果页文本
与表格结构 —— 探针不必再重写请求，直接跑引擎就能拿到原始数据。

### 9-30 · 修「查询中换港口再点查询会报错」（婉宜）

爹地实测：正在查询时改港口再点「并发查询」→ 报错。

**真因（前端状态机）**：`invoke('run_query')` 只是「启动成功」，引擎还在跑；但旧代码在
`finally` 里就把 `engineRunning = false`、按钮解禁了（而且 `if (engineRunning) return` 让运行中点击被静默吞）。
于是查询中点第二次 → Rust 侧 `state.running` 仍为 true → 返回 Err("engine 已在运行") → 全卡片变「启动失败」。

**修法（两层）**：
1. 前端：`engineRunning` 只在 `engine-exit / engine-error / 启动失败` 时复位；
   查询中点「并发查询」= **排队重查**：先 `stop_query`，等 `engine-exit` 自动开新查询（8 秒兜底强制解锁）。
   按钮运行中**不禁用**，文案变「重新查询（先停当前）」——禁用会让人以为卡死。
2. Rust：`run_query` 遇到「已在运行」不再报错，而是**先杀旧引擎（taskkill /T 或 kill）再继续**，
   作为前端漏判时的兜底。

验收：harness 第 ⑦ 节 —— 第一次点 → `run_query`；查询中再点 → `stop_query` + 提示语 + **无错误条**；
旧引擎 `engine-exit` 后 → 自动 `run_query`（新条件 Qingdao→Rotterdam）。0 JS 报错。

### 9-30 · 逆着逻辑做刁钻测试（婉宜）

**引擎侧**（`qa` 之外的临时台，20 个用例：同港/空港/1 字符/不存在/中文/大小写/形似参数/注入/非法日期/超长/
特殊字符/空船司/未知船司/重复船司/batch 边界/缺参数）—— 见下方结论。

**已发现的真隐患（前端）**：
1. **近似匹配被伪装成精确识别**：输入 `shan`（想打 Shanghai）词典前缀匹配到**爱尔兰 Shannon (CANON)**，
   而界面照样显示「✅ 识别为 Shannon」→ 用户以为查的是上海，可能拿着错港口的船期去报价。
   修：`matchPort` 区分 精确/前缀/包含；非精确 → 黄色「⚠️ 近似匹配 X（不是精确名称，请确认）」；
   词典里没有 → 黄色「词典里没有「xx」…建议用英文港名」。
2. **拼错/未识别的港口会一路退到浏览器抓取**（每家 40-90 秒 × 11 家），而不是快速失败。
   （暂按现状保留：DOM 家确实能处理自由文本；但配合上面的黄色警告，用户能在点查询前就发现拼错。）

#### 刁钻测试结论（引擎侧，20 + 12 用例）

**真 bug（已修）**
| 现象 | 危害 | 修法 |
|---|---|---|
| `--carriers ''` 静默变成**查全部** | 11 家浏览器抓取，白等十几分钟；用户以为只查了一家 | 省略参数才算"全部"；显式空串 → fail fast 退出 2 |
| `--carriers one,one` 把同一家**跑两遍** | 2 条同家状态、条数翻倍（CLI/脚本可达） | 入口去重 + stderr 提示忽略了谁 |
| 船司名写错（`foo`）不报错 | 只回一句含糊的「没有选中任何船司」，用户不知道是名字错 | 列出可用 id 并退出 2 |
| `--date 2026-13-45` 不校验 | 带垃圾日期查站点，每家 40-90s 才发现查不到 | 真日历校验（Date 回读），0.2s 拦下 |

**冤枉的（防护本来就对，别改）**
- 空起运港 / 1 个字符 / 缺 `--destination` / `--origin -x` / `--origin --carriers`：全部退出 2 fail-fast ✅
  （`--origin -x` 没被当成参数吃掉，说明 argv 解析没洞）
- 500 字超长港名、含引号/尖括号特殊字符：不崩、不乱匹配 ✅
- `--batch 0` / `--batch 999`：不挂、不崩 ✅（Rust 固定传 12，UI 不可达）
- 不存在的港 / 中文港名 / 过去·未来日期：退出 0、0 条、约 20s —— 是**业务答案**（那航线确实没船），
  不是故障；代价是它仍会走一遍浏览器抓取（慢）。配合前端黄色警告可让用户在点查询前发现拼错。

**测试方法学的坑（自己的问题，记下别重犯）**
- 第一版测试台没限定 `--carriers`，未知输入全部退到"11 家浏览器抓取"，被自己的 120s 上限判成"超时"——
  **假故障**。重测时一律显式 `--carriers one`，单例 2-25s 出结论，噪音归零。

### 10-08 · Windows 适配：PATH 不全的兜底（婉宜）

真机线索：那台 Windows 的 PATH 里**连 System32 都没有**（脚本用 `fltmc` 时报「不是内部或外部命令」）。
这解释了 app「点了没反应」的一部分成因（引擎启动/清理浏览器都要走系统命令）。

改动（凡是用系统命令的地方一律绝对路径，不再假设 PATH 可用）：
| 位置 | 原来 | 现在 |
|---|---|---|
| Rust open_url(win) | `cmd /C start` | `%SystemRoot%\System32\cmd.exe` |
| Rust node 探测(win) | `cmd /C where node` | `%SystemRoot%\System32\cmd.exe` + `where.exe` |
| Rust 杀引擎(win) | `taskkill` | `%SystemRoot%\System32\taskkill.exe` |
| 引擎 browser.mjs | `powershell`/`taskkill` | PS_EXE / TASKKILL_EXE 绝对路径常量 |
| 引擎 fastpath.mjs | `powershell` | 同上（从 browser.mjs 导入） |
| 调试脚本 .bat | `net`/`reg`/`findstr`/`powershell` | 全部 `%SYS32%\...` |

配套：诊断面板新增「安装目录/可写性、可用浏览器、WebView2、是否管理员、TEMP/NODE_PATH/代理（裸盘符标红）」；
新增「复制诊断」按钮；NSIS 安装包支持**仅当前用户安装**（同事没管理员权限也能装）+ 简体中文界面；
WebView2 改 embedBootstrapper+silent（老 Win10 缺运行时不白屏）。

踩坑台账（脚本侧）：
- v1 用 `fltmc` 判管理员 → PATH 不全时误判「无权限」→ **无限提权弹窗**（爹地实测）。
  改：三重探测（net session / PowerShell WindowsPrincipal / reg 写测试）+ 提权带 `--elevated` 标记，
  主体见到标记绝不再提权（结构上不可能循环）。
- v2 生成器用普通字符串写模板，`\WindowsPowerShell\v1.0` 的 `\v` 被 Python 解析成垂直制表符、
  `\net.exe` 的 `\n` 被解析成换行 → 生成的 bat 里路径损坏、整行消失。改：raw f-string + 生成即自检
  （控制字符断言 + 关键路径断言，坏 bat 直接中止不外发）。

## 2026-10-08 · Windows 观感定稿 + 本地交叉编译打通
- **Windows 不做整窗透明（结论）**：运行时 `set_effects(Acrylic)` 已生效（留痕 `%LOCALAPPDATA%\ShipScheduleHub\glass.log` 显示 `acrylic OK`），但 Win10 的 DWM acrylic 绘制在 webview 之后，而 WebView2 自身是不透明白底 → 看不见透出。要真透出必须 `decorations:false` 自绘窗口按钮，代价大且违背爹地「别太透」的诉求。故 Windows = 实底 `--bg` + 面层少量半透明做纵深（CSS 全在 `html[data-platform="win"]` 前缀内，macOS 零改动）。
- **本地交叉编译 Windows exe（打通，替代等 CI）**：`cargo xwin build --release --features tauri/custom-protocol --target x86_64-pc-windows-msvc`，前置：`cargo install cargo-xwin` + llvm-mingw 的 bin 进 PATH（提供 `llvm-rc`）。**`--features tauri/custom-protocol` 不能少**（`tauri-build::is_dev() = !custom_protocol`，漏了会编出 dev 版：webview 去连 `localhost:1420` → 页面 ERR_CONNECTION_REFUSED）。
- **坑**：cargo 若显示 `Finished in 0.27s` 说明没重编（前端是编译期内嵌，必须 `touch src-tauri/src/lib.rs` 触发）。
- **静默远端验收法**：用 `schtasks /create ... /it`（无需密码）在用户交互会话里跑 App/截图；脚本一律 `powershell -WindowStyle Hidden`，否则会在爹地桌面弹控制台窗口（踩过）。

## 2026-10-08 · Windows 定稿：不要毛玻璃（爹地真机拍板）
- 真机 A/B（i5-7500 + Intel HD 630 核显）：同样拖 4 秒窗口，开毛玻璃 DWM CPU 828ms / 关闭 375ms（2.2 倍）；
  实测 SetWindowPos 本身仅 0.7ms（**之前"每帧 35ms"是测速脚本自身开销，已作废**）。
- 逐项排除后确认：卡的是**透明窗口**本身（全关 CSS 仍卡 → 换成 transparent:false 就不卡）。爹地拍板：Windows 不要毛玻璃。
- 落地：`src-tauri/tauri.windows.conf.json`（Tauri v2 平台专属配置）把 `transparent` 设为 false、
  去掉 windowEffects、shadow 设 true；Rust 端 Windows 默认 `SSH_GLASS=off`；CSS `html[data-platform="win"]` 实底 + 全局禁 backdrop-filter。
  **macOS 的 vibrancy/毛玻璃一字未改。**
- 验证手段（可复用）：`GetWindowLongPtr(h, GWL_EXSTYLE)` 看 `WS_EX_NOREDIRECTIONBITMAP`(0x00200000)
  —— 有=透明窗口，无=不透明；拿记事本做对照。

## 2026-10-08 · 港口英文名识别加固（爹地要求：只看英文名，要能正确识别 + 对上船司名录）
- 新增 `data/port-aka.json`（620 别名：市场名/旧名/缩写/常见拼错，全部经词典核验）+ `data/major-ports.json`（39 主干港排名）
- 解析器加**归一化 + 别名 + 多源排序**（人工优先表 > 公开排名 > MSC 名录 > 多家船司别名命中；**不看单一船司**）
- 修复：Portland→USPDX（原澳大利亚）、Alexandria→EGALY（原美国小镇）、**SHA→上海（原静默查沙迦）**、Genoa/Chittagong/Pusan/Port-of-Spain 从查不到变命中
- 新增两个可复跑测试：`qa/port-compat.mjs`（130 例全过）、`qa/port-hint-verify.mjs`（界面提示 11 例全过）
- 详见 docs/port-recognition.md

## 代码冻结（等复核跑完再动）
本轮填表修复已收口：填表用短前缀、macOS 清框 Meta+A、候选读 textContent、候选查找加 listbox 语义子项与 ARIA 层、pickOption 不再盲点/键盘兜底默认关。**复核跑完前不再改引擎代码。**


## 2026-10-09 突破：填表改用「船司自己的叫法」（爹地情报驱动）

爹地铁证：马士基对这两个港的**正确搜索名**是 `Xingang`（天津）和 `Ambarli`（伊斯坦布尔）。
排查发现三层断裂，全修：
1. **解析层**：`resolvePort` 现在会汇集三个来源的候选 —— ①本条目该船司别名 ②同组港条目的该船司别名
   ③全库"别名文本含本港名"的该船司别名（Ambarli 挂在另一个条目上，靠第③条捞到）；排序原则：
   **与词典港名不同的候选优先**（船司特意起别名=它不按我们的名字叫）。
2. **传递层**：`resolved.alts` 之前没随返回值传出（断链）→ portVariants 拿不到备选。
3. **配方层**：马士基配方目的/起运词序改为**船司叫法优先**（原来 dName 排第一 → 永远先填 Istanbul ✗）。

**实测**：maersk 天津→伊斯坦布尔 = `API 直取（Xingang → Ambarli Port Istanbul）4 条` ✓（修前 0 条 No schedules）。


## 2026-10-09 收口（以星/阳明复活 + 静默补漏）

**以星 ZIM（从 0 → 11 条）**：站点改版，旧入口 `/tools/schedules` 已 404。重写为"正路"：
① 先调它的 `digitalMasterData/Locations/v1/p2p-route` 解析港口（**挑 locationType 含 MARINE 的**——能装船的那个），
拿到它自己的码（`CNNGB;10` / `ILASH;10`，后缀不可猜；我们词典的 ILASD ≠ ZIM 的 ILASH）；
② 再调 `digitalSchedules/PointToPoint/v2`（WeeksAhead=12 退 6）。实测宁波→阿什杜德 **11 条**。

**阳明（从 0 → 7 条）**：病因 = **通知弹窗挡表单** + 无头指纹被识破。
弹窗三层盾 + 真指纹（有头+CDP最小化）+ 网络抖动重试 → 实测 **7 条**。

**静默补漏（爹地指正）**：真指纹模式（有头）虽窗口最小化，但 **Chrome 会出现在 Dock/Cmd-Tab** ——
原先的静默检查只查"屏幕可见窗口"，漏了这一层。修：按 pid 精准隐藏（绝不碰用户自己的 Chrome）+
**每 1.5 秒盯守**（单次隐藏会被 Chrome 激活后复原，实测泄露 20s）。验证：60 秒采样**泄露 0 次** ✓。

**环境**：爹地机器的 Clash 节点当时卡在死节点（香港02），已切到 3/3 稳定节点；
诊断/切换走 clash-domestic-services 技能脚本。

**教训**：①"站点改版→抄它自己的接口"（记录在 web-scraping 技能）②静默判据必须含 Dock 层
③限流（少查+缓存）≠ 指纹硬拦（真指纹）——今天把后者误删过一次，已恢复。

## 芝麻仓（不在关键路径、排队等）
- 长荣配方去重：DOM 里同一行出现两份（实测 20 条里 7 条重复）→ 建议在配方抽取时就按「船名+航次+ETD」去重（前端已兜底，但消息里的条数会偏大）。
- 船名显示：MSC 数据里的 `TBN`（To Be Nominated）在界面上改成「待定」更易懂。
- 变体顺序优化：把「同组港名的短尾」（如 Xingang）提到第 3 位（现在排第 4，60 秒预算常试不到）——等 sweep 结论后改。

- 候选轮询默认 30 次 → 拟降到 14 次（每个写法省 ~20 秒，让 60 秒预算内能试完更多写法）。**等本轮 sweep 跑完再改**。
- 版本号：本轮修复验证通过后升 1.1.2（便于区分「哪版在测」）。

## 10-09/10 船司码头码 ≠ 联合国码（爹地实锤，本日最大修复）
爹地问："qingdao 怎么会是 CNQIN 不是 CNTAO？" —— 两队都对：联合国码 CNQIN，**但各家船司自己用 CNTAO**（MSC 官方表 `('QINGDAO','CNTAO')`、ONE 直测 CNQIN→0/CNTAO→7、阳明 CNQIN→0/CNTAO→11）。旧实现拿联合国码直发各船司接口 → 青岛这类港全部静默"无服务" → 观感="很多家 API 坏了"。
**修法**：`db/ports.db` 新表 `carrier_codes(carrier,unlocode,their_code,source)`（种子全带实测证据）；`query.mjs::portCodes()` 优先船司自己的码；MSC 适配器加港名兜底（`findPort` 码→名）；fastpath 预通道补 `o.carrier/d.carrier` 标记。**实测**：MSC 青岛→格但斯克 11s/12 条、ONE 3 条、阳明 青岛→汉堡 1.4s/10 条（修前 0）。

## 10-10 名录彻查（Exa 权威源 + 船司实测）—— 码头码体系全解
**真相**：联合国 2025 新码表把 CNSHA/CNTAO/CNNGB/CNXMN 归为「机场」，港口用新码（CNSHG/CNQDG/CNNBG/CNXMG…）；**但全行业（船司系统、订舱、提单惯例）走老码** ✗。我们词典 = 联合国口径 → 拿新码直发船司 = 静默"无服务" ✗。
**实测矩阵**（ONE 直测）：上海 CNSHG=21/CNSHA=5/CNSGH=0 ✗；宁波 CNNGB=18/CNNBG=0 ✗；青岛 CNTAO=11/CNQIN=0 ✗；天津 CNTXG=12/CNTNJ=0 ✗；深圳 CNSZX=17/CNSZP=0 ✗；厦门 CNXMN=14/CNXMG=0 ✗；南沙 CNNSA=21 ✓；盐田 CNYTN ✓。MSC 官方表同口径（QINGDAO→CNTAO、SHANGHAI→CNSHA…19 条自动映射入库）。
**修法**：① carrier_codes 映射表（msc 全量自动 + one/ym 实测；船司码最优先取数）② MSC/适配器港名兜底 ③ 显示层 display-codes.json（界面显示行业码 CNTAO，内部保持双轨）④ 老码输入识别（cntao/cnsha/cnszx/cnxmn/cndlc → 正常解析）。**待办**：阳明限流冷却后补测其余港。

## 10-10 外部调研（Exa）——「有没有人做过类似工具」
**结论：没有现成的可直接借的同类。** 存在的都差一层：
- `neckchi/schedulehub`（Go，聚合13家船司 API）——架构最像，**但仓库已不可见/私有**，且它走的是船司官方合作 API（要密钥）；只能当参照系。
- 单家 scraper 类：`Quang7hong81/shipping-data`（MSC 站内 API + Maersk + Routescanner，GPL）——MSC 方法与我们同源（现在比它多 dataSourceId+页面上下文）；Routescanner 聚合站可作为未来兜底源备选。
- CSDN 实践者（Makasa）：COSCO/ZIM/MSK/MSC/ONE/PIL 都通了，**OOCL/CMA/HPL 加密破不了** —— 与我们撞同一堵墙（旁证：这三家就是行业公认的硬骨头）。
- MCP 商业服务（trackingmcp/schedulesmcp 等）：托管收费，无源码；可作对拍基准。
- **官方旁路**：中远 Open API（cop-cos/COP，免费试运行，1000次/天）；DCSA T&T 标准（9 家船司成员，正式接口）；Routescanner（聚合平台）。
**真正抄到的**：`data/smdg-terminal-codes.csv` —— SMDG（UN/CEFACT 官方子名单）码头终端代码表：UNLOCODE ↔ Alternative UNLOCODE（官方认定 CNQIN↔CNQDG、CNSGH↔CNSHG、CNTNJ↔CNTXG、CNXAM↔CNXMG）+ 每个码头的终端代码/运营公司/坐标。用途：终端级后续功能 + 码表核对。

## 10-10 二轮实测修复（爹地三连截图：OOCL/阳明/HMM 报空）
- **阳明 天津 = CNXGG**（它自己 GetLocations 接口："XINGANG, TJ (CNXGG)"）——之前七个码全试过就是没试这个。CNXGG→ILASH=5 条、→DEHAM=13 条。已种映射（CNTNJ/CNTXG/CNTNG→CNXGG）。
- **OOCL** 实为好家：验证码=抽签，ε 次重试后常过（42s/12 条）。失败时不再装"0 条"——如实报 "Blocked by human verification"；重试 2→3 次。
- **HMM** 直连会被给"门户壳"（无表单）→ 加"先回首页热身再进"；实测站点自己确认 天津→Ashdod=0（非我方 bug）。
- **qa/run-engine-isolated.sh** 修：显式 SSH_PROFILE_DIR 优先（原来永远覆盖成新档，导致调试全部失准）。
- 自测工具新招：**带 App 档案的克隆**（cp -Rc 秒拷）跑调试 = 复现真 cookie 环境。
- 终验 天津→阿什杜德：**7家出船 68 条**（ym 3/one 6/msc 7/maersk 9/zim 11/evergreen 20/oocl 12）；cma+hapag=IP 限（自愈）、cosco=站方无此线、hmm=拦（凉后自解）。

## 10-10 零配额验证法（爹地：'有没有更聪明的办法验证，又不影响结果'）
**旧法之弊**：跑航线验证=烧船司配额+伤 IP 声誉（当天达飞/Hapag 被拦的帮凶）。
**新法三层**：
1. **自证免验**：船司自己的词表/官方表直接采信（YM GetLocations、MSC 官方表、ZIM Locations）——不再逐条跑航线。
2. **不抢占**：未自证候选（跨司推测）排在我们自家码**后面**，只作兜底 → 出船行为零改变。
3. **验证随使用**：真实查询中赢家码自动记入 `DATA_DIR/learned-codes.json`，下次置顶。实测：降级青岛映射 → 跑查询 → 自动 [learn] yangming|CNQIN→CNTAO 并保持出 10 条。
**信任分级**：source 含 直测/实测/官方表/官方词表 = verified（优先）；其余 = 兜底。迁移：48 条映射（YM 词表深挖 +9，ONE 兜底 +3）。
另外：**MSC 的 ERR_CONNECTION_CLOSED 实为 Clash 节点死（香港01）**——切香港02 后 17 条正常。网络自愈走 clash 技能脚本 + 手动切节点（自动选择切换 HTTP 400 曾失败，手动 PUT 直接切成功）。

## 10-10 三批修复（"万无一失"大排查：5航线×11家=55格）
**第一轮**（长荣-厦门/以星-上海/厦门/HMM-青岛/厦门/COSCO-天津）：8 个稳定复现问题，全部修复并单科验证：
- **码形态别名注入候选表**（机制级修复）：识别用 aka（cntao/cnsnh/cnxmn/cnxia/cnxng…311 条/300 港）自动进 portCodes 候选 → 长荣 [CNXMN]、Hapag CNTAO/CNXMN、HMM CNTAO 匹配全通。首版 bug：别名查询放在了 db.close() 之后被静默吞 → 挪到关库前。
- **ZIM**：名字变体兜底（"Shanghai Pt"→"Shanghai"）；上海=CNSNH;10、厦门=CNXIA;10、天津=CNXNG;10（实测）；NLRTM 双向 Bad Request=不卖（如实报 "No service (site API confirmed)"，不再傻等 DOM）；noService 路径补 fastpath 护栏防重复 emit。
- **HMM**：候选循环缩肥（3×18×900ms→2×12×750ms）+ 结果等待 40s→24s + timeout 60→80s（原来最坏 48s×2 场必爆）。
- **COSCO**：天津必须用 'xingang'（'tianjin' 前缀返回 CNTKX/CNTED 干扰项 → 单选必错 → No Data）；实测 天津→阿什杜德 31 条（修前 No Data）。
- **验证结果**：zim 上海→汉堡 8 ✓/上海→鹿特丹如实无服务 ✓/厦门→汉堡 12 ✓；HMM 青岛→格但斯克 8 ✓/厦门→鹿特丹 8 ✓；长荣 厦门→鹿特丹 20 ✓；COSCO 天津→阿什杜德 31 ✓；Hapag 青岛→格但斯克 12 ✓/厦门→鹿特丹 12 ✓。
- **达飞**：DataDome 仍按 IP 拦（网络层，非代码）——消息如实。**阳明 青岛→格但斯克 = 真无服务**（三码实测皆 0）。
- 教训：**同一个 browser-profile 克隆不能并发跑两个测试**（互相踩，报 "browser has been closed"）。

## 10-10 达飞误报大案（v1.2.4）
**症状**：达飞全天被报"被 DataDome 人机验证拦住"，从早到晚 0 条。
**真相**：CMA 正常页面本身就带 `<script src="https://js.datadome.co/tags.js">`（DataDome 监控标签）；10-09 加的拦截判定是"前 6000 字符出现 datadome/captcha-delivery 字样"→ 正常页面全被误判。**证据**：证据截图里页面完全正常（表单都在），页面探针 i2=205 处即 tags.js。**修正**：判定改为"URL/iframe 真落在 captcha-delivery.com 且搜索表单不存在"才算拦截。
**实测**（修后）：宁波→汉堡 10 ✓、青岛→格但斯克 10 ✓、厦门→鹿特丹 10 ✓、上海→汉堡 10 ✓、天津→汉堡 6 ✓、天津→阿什杜德=站方"No solution"（真无解）。
**教训**：拦截判定必须用**正面证据**（挑战域 URL/iframe），不能拿"页面字样出现即拦"——正常页面自带监控标签会误报（"Safari 正常"是破了此案的钥匙）。

## 10-12 自动识别补课（第二批：无前缀业务号 + ONE 官方口径）
**症状**：爹地实测「除 Maersk 外都认不出」+ 复测 `181AS0266823514M1` 依旧无识别。
**根因**：识别器只认「SCAC 前缀 / 箱号 / 少量订舱形态」；真实业务号的两类盲区——①无 SCAC 前缀的承运号（MSC 181 系列、ONE 后 12 位）；②11 位提单型被箱号校验误杀（第一批 scac-loose 已修）。
**修复（两批合并）**：
- `scac-loose`：4 字母+7 数字且前 4 位是提单前缀 → 低置信放行（`MSKU3077039` 对照仍拒）。
- **MSC 181 系列**：`^181[A-Z]{2}[A-Z0-9]{5,}$` → MSC（0.6 自动；181AS0266823514M1 缓存+live 双实证，SHEKOU→ISTANBUL）。
- **ONE 官方两种后 12 位形态**：3 字母+9 数字 / 4 字母+8 数字 → ONE（0.6 自动）。带 ONEY 前缀自动剥（适配器已做，本轮 e2e 验证：`ONEYSZPG70884900`→`SZPG70884900` 南沙→温哥华 40 事件）。
- 调研来源：one-line.com 官网口径 + Vizion《Bill of lading number formatting》全表（2026-10-12 Exa 检索，各家 MBL 形态对照：Maersk 9 数字 / MSC=MEDU+2+6 / ONE 后 12 位两种形态 / Hapag=HLCU+…16 位 / Evergreen 12 数字 / OOCL 10 数字 / YM 1 字母+9 数字 / ZIM 3 字母+4-7 数字 等）。
**验证**：identify 106/0；ui-track-verify 离线回放全绿（静默 0→0）；实机 selftest `181AS0266823514M1` → 自动识别 MSC、结果卡 SHEKOU→ISTANBUL（MSC METTE，ETA 11-13）；部署 /Applications（09:49 构建）。
**调研**：11 家船司「单号格式 × 识别规则 × 查询方法」全量调研完成（Exa 检索 R1/R2 来源 + 我方实证对照）→ `docs/CARRIER-NUMBER-FORMATS.md`（10-12；含识别器差距清单待拍板）。
**第三批（候选补充，10-12 爹地圈选后落地）**：10 位纯数字 → COSCO/OOCL 候选、12 位纯数字 → Evergreen 候选（均 0.5、仅候选不自动）。验收：identify 108/0；UI 回放新增断言全绿；实机 5051645160 显示候选提示并拦在前端（不空跑引擎）；裸 10 位真号 `6469105960`（COSU 剥离形）手选 COSCO 直查成功（青岛→梅尔辛 11 事件/5 箱，真网）。
**ZIM 追踪接入（10-12 中午）**：`engine/tracking/zim.mjs`（页面内 fetch → apigw v2 complete-result；提单/箱号双形态解析）；真实样本 7 号全验、离线单元 23/0、识别器回归 108/0、UI 回放全绿；UI 下拉/说明含 ZIM；实机 selftest `ZIMUBCN10212938`（BARCELONA→NEW YORK · 10 events · Completed）；部署 /Applications（10:44 构建）。识别器 `tracking` 元数据修正（msc/cosco/hmm/one/zim → live）。**追踪线进度：6/11 家**（余 CMA/Evergreen/YM/OOCL 待规划；Hapag 被拦）。
**技术债**：`engine/track.mjs`（10-10 遗留、无调用、未跟踪）与 lib.rs 817 行 pkill 旧名单——候选清理，不影响功能。另：selftest 程序化填充不触发 input 事件（自检截图看不到动态 hint；真实输入路径经 Playwright 回放验证正常）——建议 selftest 填充处补 dispatch input。

## 2026-10-14 · App 自更新（检查更新 + App 内安装 + 交付前自检）

**需求来源**：爹地「帮我在本地的 app 加一个检查更新的按钮」→ 演进为「我要的是 app 内更新，而不是跳一个 github 页面让我自己下载安装」→ 最终「你能不能自己测试跑通了再交付给我」。

**实现（Tauri v2 官方 updater）**：
- 检查：启动 5s 后静默检查（24h 节流）+ 标题栏「检查更新」按钮（手动忽略节流）；优先 Tauri updater 插件（纯 Rust HTTP），失败退回匿名 GitHub API → 再退本机 gh 凭据兜底
- 安装：App 内下载 + 实时进度条（百分比 + MB）+ 自动重启，全程不跳浏览器
- 签名：minisign 密钥对（`~/.tauri/shipschedulehub.key`，公钥内嵌，私钥存 GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`）
- CI：构建注入签名 → 产出 `.app.tar.gz`/`.sig`/`.exe.sig` + `latest.json`（三平台清单）
- 端点：`releases/latest/download/latest.json`（仓库已转 PUBLIC，匿名可读）

**交付前自检机制（本轮最重要的方法论沉淀）**：
- `SSH_UPDATE_SELFTEST=1|full` 环境变量 → 在**真实 App 进程**内跑 检查→下载→(安装→重启)，逐步写日志后退出；启动即 `window.hide()`，不打扰屏幕
- 跑法：`.app` 复制到 `/private/tmp/`（**不能是 `/tmp`**，symlink 会被 updater 拒绝）→ 改三处版本号造旧版本 → 运行 binary
- **实测（1.4.6 → 1.4.7）**：① 发现新版 ✓ ② 下载 45.3MB（进度 10→100%）✓ ③ 安装成功 ✓ ④ 重启后版本变 1.4.7 ✓ —— 四步全通
- 沉淀：`skills/tauri-desktop-app/references/auto-update-and-selftest.md`

**踩坑清单（本轮）**：
1. `open_external` 有域名白名单（只放行维运网）→ GitHub Release 地址被静默拒绝，表现为「点立即更新没反应」
2. `@tauri-apps/plugin-process` 的 `relaunch()` 需 `process:*` 权限，未配报 `not allowed by ACL` → 改用核心 API `app.restart()`（零权限依赖）
3. **`cargo check` 通过 ≠ 二进制更新**：必须 `npm run tauri build`，并用 `strings -a <binary> | grep <新常量>` 核验（本轮因此对着旧 binary 排查很久）
4. Tauri updater 版本读**编译期**值（`tauri.conf.json` 的 version 优先级最高）；改 bundle 的 Info.plist 无效
5. CI：**macOS 必须 `--bundles dmg,app`**，只写 `dmg` 不产 updater 产物；平台产物命名要与 `latest.json` 里查的名字一致（`_arm64` vs `_aarch64` 曾致平台缺失）
6. 匿名 GitHub API 有共享出口 IP 限流（60/h）→ 本机 gh 凭据兜底（5000/h）

**版本线**：1.4.0（截单）→ 1.4.1（检查更新按钮）→ 1.4.2（验证用）→ 1.4.3（updater 基线）→ 1.4.4（App 内更新可见）→ 1.4.5（修重启）→ 1.4.6（自检通过基线）→ **1.4.7（当前 latest）**
**本机状态**：`/Applications` = 1.4.6（干净基线，等待爹地验证 1.4.6→1.4.7）

## 2026-10-14 续 · 更新体验三个 bug（爹地逐个实测报出）

**① 「检查更新」点了没反应** —— `open_external` 有域名白名单（只放行维运网），GitHub 地址被**静默拒绝**，且前端 `.catch(() => {})` 吞了错误。
修：白名单加本项目 GitHub 域名 + 失败路径给出可见提示。

**② 更新完安装成功但没重启** —— `@tauri-apps/plugin-process` 的 `relaunch()` 需要 `process:*` ACL 权限，未配报 `Command plugin:process|restart not allowed by ACL`。
修：改用核心 API `app.restart()`（零权限依赖），另加 Rust `restart_app` command。

**③ 更新完还提示「发现新版本 vX」（与当前版本相同）** —— **检查结果缓存 24h**；更新到新版本后缓存未失效，启动时直接拿旧 `hasUpdate` 弹窗。
修：缓存命中路径用**当前实际版本**重新判定（不再新则清缓存不弹）+ 更新安装成功后清 `STATE_KEY`/`SKIP_KEY`。
单测补「缓存陈旧」场景 → update-check **11/0**。

**④ 下载慢（国内直连 GitHub 被限速到 ~13 KB/s）** —— 实测 6 家镜像：`gh-proxy.com` 3+ MB/s 最快（另外 3 家连不上）。
修：CI 生成的 `latest.json` 里包地址加镜像前缀；updater `endpoints` 镜像优先 + GitHub 兜底。签名校验不受影响（镜像只转发字节）。

**交付前自检机制（本轮沉淀，已入技能）**：`SSH_UPDATE_SELFTEST=1|full` 环境变量 → 真实 App 进程内跑 检查→下载→安装→重启，窗口自动隐藏、逐步写日志后退出。跑法：复制 `.app` 到 `/private/tmp/`（不能 `/tmp`，symlink 会被 updater 拒）+ 改三处版本号造旧版本。本轮每个版本都这样验过才交付。
**版本线**：… → 1.4.7 → 1.4.8（镜像）→ 1.4.9（修重复提示）→ **1.5.0（全面审阅修复第一批 + 多箱提升，10-14 发布）**
**本机状态**：`/Applications` = **1.4.9**（等爹地点「检查更新」验收 → 1.5.0）

## 2026-10-14 续 · 全面审阅 + 修复批次一（v1.5.0）

**审阅**（只读，3 路独立并行 + 探针实测 + 行业对照）→ `docs/audit-2026-10-14/AUDIT.md`
- P0×2 / P1×14 / P2×55+；两个 P0 均由审阅人**亲手复现**（maersk 卡片 transitDays 取成航次号；追踪层把 EXPECTED 误标为「当前位置」）
- 健康项确认：ISO 6346 校验位算法与标准完全一致；静默红线落实严格

**修复 16 项**（全部带回归，18 套测试全绿；细节见 AUDIT.md §①.5）
- **P0×2**：maersk transitDays 改取天数段（口径与 API 对齐）；追踪 `current` 只认 ACTUAL（无 ACTUAL 时 null）
- **P1×13**：CLI 数值参数 fail fast；ONE 箱主码判型放宽（**真网验证 NYKU4974384 从"必查不到"→ ok:true**）；HAMG 单号正确路由 ONE；大结果不再被 64KB 管道截断（flushExit）；追踪总时长硬截止；one/msc eta 形状统一；zim 候选索引对齐；pickOnce/one pickPt 去盲点；OOCL direct 诚实降级（null + UI 三值）；配方超时声明与 60s 上限对齐
- **拍板四项**（爹地 10-14）：并发无红线 / COSU 不碰 / 60s 足够 / 多箱提升（**Hapag 详情 1→6 箱、YM 4→8 柜**）
- **P2 三件**：tracking-identify.md 文档漂移修正；缓存原子写（tmp+rename）；browser.mjs 注释对齐

**发布**：v1.5.0 三平台（macOS arm64/x64 + Windows，包址走 gh-proxy 镜像）；**更新自检 1.4.9→1.5.0 全链路四步通过**（检查→下载 47,471,607 bytes→安装→重启，版本已变）

**遗留**（后续批次）：B5 三家（msc/hapag/yangming）DOM 结果页解析（架构级）；A3 运行时被拦自动升级；P2 剩余按主题分批

## 2026-10-14 续 · 修复批次二（P2 三主题 + 诚实化，**未发布**）

**修复 9 项**（19 套离线测试全绿；细节见 AUDIT.md §①.6）——主题就是审阅列的三个：资源回收 / 静默失败 / 口径统一
- **资源回收**：新增 `engine/lib/reclaim.mjs`，证据目录运行产物滚动保留（`run-*.ndjson` 50 / `hapag-track-*.txt` 40，`SSH_KEEP_RUNS|DUMPS` 可覆盖）；引擎与追踪 CLI 启动各清一次 → 实测 **156→51 个 ndjson、5.8M→4.3M**，只清自己的产物
- **静默失败**：5 家配方结果页解析失败不再静默吞（写 stderr，诊断面板可见，不误弹横幅）；CA 兜底不再固定返回 200（透传真实状态码，403 曾被当成功）；`apiEmptyHint` 只写不读 → 落实「API 确认无此线则页面兜底只给 30s」
- **口径统一**：新增 `engine/lib/ua.mjs`（UA 单一来源，治 fastpath/tracking 三处写死 Chrome/140 与浏览器不一致）；`normalize.containerLabel()` 把 11 家 11 样的箱号尺寸/箱型统一成 `40'HC / 20'GP / 40'RF`（认不出才回退，绝不猜）；追踪 `CACHE_SCHEMA` 2→3
- **诚实化**：引擎致命错误且零结果 → `exit 1`（原来恒 0）

**验证**：19 套离线测试全绿（新增 reclaim / container-label 两套 + A2 回归）；真网 hmm 15 / maersk 8 / yangming 11 条船期；追踪真单 one·maersk·cosco·msc 标签统一；`qa/ui-track-verify.mjs` 离线 UI 回放 ALL PASS（含新增箱子标签断言）+ 屏幕窗口 **0→0**

**本机状态**：`/Applications` 仍是 **1.4.9**（批次一/二的源码都还没进安装包）——落地方式待爹地定：
**(A)** 本地 `ditto` 部署到 `/Applications`（即时能看到，但会绕过 updater 的版本叙事）；
**(B)** 版本升到 v1.5.1 → CI 三平台发布 → 爹地点「检查更新」验收（沿用 1.4.9→1.5.0 那条已验证的路）。
当前 local build 的 `dist/` 已是批次二源码；`/Applications` 未改动。

## 2026-10-15 · 更新下载 403 事故 + 多镜像兜底（v1.5.1，已发布并装机）

**爹地实报**：弹窗「发现新版本 v1.5.0 / 当前版本 v1.4.9」→ 点更新 **`Download request failed with status: 403 Forbidden`**。

**根因（当场实测复现，不是代码 bug）**：`gh-proxy.com` 对项目**全部**资源整体 403
（`Access to this resource is forbidden.`，连 `latest.json` 都拿不到）；而 GitHub 直连在国内超时 →
App 原本 endpoints = [gh-proxy 优先, GitHub 兜底]，**两条链路同时死** → 下载必 403。
（自检当时能通过，只是因为那一刻镜像还活着 —— **单镜像押注把风险留到了用户点更新的那一秒**。）

**修法（结构，不是换一家继续单点）**：
- CI 每次发版生成**3 份清单**：`latest.json`（GitHub 原始）/ `latest-ghfast.json` / `latest-ghproxy.json`，
  每份把包地址写成**自己**镜像的前缀（所有镜像转发的是同一份文件，清单里写死别家前缀会照样失败）
- App `endpoints` 依次兜底：`ghfast.top` → `ghproxy.net` → GitHub 原始
- 踩点实测（10-15）：ghfast.top 206 ✅ / ghproxy.net 206 ✅ / gh-proxy 403 ❌ / gitproxy.click 302

**发布与装机**：
- CI 首跑失败（我改脚本时漏 `import os` → `NameError`），tag 未产出资产 → 按纪律删 tag → 修 → 重打同名 tag
- 第二次 CI **success**，资产齐（3 份清单 + 2 dmg + 2 tar.gz + exe + sig）
- **旧版 endpoints 已编译进二进制、指向死镜像 → 自动更新永远走不通** ⇒ 手动装给爹地：
  从 `ghfast.top` 下载 45.2MB（4.2 MB/s）→ `ditto` 进 `/Applications`（旧版备份 `ShipScheduleHub.app.bak-1.4.9`）
  → `xattr -dr` → ad-hoc 重签 → 清 WebKit LocalStorage 检查节流
- **交付前自检**：1.5.1 本体跑 `SSH_UPDATE_SELFTEST=1` → 「① 检查成功：当前已是最新版」✓（走新镜像读到清单）；
  三条 endpoints 实测全 302 可达；二进制内 `ghfast.top` 存在；屏幕窗口/残留进程 **0**

**版本线**：… → 1.5.0（审阅修复批次一）→ **1.5.1（多镜像兜底 + 批次二 P2 九项，10-15 发布并已装本机）**
**本机状态**：`/Applications` = **1.5.1**（三态对齐：本机/源码/远端 latest 全 1.5.1，git `0 0`）
**顺手清理**：`/Applications` 里 20 个调试残留 `ShipScheduleHub.app.tmp-*`（约 1.5G）已删

## 2026-10-15 续 · v1.5.2（Windows 版本号 + 勾选记忆）+ 双端全功能验证

**v1.5.2 两项修复（爹地实报/要求）**：
- **Windows 顶栏版本号**：原 CSS `html[data-platform="win"] .topbar h1,.sub{display:none}` 把版本号
  连同产品名一起藏了（产品名冗余成立、版本号不是）→ 只藏 h1；Windows 上 .sub 文案改为纯版本号
- **船公司勾选记忆（全平台）**：勾选/取消即写 localStorage(`ssh.carrierSel`)，重开恢复；
  「全选/清空」联动；空集（全清）非合法选择态→重开回全选
- QA：`qa/carrier-persist-test.mjs`（无头 chromium 4 组断言），回归 22 套全绿

**Windows 真机验证（Tailscale SSH 静默通道，全程 0 弹窗）**：
- **自动更新全链路**：1.5.1→1.5.2（检查→下载 29.0MB 走 ghfast.top→安装→版本确认），21 秒完成替换
- **全功能双端对照（同输入同参数）**：

| 功能 | Mac | Windows | 一致性 |
|---|---|---|---|
| 船期全量（Ningbo→Istanbul） | 10 done + 1 opened(CMA)，条数 10/6/7/8/4/11/12/12/5/11 | 逐家同 status 同条数 | ✅ |
| 追踪·ONE 箱号 | ok（TACOMA→SURABAYA，1柜，2.4s） | ok（同结果，1.5s） | ✅ |
| 追踪·判型失败案例 | unknown-carrier（不硬猜） | 同 | ✅ |
| 追踪·Hapag 提单 | ok（137.6s） | 240s 撞 C4 截止（2 样本） | ⚠️ 波动 |
| 更新检查 | 已是最新 | 已是最新（发现新版时正常下载安装） | ✅ |
| 勾选记忆 | 探针 4 组全过 | GUI 真机（勾掉→重启→保持） | ✅ |
| 版本号显示 | 有 | v1.5.2 已显示（修复） | ✅ |
| 资源回收 | 生效 | 生效（run-*.ndjson 16/50） | ✅ |
| 静默红线 | 无窗口 | 0 窗口 | ✅ |

- **CMA 失败模式**：两端均"降级到打开页面"（Mac 超时/Windows 403，站侧反爬波动）
- **Hapag 差异（待观察）**：Windows 2 次样本均 240s 截止、Mac 1 次 137.6s 成功 →
  站侧本就 2-8 分钟波动；如复现稳定可考虑放宽 Hapag 追踪截止（须爹地拍板）
- **双端 debug 产出**：① Windows 版本号缺失（v1.5.2 已修）；② **45GP 误标 40'GP**（两端同病，
  已修 `3845433`：新增「2数+2纯字母」分支，LEN_OK 命中时按长度读；42GP/45G1 保持 ISO 语义）；
  ③ Hapag 截止放宽建议（240→400s，待拍板）

## 2026-10-15 续 · v1.5.3（Windows 审查修复批次）+ 全功能双端验证收官

**背景**：`t_d3517020` 卡被 dispatcher 派了独立 worker 并行审查同一台 Windows（它用独立目录
`ssh_review\`，与主线 `ssh-probe\` 零互污）。合并两边成果后产出 2 个我漏掉的真 P1：

- **W-1 [P1]** 引擎临时目录兜底静默失败（`lib.rs` 两处 `let _ = create_dir_all(engine/.tmp)`）：
  非管理员 + per-machine 装 Program Files → 建不出 → TEMP 指向死目录 → Playwright
  `ENOENT mkdtemp` → **浏览器类船司全灭**（worker 复现 + 主线亲复现：对照 7 条 vs 0 条 exit 1）。
  修：tmp 移到数据目录（LOCALAPPDATA|~/Library/Application Support）+ 建失败不再覆盖系统 TEMP。
- **W-2 [P1]** `ua.mjs` 硬编码 macOS Chrome 路径 → Windows 每次重跑失败命令 + 回退 Mac UA。
  修：命令路径/UA 模板/兜底串三者按平台分支。
- W-3/4/5（P2）：诊断面板噪音随 W-2 消失；.tmp 移出 Program Files（随 W-1）；清
  `tauri.windows.conf.json` 的 macOS 死配置。
- 另：45GP 箱型显示修复（`3845433`，45 尺柜曾标 40'GP）。

**发布与验证（v1.5.3）**：
- 全量回归 22/22 + one-deep 单验通过；cargo check ✓
- **Windows 自动更新第 3 次实测**：1.5.2→1.5.3（36s，走 ghfast.top）
- **复验四连**：版本 1.5.3 ✓ / **UA 已是 Windows 串** ✓ / **数据目录 .tmp 由 App 创建**（mtime 实测）✓ /
  **包内引擎纯函数 `45GP→45'GP`** ✓ / 船期单家 14 条健康 ✓
- Hapag 实网在 Windows 侧连续 4 次撞 240s 截止（Mac 侧 1 次 137.6s 成功）→ 站侧对该机器网络慢，
  列为观察项（如需要可把 Hapag 截止放宽，待爹地拍板）
- 收尾：计划任务/进程/我们的 Chrome 全部清零、工作目录（两个 66MB）已删、光标归位

**版本线**：… → 1.5.2（版本号+勾选记忆）→ **1.5.3（Windows 审查修复批次，10-15 发布装机）**

## 2026-10-15 续 · v1.5.4（Hapag 追踪截止放宽 400s）

**爹地拍板**（10-15 下午）：「可以放宽截止时间」——Hapag 的 CF 双模流程（无头→挑战→有头过盾）
固有耗时 2-8 分钟，默认 240s（timeoutMs×4）常态撞线（Windows 实测连续 4 次 240s+；Mac 1 次 137.6s 成功）。

**机制（按家可声明，不再一刀切）**：
- 适配器可 `export const deadlineMs` 声明整次追踪硬截止；registry 的 `computeDeadlineMs` 纯函数计算
- 优先级：`env(SSH_TRACK_DEADLINE_MS)` > 适配器声明 > `timeoutMs×4`
- `hapag.mjs` 声明 400000；其余 10 家不变（240s）
- 单测 `qa/track-deadline-unit.mjs`（优先级+声明核验）；全量回归 23/23

**发布与装机**：v1.5.4（CI success，13 资产）→ **Windows 自动更新 1.5.3→1.5.4（84s，第 4 次链路实测）**
→ **Mac 手动装 1.5.4**（爹地主机从 1.5.1 升上来，备份 `.bak-1.5.1`，更新检查自检通过）。

**版本线**：… → 1.5.3（审查修复批次）→ **1.5.4（Hapag 400s，10-15 双端装机）**

## 2026-10-15 续 · v1.5.5 / v1.5.6（Windows 弹窗根修 + 冲突自愈）

**爹地实报（10-15）**：Windows 上每次查询弹「几个空白 Chrome 窗口」+ 大多船司「未查询」。
排查后确认是**两个独立问题**叠加：

### 问题 A：弹窗（v1.5.6 根修）
- 根因：`engine/lib/ua.mjs` 的 Chrome 版本探测在 Windows 上执行 `chrome.exe --version`——
  Windows 的 Chrome 不是 console 程序，该命令**完整启动浏览器**（用户默认 profile + 「恢复页面」弹窗），
  每次查询触发多次 → 「几个空白窗口」。Mac 上同命令只打印版本，所以此前从未暴露。
- 定位方式：部署窗口监视器（300ms 分辨率，记录每个 chrome 进程完整命令行 + 窗口状态），
  爹地实机复现时当场抓包（NEWPID 行显示 `chrome.exe --version`，1 秒后窗口弹出）。
- 修复：Windows 侧改走零副作用三路探测（① 注册表 BLBeacon ② exe 文件版本属性 ③ 安装目录版本子目录），
  **绝不对 chrome.exe 执行任何命令**；macOS 分支保持（支持且安全）。
- 实测：Windows 真机返回 Chrome/154、跑前跑后 chrome 进程 0/0（零窗口）；Mac 本地 Chrome/152 正常。
- 防回归：`qa/ua-unit.mjs` 静态断言「--version 仅允许出现在 macOS 分支」。

### 问题 B：整批挂掉（v1.5.5「自愈三件套」）
- 根因链：后台探针占用共享浏览器档案 → 查询引擎启动撞锁 → 兜底链三处 bug 全部失效
  （① 护栏正则不认 Playwright 实际错误消息 ② Windows 清理走多层转义成「无效查询」杀 0 个
  ③ hideChromeFromDock 在 Windows 泄漏报错）。
- 修复：三处全修；撞车模拟实测 8.2s 自动恢复（清理 8 进程 + 重试成功）。
- 探针纪律入技能：探针一律 SSH_PROFILE_DIR 独立档案 + 开跑前查 App 进程。

**发布线**：v1.5.4（Hapag 400s）→ v1.5.5（自愈三件套，13 资产）→ **v1.5.6（弹窗根修，13 资产）**
双端装机：Mac 1.5.6（手动+自检✓）、Windows 1.5.6（App 内自动更新）。

## 2026-10-15 续 · v1.5.7（更新残留自清 + 更新机制实测）

**爹地问**：「软件内更新后是直接覆盖还是重装？会不会更新多次后文件夹越来越大？」

**实测结论（双端）**：
- **更新 = 替换，不是叠加**：Windows 走 NSIS 静默重装（同版本重装实测 **0 MB / 0 文件差量**）；
  Mac 走 tar.gz 解包整体替换 .app（App 内更新实测 **0 MB 差量**、无残留）。安装目录**不会膨胀**。
- **真实增长点（已处理）**：
  1. **Windows `%TEMP%\ShipScheduleHub-<ver>-updater-<rand>`**：每次 App 内更新留一份 ~29MB
     安装包副本（Tauri updater 下载目录；安装器杀旧进程 → 清理代码不执行）——实测 4 次 = 116MB，
     **v1.5.7 起自动清理**。
  2. Mac `/Applications` 的 `.bak` 手动装机备份（4 个 = 332MB，非 App 行为）——已清（爹地定：全删）。
  3. 数据目录 browser-profile（查询用浏览器缓存，正常缓存性质；Windows 143MB / Mac 85MB）。
- 顺带**首次实测了 Mac 的 App 内自动更新链路**（此前都是手动装机）：降级 1.5.5 → App 内更新 → 1.5.6 成功、零残留。

**v1.5.7 实现（`src-tauri/src/lib.rs`，启动时后台线程，跨平台）**：
五重严格判定（全部满足才删）：① 系统临时目录直下 ② 是目录（symlink_metadata 不跟随链接）
③ 名字逐段精确匹配 `ShipScheduleHub-<x.y.z>-updater-<纯字母数字>` ④ 版本不高于当前 ⑤ mtime ≥ 30 分钟。
删除失败静默跳过、不阻塞启动；结果写数据目录 `update-cleanup.log`（覆盖写防自涨）。

**验证**：`cargo test` 7/7（解析严格匹配 + 只删安全目标边界 + 端到端不误删）；
**真机端到端（Mac + Windows）**：造 7 种混淆样本（旧版/当前版/未来版/新目录/别家产品/不合模式/同名文件）
→ 精确删除该删的、其余全部保留，**零误判**。

**版本线**：… → v1.5.6（弹窗根修）→ **v1.5.7（更新残留自清，双端装机）**


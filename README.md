# ShipScheduleHub · 船期聚合驾驶舱

填一次「起运港 + 目的港 + 日期」，并发查询 **11 家主流船司**的船期，结果**直接显示在 App 里**（船名 / 航次 / 开船日 / 到港日 / 天数 / 直达或转港）——不用再逐个打开官网、重复输入。

macOS 桌面 App（Tauri v2 壳 + Node 引擎），内部自用工具。

---

## 特性

| | |
|---|---|
| **11 家船司** | YangMing 阳明 · MSC 地中海 · Maersk 马士基 · ONE 海洋网联 · COSCO 中远海运 · Hapag-Lloyd 赫伯罗特 · ZIM 以星 · CMA CGM 达飞 · Evergreen 长荣 · OOCL 东方海外 · HMM 现代商船 |
| **快** | 8 家走「复制官网自身请求」的直查通道（1-15 秒）；最慢一家 40-80 秒；全量并发跑完 ≈60-90 秒 |
| **结果缓存** | 同条件 20 分钟内重查 **1 秒**返回（行内标注「⚡ 缓存」，不冒充实时） |
| **零打扰** | 浏览器走 `--headless=new`，屏幕上**不出现任何窗口** |
| **界面** | 浅色 + 按船司分组的时间轴卡片：开船日期大字为主信息，hover 有抬升/染色反馈 |
| **更新检查** | 启动时静默查新版本；标题栏「检查更新」按钮可随时手动查；有新版弹窗展示更新说明（立即更新 / 稍后 / 跳过此版本）|
| **不崩** | 每家独立降级：失败只影响自己一行，其余照常（查不到的自动给「维运网」兜底链接）|

实测（宁波 → 伊斯坦布尔，2026-09-30）：**11/11 家返回真实船期，共 79 条**。

---

## 快速开始

### 依赖

- macOS（Apple Silicon 测试通过）
- Node ≥ 22.5（`node:sqlite` 需要；部署态用 `/opt/homebrew/bin/node`，实测 v23）
- Google Chrome（引擎用它做浏览器兜底抓取；无需下载 Playwright 自带 Chromium）
- Rust + Tauri CLI（只在构建 App 时需要）

### 跑引擎（命令行）

```bash
cd engine
node query.mjs --origin Ningbo --destination Istanbul --date ""      # 全部船司
node query.mjs --origin Shanghai --destination Rotterdam --carriers maersk,msc
node query.mjs --origin Ningbo --destination Istanbul --no-cache     # 强制实时
```

输出为 stdout NDJSON 事件流：`engine-started` / `window` / `carrier-status` / `summary` / `engine-exit`。
`carrier-status` 的 `schedules` 字段即结构化船期（`vessel / voyage / etd / eta / transitDays / via / direct`）。

常用开关：`--batch N`（并发度，App 固定 12）、`--carriers a,b`、`--record-xhr`（挖站内接口用）。

### 构建 App

```bash
npm install
npm run tauri build -- --bundles app     # 产物：src-tauri/target/release/bundle/macos/ShipScheduleHub.app
```

### 自检模式（自动化验收用）

```bash
SSH_SELFTEST=1 /Applications/ShipScheduleHub.app/Contents/MacOS/shipschedulehub
```

启动后自动填入「Ningbo → Istanbul」并点击查询，走与真实点击**完全相同**的代码路径；
点击留痕写在 `/tmp/ssh-app-trace.log`，查询证据写在下面的数据目录。

---

## 架构

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│  Tauri v2 壳（Rust）         │  spawn │  Node 引擎 engine/query.mjs           │
│  src-tauri/src/lib.rs        │ ─────► │  ① fastpath：复制官网自身请求直查      │
│  · run_query / stop_query    │        │     (yangming/msc/cosco/hapag/zim/    │
│  · engine://event 逐行转发   │ ◄───── │      maersk/one)                      │
│  · open_external（兜底链接）  │  NDJSON│  ② DOM 配方：填表 → 点搜索 → 抽结果    │
└─────────────────────────────┘        │     (hmm/cma/evergreen/oocl)          │
        ▲                                │  ③ 兜底：只打开页面 + 维运网链接       │
        │ invoke / listen                └──────────────────────────────────────┘
┌─────────────────────────────┐                        │
│  前端 src/main.js（无框架）   │                        ▼
│  浅色时间轴卡片 · 逐家流式更新 │        ~/Library/Application Support/ShipScheduleHub/
└─────────────────────────────┘           ├── browser-profile/  （Chrome 档案）
                                           └── evidence/         （NDJSON + 截图 + 缓存）
```

**关键设计**

- **不走官方 API 授权**：用的是「各家网页自己查询时发的请求」（复制而非申请），因此无需任何 API key。
  代码里少数公开常量（如 Maersk 的 `consumer-key`）本身写在对方页面 JS 里，属页面公开值。
- **三级取数**：fastpath 直查（秒级）→ 失败回退 DOM 配方 → 再失败回退「只打开页面」。
  任何一家失败都不会拖垮整批。
- **运行期数据不落在 .app 包内**：macOS 的 App Management 会拦截 App 修改任何 app 包（含自身），
  把 profile/证据写在包内会持续触发系统弹窗；现统一放 `~/Library/Application Support/ShipScheduleHub/`。
- **结果缓存**：键 = 起运|目的|日期|船司集合，TTL 20 分钟；只在「至少一家真出结果」时写入。

---

## 港口词典（portdb）

用户输入什么词都行（`Ningbo` / `Istanbul` / 中文别名等），引擎自动按船司换算成各家实际称呼：

- 底座：`db/ports.db` —— UN/LOCODE 全量 17,521 港 + `aliases` 表
- `engine/portdb.mjs::findPort(word, carrierId)` → `{ locode, name, country, carrierAliases }`
  （`aliases.locode` 语义 = **该船司自己用的码头码**，可能是 `CNSHA` 这类不在 UN/LOCODE 表里的值；
  地名从 `ports` 表兜底解析）
- `engine/lib/portsolve.mjs::resolvePort(carrierId, word)` → `{ word, locode, name, country, text, source }`，
  `text` 即填进该船司输入框的字符串；source 三档：`verified` →（通用别名）→ `fallback`
- 配方里用 `q.originText` / `q.destText` 填表，用 `q._o.locode` / `q._d.locode` 做候选消歧

例：输 `Istanbul` + Maersk → 填 `istanbul turkey cy`，候选消歧到 `Ambarli Port Istanbul (CY)`
（马士基在这条线卖的是 Ambarli 而非城市级 Istanbul）。

新增船司别名：往 `aliases` 表插一行（`alias` 小写规范化、`carrier`、`locode`、`source='verified'`），配方无需改。

---

## 目录结构

```
engine/
  query.mjs          引擎主流程（CLI 入口：参数、并发、事件、结果缓存）
  fastpath.mjs       7 家站内接口直查适配器
  recipes/*.mjs      11 家船司配方（DOM 填表 + 结果抽取）
  portdb.mjs         港口词典查询
  lib/               通用工具（港口解析 / DOM 操作 / 事件）
db/ports.db          UN/LOCODE 全量 + 船司别名表
src/                 前端（无框架 JS + CSS）
src-tauri/           Tauri 壳（Rust）
sketches/            界面设计稿（3 个方案的可点 HTML）
qa/                  探针脚本（挖接口 / 验证 / 取证）
docs/                调研与验收文档
PROJECT.md           项目驾驶舱（北极星 / 状态 / 决策 / 台账）
```

---

## 已知边界（站侧限制，非软件问题）

- ZIM 部分航线官网本身无班次（如上海→鹿特丹）；有班次的航线正常返回
- ONE 官网偶发 hydration 卡壳，此时降级为「已填表待结果」
- CMA / Hapag 有 IP 级频率限制，高频会话后可能短暂 403

各家反爬状态会变，以 `PROJECT.md` 台账为准。

## 状态

**北极星已达成**：App 已部署到 `/Applications` 自用。当前进度、决策与遗留项见 [`PROJECT.md`](PROJECT.md)。

## 说明

- 内部自用工具，非公开服务
- 数据来自各船司官网，最终以官网为准；本工具只做「帮你一次查完」

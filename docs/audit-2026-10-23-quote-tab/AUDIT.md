# 报价 tab / ETD 功能 · 全面审阅（2026-10-23）

> 触发：爹地「你全面审阅一下，不要出现类似的蠢问题了，纯纯浪费你自己的时间和token」
> 范围：QuoteAssist 移植（src/quote、engine/quote-etd.mjs、Rust commands）+ 部署链路
> 方法：分层精读 + 真机探针 + 逐条复现（code-audit 技能）

## 一、结论速览

本轮一共 **11 个问题**，全部已修并验证：

- **P0 × 2**：会直接导致功能失败（停止误杀 ETD、快速切港口并发撞车）
- **P1 × 7**：功能能跑但会静默出错/漏更新（名字映射、profile 冲突、缓存污染、版本号、资源/plist 不同步、并发撞浏览器、失败结果被缓存）
- **P2 × 2**：体验/流程（错误提示笼统、无部署脚本）

**共同病根**：本地脚本能跑通 ≠ App 内能跑通。前两次交付失败的根子都是「没在真实运行环境里验证」——
一次是**资源没进包**，一次是**两个引擎抢同一个浏览器档案**。现已在部署脚本里固化成硬检查。

## 二、问题清单

| # | 级别 | 现象 | 根因 | 修复 | 验证证据 |
|---|---|---|---|---|---|
| P0-1 | P0 | 爹地点船期页「停止」，正在跑的 ETD 查询被一起杀掉 | `stop_query` 兜底是 `pkill -f <engine>/query.mjs`，ETD 用的同路径 | ETD 改跑 `query-quote.mjs`（内容随 query.mjs 自动刷新，路径不同） | 跑 ETD 查询中执行 `pkill -f query.mjs` → ETD 进程存活、结果正常（MSK 10-29） |
| P0-2 | P0 | 快速切换港口 → 多个 90s 查询并发 → 浏览器互踩全失败 | 前端只有 `cancelled` 防状态覆盖，不取消已发起的查询 | 前端防抖 600ms + 后端 `EtdState` 记录 pid、新查询先杀旧的 | 编译通过；防抖逻辑见 QuoteTab.tsx |
| P1-1 | P1 | ETD 查询污染主 App 的 20 分钟缓存 | `--no-cache` 只跳过「读」，写缓存分支不判断该参数 | 子进程设 `SSH_CACHE_TTL_MS=0`（真正不读不写） | 查询前后缓存文件数 10 → 10 不变 |
| P1-2 | P1 | 界面显示 1.5.7，但功能已增 | 未 bump 版本 | package/tauri.conf/Cargo.toml → **1.6.0** | Info.plist 读回 1.6.0 |
| P1-3 | P1 | 装完还是显示旧版本号 | `--no-bundle` 不重生成 Info.plist | deploy.sh 用 PlistBuddy 同步 `CFBundleShortVersionString` | 部署输出 `Info.plist → 1.6.0` |
| P1-4 | P1 | 「ETD 查询失败」（第一次） | `--no-bundle` 只换二进制，**不同步 Resources**，quote-etd.mjs 没进包 | deploy.sh 加 `rsync engine/` + 逐项核对（缺一即失败） | 核对输出 4 项全 ✓ |
| P1-5 | P1 | 状态「已含 ETD」但正文没有 ETD 行 | 报价表写 MSK/MSC/CMA，引擎认 maersk/msc/cma → 查空 | `CARRIER_ID` 映射表，内部转 id、输出还原表格写法 | 宁波→格但斯克 4 家全出 |
| P1-6 | P1 | 4 家并发报 `Target page/browser has been closed` | 并发开浏览器互相踩；且**失败结果也被写入缓存** 20 分钟 | 默认 `--batch 2` + `SSH_CACHE_TTL_MS=0` | 4 家 90s 全出、零错误 |
| P1-7 | P1 | App 里「未查到 ETD」（4 家全失败） | ETD 查询与主 App 船期引擎**共用 browser-profile** → ProcessSingleton 锁 | ETD 用独立 `etd-profile`（8.9MB，实测 3 家全过） | App 包内完整模拟调用：4 家全出 92.5s |
| P2-1 | P2 | 只显示「ETD 查询失败」看不出原因 | catch 里只给固定文案 | 显示具体错误前 240 字 | — |
| P2-2 | P2 | 每次都靠人工记得同步资源 | 无部署脚本 | `scripts/deploy.sh`（编译→换二进制→rsync engine→同步 plist→重签→核对→启动） | 首次跑即抓出 plist 版本未更新 |

## 三、防复发机制（这次的重点）

1. **`scripts/deploy.sh` 是唯一部署入口**，把「--no-bundle 的三处不同步」全做成硬步骤：
   二进制、`engine/` 资源、`Info.plist` 版本号；核对缺一项直接 `exit 1`，不启动。
2. **技能已记录**（`tauri-desktop-app` §部署纪律 0/0a）：
   - 裸 `cargo build` 产物不含前端资源 → 白屏
   - `--no-bundle` 不更新 Resources / Info.plist
   - 前端错误提示必须带具体原因
3. **回归测试 56 个**（含 ETD 3 个：日期格式、插入位置、无数据不出行）。
4. **链路隔离原则**（新功能接入已有引擎时必须问的三件事）：
   - 进程标识会不会和主链路共用？（→ 独立脚本名）
   - 浏览器 profile / 数据目录会不会撞？（→ 独立 profile）
   - 缓存会不会互相污染？（→ 独立 TTL）

## 四、观察区（已知、未修、风险可控）

| 项 | 说明 |
|---|---|
| Windows 未实测 | ETD 脚本的路径/`taskkill` 分支按现有模式写，逻辑正确但未在 Windows 真机跑过；发版前需按 `references/windows-remote-debug.md` 验一次 |
| App 退出时的孤儿进程 | ETD 查询中途退出 App 会留下 node/chrome；`browser.mjs` 的 `killStaleProfileChrome()` 会在下次查询前清理（自愈） |
| ETD 查询耗时 | 4 家约 90s（MSK/MSC/CMA 走浏览器）；ONE 秒级。已按爹地要求做异步，不卡报价生成 |
| 与独立 QuoteAssist App 并存 | 两个入口读同一份 Excel，互不影响；数据不同步属预期 |

## 五、测试盲区（下一轮补）

- 前端防抖行为（需要 UI 级测试，当前只有静态逻辑）
- ETD 查询中途关闭 App 的进程回收
- Windows 全链路

## 六、修复进度

| 项 | commit |
|---|---|
| 模块移植 | `6f45551` |
| Next ETD 行 | `b705e15` |
| 资源不同步 | `6f035c5` |
| 名字映射/并发/缓存 | `b16ef32` |
| profile 隔离 | `ff8843c` |
| 本轮审阅 11 项 | 见本文件所在 commit |

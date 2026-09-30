# Windows 适配方案（ShipScheduleHub）

> 2026-09-30 婉宜 · 基于对现有代码的逐行审计（不是推测）
> **进展（9-30）**：P1 引擎跨平台 ✅、P2 壳/配置跨平台 ✅（均在 Mac 上回归/编译验证通过）；
> 分发件「无 Chrome 自动下载浏览器」✅ 已实现；CI 出包 ✅ 已就位；**待办：Windows 真机构建 + 验收**。
>
> 结论先说：**可做，但不能在 Mac 上交叉编译** —— Windows 产物必须有 MSVC 工具链，
> 所以「在 Windows 上构建 + 真机验收」是硬要求；代码侧要改的点一共 14 处，全部已定位。

---

## 一、可行性判断

| 维度 | 结论 | 依据 |
|---|---|---|
| Tauri 壳 | ✅ 原生支持 Windows | Tauri v2 的 Windows 目标是一等公民（WebView2）|
| 引擎（Node） | ✅ 基本跨平台 | 纯 JS，无原生模块；`node:sqlite` 是 Node 内置（≥22.5）|
| 浏览器层 | ✅ 可用 | Playwright 的 `channel:'chrome'` 在 Windows 解析系统 Chrome；`--headless=new` 同样零窗口 |
| **构建** | ❌ **不能从 macOS 交叉编译** | Tauri 的 Windows 产物需要 MSVC；官方不支持 macOS→Windows 交叉编译 |
| 交付形态 | 二选一 | A. 在 Windows 机器本地构建；B. GitHub Actions `windows-latest` 出包（私有仓库可跑）|

**推荐：B 出包 + A 验收** —— CI 负责把安装包做出来（可重复、不用污染他的 PC 环境），
真机跑一次 11 家船司查询作验收（因为反爬行为和网络出口强相关，必须在真 Windows 上验）。

---

## 二、要改的代码点（审计结果，逐条可执行）

### 引擎 `engine/`

| # | 位置 | 现状（macOS） | Windows 方案 |
|---|---|---|---|
| 1 | `browser.mjs` `DATA_DIR` | `~/Library/Application Support/ShipScheduleHub/` | `%LOCALAPPDATA%\ShipScheduleHub\`（`process.platform === 'win32'` 分支；仍保留 `SSH_DATA_DIR` 覆盖）|
| 2 | `browser.mjs:133` `killStaleProfileChrome()` | `execSync('pgrep -f <profile>')` + `kill` | Windows：`tasklist /FI "IMAGENAME eq chrome.exe"` 过滤命令行（或 PowerShell `Get-CimInstance Win32_Process`）→ `taskkill /F /PID` |
| 3 | `fastpath.mjs` CA 兜底 | 硬编码 `/etc/ssl/cert.pem` | 按平台给候选列表：mac `/etc/ssl/cert.pem`；Windows 无此文件 → 直接用 Node 默认根证书（失败再退回 `https.request`）|
| 4 | 自检留痕 `/tmp/ssh-app-trace.log` | 硬编码 `/tmp` | `os.tmpdir()`（Windows → `%TEMP%`）|
| 5 | `launchArgs()` 的 `--window-position=-2400,-2400` | 移出屏幕（macOS 会钳回）| 保留无害；我们走 headless 本来就不建窗口 |

> 未发现问题的部分：路径拼接统一走 `path.join`（✓）；Rust 传参用 arg 数组、不拼 shell 字符串（✓ 无注入/转义风险）；
> 引擎与前端之间是 NDJSON 事件流，无平台差异（✓）。

### Rust 壳 `src-tauri/src/lib.rs`

| # | 位置 | 现状 | Windows 方案 |
|---|---|---|---|
| 6 | `find_node()` | 硬编码 `/opt/homebrew/bin/node`、`/usr/local/bin/node`、`/bin/zsh -lc 'command -v node'` | 加 Windows 分支：`where node`；`%ProgramFiles%\nodejs\node.exe`；`%LOCALAPPDATA%\Programs\nodejs\node.exe`；nvm-windows `%APPDATA%\nvm\` |
| 7 | `stop_query` | 硬编码 `/usr/bin/pkill -f <script>` | 记录 spawn 出的子进程 PID → `taskkill /T /F /PID <pid>`（`/T` 连带杀进程树，避免残留 Chrome）|
| 8 | `run_query` 里 spawn node | 无窗口标志 | **加 `CREATE_NO_WINDOW`(0x08000000)** —— Windows 上 GUI 程序起 console 子进程会闪黑框，这是 Windows 体验的关键一条 |
| 9 | trace 路径 | `/tmp/ssh-app-trace.log` | 平台化（`std::env::temp_dir()`）|

### 配置与前端

| # | 位置 | 现状 | Windows 方案 |
|---|---|---|---|
| 10 | `tauri.conf.json` `bundle.targets` | `["app","dmg"]` | 加 `"nsis"`（Windows 安装包）；macOS 目标保留 |
| 11 | `src-tauri/icons/` | 只有 `icon.png` | `npm run tauri icon <png>` 生成 `icon.ico`（Windows 打包必需）|
| 12 | WebView2 | — | Win10 1803+/Win11 通常自带；安装包可选 `webviewInstallMode: downloadBootstrapper` |
| 13 | `src/styles.css` 字体栈 | `-apple-system, "PingFang SC"` | 追加 `"Segoe UI", "Microsoft YaHei"` 兜底 |
| 14 | `.gitattributes`（新增）| — | `* text=auto`，避免 Windows 检出时 CRLF 污染 `query.mjs` 等脚本 |

---

## 三、分阶段执行

| 阶段 | 内容 | 在哪做 | 可验证性 |
|---|---|---|---|
| **P0 环境** | Windows 机器装：Node ≥22.5、Rust(MSVC toolchain)、Tauri CLI、Chrome；Tailscale 起 + Clash 放行 tailnet（`100.x` 段）| Windows | `node -v` / `cargo -V` / `chrome --version` |
| ~~**P1 引擎跨平台化**~~ ✅ | 上表 #1–#4 + 新增 `engine/chrome.mjs` | 已完成 | 部署态两轮 11/11 家 84 条 |
| ~~**P2 Rust/配置跨平台化**~~ ✅ | 上表 #6–#13 | 已完成 | `cargo check` 通过 + macOS 包重建 |
| **P3 Windows 构建** | A 路线：Windows 上 `npm ci && npm run tauri build -- --bundles nsis`；B 路线：GitHub Actions 出包 | Windows / CI | 产出 `ShipScheduleHub_x.y.z_x64-setup.exe` |
| **P4 真机验收（关键）** | 装包 → 查「宁波→伊斯坦布尔」→ **11 家出真船期** 截图留存 | Windows | 属爹地验收（视觉）|

**P4 为什么必须真机**：反爬与网络出口强相关（IP 信誉、TLS 指纹、区域）。Mac 上全通 ≠ Windows 上全通，
尤其 Hapag（Cloudflare）/ CMA（Datadome）需要实测。

---

## 四、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| **反爬行为在 Windows 侧不同** | 部分家可能返回 0 条 | 保留「每家独立降级」；真机跑一轮拿到实际清单，再针对性修 |
| 未签名 exe 被 SmartScreen/Defender 拦 | 装不上/被隔离 | 内部自用：点「仍要运行」+ Defender 白名单；如需正式则上代码签名（成本另议）|
| Windows 机器不常开 | 验收窗口受限 | 用 GitHub Actions runner 出包（不依赖他的机器）；验收挑他在机器旁的时间 |
| 跨平台改动引入 macOS 回归 | 现有可用版本被改坏 | P1/P2 每步都在 Mac 上跑全量回归；`SSH_DATA_DIR` 等开关保留 |
| `node:sqlite` 版本差异 | 引擎起不来 | 安装包/文档强制 Node ≥22.5（README 已写）；`find_node` 探测到低版本时给明确报错 |

---

## 五、待爹地裁决（会改变工作量）

1. **Windows 上谁用**：只有你自己（→ NSIS 安装包 + 免安装 zip 都行），还是要发给同事（→ 得考虑签名/自动更新）？
2. **出包方式**：走 GitHub Actions 自动出包（推荐，不占你机器），还是在 Windows 机器本地构建？
3. **什么时候开工**：P1+P2 我现在就能在 Mac 上做完并验证（今天可交付，零回归）；Windows 侧的构建/验收需要机器可联（当前 Tailscale 停着，SSH 被 Clash TUN 的假 IP `198.18.0.125` 拦，需要放行 `100.x` 网段）。

---

## 六、同事分发设计（「零依赖 + 全自动」）

### 同事机器需要的 / 不需要的

| 需要 | 不需要 |
|---|---|
| Windows 10 1803+ / 11（WebView2 通常自带，安装包会兜底下载）| ❌ Node.js（**已打进包**：`engine/node-bin/node.exe`）|
| 双击安装包 | ❌ Google Chrome（**没有就自动下载一份 Chrome for Testing** 到 `%LOCALAPPDATA%`）|
| 首次查询时联网（仅当没有 Chrome）| ❌ Rust / 任何开发工具 |

### 浏览器三层兜底（`engine/chrome.mjs`）

1. `SSH_CHROME_PATH` 显式指定
2. 系统已装的 Google Chrome（各平台标准路径）
3. Playwright 自带的 Chromium（如存在）
4. **受管 Chrome for Testing**：首次按需下载解包到数据目录，写 `current.json` 缓存，只下一次

> 全部失败也不崩：交回 Playwright 的 `channel:'chrome'`，报错信息引导用户装 Chrome。

### 安装包形态

- **NSIS 安装包**（`ShipScheduleHub_x.y.z_x64-setup.exe`）：双击即装，装到用户目录，无需管理员权限
- **静默安装**（机房批量部署）：`setup.exe /S` —— NSIS 原生支持，可写进批处理脚本一次装一片
- **验证方式**：装完打开 App → 查一次「宁波 → 伊斯坦布尔」→ 应出 11 家船期

### CI 出包（已就位）

`.github/workflows/build-windows.yml`：
`windows-latest` → 装 Node/Rust → `npm ci`（前端+引擎）→ 下载官方 `node.exe` 放进 `engine/node-bin/` →
`tauri build --bundles nsis` → 上传 artifact；打 `v*` tag 时自动发 Release（同事从 Release 下载）。

> 私有仓库的 Release 附件需要登录才能下载 —— 同事取包时要么把安装包直接发给他（微信/网盘），
> 要么按需把仓库或该 Release 制品设为公开。

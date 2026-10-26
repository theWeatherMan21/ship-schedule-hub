# Windows 适配全面审查（真机静默测试）

> 2026-10-15 · 婉宜 · 卡 `t_d3517020`（爹地指令：「全面审查下目前全部功能在 windows 上的适配，可以用 tailscale 在 windows 机器上跑静默测试」）
> 方式：Tailscale SSH 到 Windows 真机 → 9 个探针脚本（全部落盘取证、可原样重跑）→ 结论逐条带证据
> 证据目录：`docs/windows-audit-evidence-2026-10-15/`（脚本 + 原始日志 + 截图，45 个文件）

---

## 0. 一句话结论

**Windows 版是真能用的**：装包→启动→界面→诊断面板→11 家船期→提单追踪→App 内更新检查，全部在真 Windows 上跑通并有截图/日志
（11 家并发一轮 **10/11 家出航期、86 条**；追踪 276759780 出真结果；更新检查弹「已是最新版本（v1.5.1）」）。
审查发现 **2 个真问题（P1×2）+ 3 个次要项**，其中 **W-1 会让某些安装/账号组合下的 App 直接不可用**，建议下个版本一起修。

---

## 1. 测试环境与方法

| 项 | 值 |
|---|---|
| 目标机 | Tailscale peer `pc-20260212geza` / `100.117.117.31`，用户 `administrator` |
| 系统 | Windows（SSH 登录 = session 0 非交互；GUI/引擎测试用计划任务投放到**用户交互会话**） |
| 被测件 | 安装态 `C:\Program Files\ShipScheduleHub`（v1.5.1，另一会话静默安装）+ 源码 `~/Documents/trae_projects/ShipScheduleHub` |
| 运行时 | WebView2 **155.0.4283.45** · 随包 node **v22.23.3** · 系统 Chrome（`C:\Program Files\Google\Chrome`）+ Edge 均可识别 |
| 隔离 | 本卡脚本全部在 `C:\Users\Administrator\ssh_review\`，不碰并发会话的 `ssh-probe\`；不卸载/不改动对方安装、不杀对方进程 |

**静默性自证（每次探针都记）**：全程 `EnumWindows` 可见窗口计数**无新增**（基线 13–15 个都是宿主自己的 QQ/微信/照片/托盘窗口）；
引擎 `windowMode=minimized`；计查询期间 `chromeVisibleWindows=0`；PowerShell 隐藏窗口自证 `powershell visible windows = 0`；
探针结束时计划任务全部删除、App/Chrome/node 进程 **0 残留**。宿主两个窗口（QQ、Foxmail）中途被系统最小化，已在本轮结束时**原位还原**（`427,176,1280,949`）。

---

## 2. 分级问题清单

### 🔴 W-1 [P1 · 会致命] 引擎临时目录兜底「静默失败」，失败后**所有浏览器类船司全灭**

**代码位置**：`src-tauri/src/lib.rs`
- `run_query` 约 699–704 行、`run_track` 约 868–873 行：

```rust
let tmp = project_root(Some(&app)).join("engine").join(".tmp");
let _ = std::fs::create_dir_all(&tmp);          // ← 失败被丢弃（错误值被 _ 吞掉）
let ts = tmp.display().to_string();
cmd.env("TMPDIR", &ts).env("TMP", &ts).env("TEMP", &ts);
```

**机制**：安装目录在 `C:\Program Files\ShipScheduleHub`（per-machine 安装的默认结果）。**非提权**运行 App 时，`Program Files` 下**建不出** `engine\.tmp`（Windows 默认 ACL：Users 只有读&执行）→ `create_dir_all` 失败且无人知晓 → 子进程 `TEMP/TMP/TMPDIR` 指向一个**不存在的目录** → Playwright 起浏览器时第一步 `mkdtemp` 就炸。

**实测复现（探针 07 的 `p7-msc-nx` case，就是模拟这条路径）**：
```
TEMP=<不存在目录>  →  engine-error:
Error: browserType.launchPersistentContext: ENOENT: no such file or directory,
       mkdtemp '<TEMP>\playwright-artifacts-XXXXXX'
    at async tryDir (…\engine\browser.mjs:232:45)
    at async launch (…\engine\browser.mjs:126:19)
[engine] 退出码 1：致命错误且零结果
```
同一个查询、同一个 App、同一台机器，**TEMP 存在时 MSC 出 14 条**（`p7-msc-out.ndjson`：`status=done http=200 ms=6191 rows=14`）；
TEMP 不存在时 **0 条、引擎直接退出**。差异只有一个环境变量。

**影响面**：11 家里 10 家（MSC/Maersk/CMA/COSCO/Hapag/ONE/Evergreen/YangMing/HMM/ZIM/OOCL 的浏览器或页内取数路径）都要起浏览器 → **该配置下等于「点查询毫无反应」**（爹地 9 月遇到过的那个症状就是这一类）。

**为什么这台机器没暴露**：测试机是内置 `Administrator`（UAC 过滤默认关闭 = 全程满权限，探针自证 `isAdmin(elevated)=True`），加上我先前的探针手工建过 `.tmp`。**普通用户账号 + per-machine 安装 = 必踩**。

**建议修法**（任一都能治本，建议 ①+②）：
1. 临时目录改到数据目录：`%LOCALAPPDATA%\ShipScheduleHub\.tmp`（App 自己的数据目录永远可写，也不污染安装目录）；
2. `create_dir_all` 失败时**回退系统 TEMP**（不要留一个不存在的路径）并发一条诊断事件；
3. 「诊断」面板加一行：`引擎 TEMP 实际值 + 是否可写`（下次这类问题一眼可见）。

---

### 🟠 W-2 [P1] Windows 上发的 UA 仍是 **macOS 串**，且每次调用都跑一条必然失败的 macOS 命令

**代码位置**：`engine/lib/ua.mjs:22`（无平台分支）：
```js
const v = execSync('"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version', …);
```
**实测（探针 07，在 Windows 上直接执行该函数）**：
```
UA=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36
UA-stderr| 系统找不到指定的路径。        ← cmd 找不到那条 macOS 路径，原样吐到引擎 stderr
```
**两个后果**：
1. **指纹自相矛盾**：Windows 上的 Chrome / HTTP 请求带着 Macintosh + Mac OS X 的 UA。影响面 = `fastpath.mjs`（maersk/one/msc/zim 等页内取数）、`browser.mjs:143`（headless 启动 UA）、`tracking/one.mjs`、`tracking/cosco.mjs` —— 也就是**几乎所有出网请求**。CF 类站点把凭证绑 UA，浏览器升级/平台不一致时最容易掉线（10-12 Hapag 有头过盾后无头复用失败就是这个坑的变种）。
2. **诊断面板被污染**：失败**不缓存**（`_realUA` 一直是 null），每次调用都重跑这条命令 → 每次查询都在 stderr 丢一行裸中文 `系统找不到指定的路径。`，而它正是爹地排障第一入口「诊断」里显示的内容（见 `diag-clipboard.txt` 的 `引擎stderr尾部`）。

**建议修法**：UA 取版本按平台分支（Windows：系统 Chrome/Edge 路径或注册表版本）；UA 的 OS 段按平台给（Windows → `Windows NT 10.0; Win64; x64`）；**失败也缓存**（避免每次重跑 + 刷屏）。

---

### 🟡 W-3 [P2] 「诊断」面板里混着一条看起来像致命错误的裸 OS 错误行
`系统找不到指定的路径。`（来自 W-2）出现在「诊断」的 `引擎stderr尾部`。修掉 W-2 即消失；同时建议把已知无害行（`ExperimentalWarning: SQLite`）在展示层折叠。

### 🟡 W-4 [P2] 运行期临时文件写进安装目录
即使创建成功，`.tmp` 也落在 `C:\Program Files\ShipScheduleHub\engine\.tmp`（探针 07 实测：跑完仍为空，但目录由 App 建）。程序目录应只读；建议随 W-1 一起搬到数据目录。

### 🟡 W-5 [P2] `tauri.windows.conf.json` 保留了 macOS-only 死配置
`titleBarStyle: "Overlay"` / `hiddenTitle: true` / `trafficLightPosition` 在 Windows 上被忽略（实测用的是原生标题栏，无功能影响），但留着容易误判；建议删掉或注明「macOS-only，Windows 侧无效」。

---

## 3. 已核对**通过**的项（逐条带证据）

| # | 项 | 结论 | 证据 |
|---|---|---|---|
| 1 | 环境：WebView2 / node / 浏览器 | ✅ | `probe01.txt`、`diag-clipboard.txt`：WebView2 155.0.4283.45、node v22.23.3、Chrome+Edge 候选都在 |
| 2 | App 启动 / 单实例 / 窗口 | ✅ 单进程单窗口，1296×839，原生 Windows 标题栏 + 最小化/最大化/关闭 | `probe08.txt`（`processes named shipschedulehub=1`、`可见窗口数=1`）、`app-4-clean.png` |
| 3 | 界面渲染（含字体/裁切/豆腐块） | ✅ 无裁切、无缺字、中英混排正常、字体栈 Segoe UI/Microsoft YaHei 生效 | `app-4-clean.png`（视觉复核）、`src/styles.css:18` |
| 4 | 玻璃/透明在 Windows 的降级 | ✅ 自动 `glass off（窗口效果关闭 + CSS 实底）`，`<html>.no-glass` + `data-platform="win"` 规则生效，界面是干净实底 | `glass.log`、`src/styles.css:479-531`、`app-4-clean.png` |
| 5 | 引擎 spawn 无黑框 + 静默 | ✅ `CREATE_NO_WINDOW` 生效（全程无控制台闪窗）；`windowMode=minimized`；全轮查询**新增可见窗口 0** | `lib.rs` spawn 段、`probe05/06/07.txt` 的窗口计数 |
| 6 | 11 家船期并发（真网） | ✅ 10/11 家出航期，**86 条**（one 10 / yangming 6 / msc 7 / maersk 8 / cosco 11 / hapag 12 / evergreen 12 / hmm 5 / zim 4 / oocl 11）；CMA 403 被拦（与 macOS 同因：新 profile 无履历，**非 Windows 特有**） | `otherrun.ndjson`（并发会话 11:52 在同一台机器跑的整轮，我未重复全量跑以免撞限流） |
| 7 | 单家 live 复核（`--no-cache`，排除缓存假象） | ✅ MSC 14 条 6.2s / Yangming 11 条 0.8s，`http=200` | `p7-msc-out.ndjson`、`p7-yangming-out.ndjson` |
| 8 | 提单/箱号追踪（命令行 + UI 端到端） | ✅ CLI：`276759780` → XINGANG(CN)→GDANSK(PL)、`MRKU3574056 20' DRY`、`In Transit`；**UI**：追踪页自动识别 Maersk、结果卡正常渲染 | `p7-track-out.ndjson`、`probe09.txt`、`app-6-track.png` |
| 9 | 「诊断 / 复制诊断」面板 | ✅ 面板可开、复制到剪贴板 1868 字符 JSON（平台/引擎/路径/浏览器/端口库全项） | `probe06.txt`、`diag-clipboard.txt`、`app-3-diagnose.png` |
| 10 | `\\?\` 长路径前缀防护 | ✅ Tauri `resourceDir` 原样是 `\\?\C:\Program Files\ShipScheduleHub`，**传给 node 前已 normalize** 成 `C:\Program Files\…\query.mjs`（否则 node 必崩） | `diag-clipboard.txt`（`resourceDir` vs `script` 两行对照） |
| 11 | App 内更新检查（Windows） | ✅ 点「检查更新」→ 出 toast「**已是最新版本（v1.5.1）**」；`latest.json` 含 `windows-x86_64` 条目 + 签名 + NSIS 安装包 URL；3 个镜像清单都可达（ghfast 302/206、ghproxy 302/206、GitHub 302） | `probe09.txt`、`app-7-update.png`、`probe05.txt` 端点表 |
| 12 | 关闭/退出 | ✅ 关窗后 `shipschedulehub` 进程 0、无孤儿 Chrome/ node 残留 | `probe08/09.txt` |
| 13 | 托盘 / 快捷键 / 平台符号 | ✅ 无差异：两个平台都**没有**托盘图标（Windows 托盘 UIA 实测 0 个相关项，非 Windows 缺失）；界面无 ⌘ 符号；快捷键只有卡片 Enter/Space | `probe08.txt` tray 段、UIA dump |

---

## 4. Windows vs macOS 行为差异对照

| 维度 | macOS | Windows（实测） | 结论 |
|---|---|---|---|
| 标题栏 | 自绘（`titleBarStyle: Overlay` + 隐藏标题 + 红绿灯） | 系统原生标题栏 | ✅ 配置已分平台（`tauri.windows.conf.json` 关透明、开阴影） |
| 窗口背景 | 玻璃 `hudWindow` + 透明 | 自动关玻璃 + CSS 实底 | ✅ 自动降级，不需要人工干预 |
| 顶栏 | 显示名称 + 版本 | 只显示版本（名称交给系统标题栏） | ✅ 已按平台裁剪（`data-platform="win"`） |
| 引擎临时目录 | 系统 TEMP（正常） | `engine\.tmp`（**W-1 隐患**） | ⚠️ 见 W-1 |
| 出网 UA | 真机 Chrome 版本（Mac 串，正确） | **仍是 Mac 串**（**W-2**） | ⚠️ 见 W-2 |
| 更新包形态 | `.app.tar.gz`（updater 直替） | NSIS `*_x64-setup.exe`（updater 装 NSIS） | ✅ 清单里两平台条目都在 |
| 静默性 | 无窗口（headless/最小化） | 同（实测新增可见窗口 0） | ✅ |

---

## 5. 与 `docs/WINDOWS-PORT-PLAN.md`（9-30 立，14 项）的对齐核对

14 项**全部**已落地并在真机验证：① 数据目录 → `%LOCALAPPDATA%\ShipScheduleHub`（诊断面板实证）✅ ② 残留 Chrome 清理走 PowerShell+`taskkill /F` ✅
③ CA 兜底平台化 ✅ ④ 自检留痕 → `os.tmpdir()`（`%TEMP%\ssh-app-trace.log` 实测有内容）✅ ⑤ 无害 ✅
⑥ `find_node` 含随包 `engine/node-bin/node.exe`（诊断 `nodeExists: true`）✅ ⑦ `stop_query` → `taskkill /T /F /PID` ✅ ⑧ `CREATE_NO_WINDOW` ✅
⑨ trace 平台化 ✅ ⑩ `bundle.targets` 含 NSIS + `webviewInstallMode: embedBootstrapper` ✅ ⑪ `icon.ico` 在 ✅
⑫ WebView2 兜底 ✅ ⑬ 字体栈含 Segoe UI / Microsoft YaHei ✅ ⑭ `.gitattributes` 处理 CRLF ✅

**新增待补**：W-1（TEMP 兜底）、W-2（UA 平台化）不在 9-30 清单里 —— 它们是**这一轮真机测试新发现的**，建议回写进「§二 要改的代码点」形成第 15、16 条。

---

## 6. 证据索引（`docs/windows-audit-evidence-2026-10-15/`）

| 文件 | 对应结论 |
|---|---|
| `probe01.txt` `probe02.txt` `probe03.txt` `probe04.txt` | 环境侦察 / 安装与数据目录盘点 / 目录 mtime 溯源 / 进程与并发取证 |
| `probe05.txt` + `engine-out.ndjson` `engine-err.txt` | 引擎链：`.tmp` 无写权限、窗口枚举 0、3 镜像可达性（**探针自身 bug**：早期用 `Start-Process -ArgumentList` 传未加引号的路径 → `Cannot find module 'C:\Program'`，已修，见 probe07） |
| `probe06.txt` `uia-dump1.txt` `uia-dump2.txt` `diag-clipboard.txt` `app-1..3.png` | App 交互会话启动、UI Automation（1029→1186 节点）、诊断面板 + 复制诊断 |
| `probe07.txt` `ua-out.txt` `ua-err.txt` `p7-*.ndjson` `p7-*-err.txt` | **W-1 复现**（`p7-msc-nx`）、**W-2 复现**（UA + 裸中文错误行）、单家 live 复核、追踪 CLI |
| `probe08.txt` `app-4-clean.png` `app-5-update.png` | 干净单实例渲染、托盘探针、关窗行为、宿主窗口还原、计划任务清理 |
| `probe09.txt` `uia-dump-track.txt` `app-6-track.png` `app-7-update.png` | 追踪页端到端（UI）+ 更新检查 toast |
| `otherrun.ndjson` | 并发会话在同一台机器跑的 11 家整轮结果（10/11 家 86 条）——**注明来源：非本卡产出** |

**怎么再跑一遍**：脚本都在证据目录，`register_task.ps1 -Name <名> -Script <路径>` 会把探针投到用户交互会话执行（SSH 是 session 0，GUI 行为必须这么跑）；
输出统一落 `C:\Users\Administrator\ssh_review\<probe>.txt` 再 scp 回。中文 .ps1 必须带 UTF-8 BOM。

---

## 7. 未覆盖 / 建议下一步

1. **W-1 的真机复现**：本机是「满权限账号」，无法复现非提权场景。建议在一台**普通用户账号**的 Windows 上按「per-machine 安装 → 双击启动 → 查一次」验证；或先按下 §2 的建议改掉（改动很小）。
2. **OOCL 追踪**：仍是唯一缺的一家，需真单号。
3. **CMA 403**：与 macOS 同因（profile 无履历），不是 Windows 问题；若要让 Windows 侧也能过，需要 profile 预热的等效方案。
4. **跑完一轮 11 家约 3–5 分钟**（反爬等待为主），建议保持「一家独立降级」的现状，不要因为单家 403 影响整轮。

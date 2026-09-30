# 任务卡：船期聚合驾驶舱 ShipScheduleHub v0.1

> 派单人：婉宜（Supervisor）｜执行：码农（manong）｜委托人：ross（叫「爸爸」）

## 0. 从哪开始

从零建项目。目录：`/Users/russospencer/Documents/trae_projects/ShipScheduleHub`（已为你建好，内有本卡）。
环境：macOS 27 / Node v26.8.1 / rustc 1.96.0 / Python 3.9.6。
系统已装 Google Chrome（`/Applications/Google Chrome.app`）。

## 1. 目标（一句话）

一个 Tauri 桌面 App：**填一次「起运港 / 目的港 / 日期」→ 一键并发打开 Top 10 船司的船期查询页，并尽最大努力把查询条件预填好**；用户直接看各家官网原页做对比。

**明确不做**：不解析结果、不做数据对比表（二阶段的事，本次不做）。

## 2. 已实测的事实（直接采信，别重复踩坑）

派单前已用真实浏览器实测，结论如下：

| 测试项 | 实测结果 |
|---|---|
| 船司页面能否 iframe/webview 嵌入 | ❌ 6 家里只有 COSCO 可嵌（`X-Frame-Options: ALLOWALL`）；赫伯罗特/ONE 有 CSP `frame-ancestors 'self'`；MSC/达飞对非浏览器客户端直接 403 |
| 查询页是否真实表单 | ✅ 马士基、达飞都是真实表单，可被程序驱动 |
| URL 深链接预填 | ❌ **不成立**。达飞搜索后 URL 完全不变（结果页内 AJAX 渲染）；给马士基拼参数无效 |
| 程序化 DOM 填表 | ⚠️ 可行但脆。达飞的起运港/目的港自动补全（Kendo UI）能填进去；但**清空字段会触发校验失败**（"Place of Loading format is invalid"） |

**必须接受的结论**：预填只能靠逐家 DOM 操作；URL 深链接这条不用再试。因此**每家的抗崩能力靠「三级降级」设计**（见第 4 节）。

## 3. 架构要求

1. **Tauri v2 外壳 = 控制面板**：起运港 / 目的港 / 日期输入 + 船司勾选清单 + 「并发查询」按钮 + 每家一行的状态显示（成功预填 / 仅打开 / 失败+原因）。
2. **浏览器驱动**：驱动一个**独立托管的 Chromium**，不要碰用户日常 Chrome 的 profile。
   - 推荐：Playwright（Node sidecar）`chromium.launchPersistentContext(profileDir, { channel: 'chrome' })` ——
     - `channel:'chrome'` 直接复用系统已装的 Google Chrome 二进制，**免去下载 Chromium**（本机 playwright 的 chromium 下载被网络拖死过），且指纹更真；
     - `profileDir` 用项目自己的目录（如 `./browser-profile`），持久化保留登录态，**不碰** `~/Library/Application Support/Google/Chrome`。
   - 备选：Rust 侧 CDP 库（chromiumoxide）。但 Kendo 这类控件建议用 Playwright 的高级 API（`fill` / `click` / `waitForSelector`）兜底，别硬写 CDP 原语。
3. **并发策略**：点一次「查询」→ 并发打开 N 个 tab（每船司一个）。**必须分批 + 限速**（建议每批 ≤3 个、批次间隔 2–4 秒），避免同一 IP 突发触发 Cloudflare/Akamai 验证码。
4. **不解析结果**：跑到「结果页出现」即可交给人眼。

## 4. 配方（recipe）三级降级 —— 本任务的核心设计

每家船司一个独立配方模块，按顺序尝试：

1. **deep-link URL 模板**（若该家实测支持）→ 直接落到已填好的结果页
2. **DOM 填表 + 点击搜索**
3. **降级兜底：只把该家的船期查询页打开**

**硬要求**：任何一个配方失败，**不能让整个查询失败**。每一家必须记录并回显状态：`已预填并搜索` / `仅打开页面` / `失败(原因)`。
> 这条是产品的保命绳：工具的保底价值 = **至少把页面开好**，永远成立。

## 5. Top 10 船司清单与入口（起点，需你实测校准）

| 船司 | 已知入口 URL |
|---|---|
| MSC | https://www.msc.com/en/schedules |
| Maersk | https://www.maersk.com/schedules/pointToPoint |
| CMA CGM | https://www.cma-cgm.com/ebusiness/schedules |
| COSCO | https://elines.coscoshipping.com/ （船期入口需自行确认，`/ebusiness/schedule` 实测是 404） |
| Hapag-Lloyd | https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html |
| ONE | https://ecomm.one-line.com/one-ecom/schedule |
| Evergreen | https://www.shipmentlink.com/ |
| Yang Ming | https://www.yangming.com/ |
| HMM | https://www.hmm21.com/ |
| ZIM | https://www.zim.com/ |

**每家的真实查询页路径与表单选择器必须实测确认，不许凭猜写选择器。**某家摸不通 → 走第 3 级兜底，并如实标注状态，不算失败。

## 6. 红线（不允许做）

- ❌ 不解析 / 不抓取结果数据，不做对比表
- ❌ 不做 iframe / webview 嵌入（已知被挡，浪费时间）
- ❌ 不对船司站点高频请求；必须限速分批（见 3.3）
- ❌ 不申请官方 API、不走 API 路线
- ❌ 不读写用户日常 Chrome 的 profile；只用项目自己的 user-data-dir
- ❌ 开发/测试期间的截图或自动化若会弹出浏览器窗口，**必须静默**（headless，或加环境变量门控），别打扰爸爸工作
- ❌ 不修改本卡外的任何既有项目文件

## 7. 交付物

1. 可运行的 Tauri App（README 写明启动命令，如 `npm run tauri dev`）
2. 每家的配方实现文件 + 当前状态（跑通/兜底/未确认）
3. README：怎么跑、配方怎么写、怎么加新船司
4. **实测证据**：对**至少 3 家**给出「自动预填 + 搜索成功」的截图或日志片段

## 8. 验收标准（爸爸视角）

- 填一次条件 → 10 个标签被打开；**至少 3 家自动预填成功**
- 配方失败不崩、有兜底、状态在 UI 可见
- 全程零弹窗打扰
- 不允许「代码写完就算完成」，必须是**真跑起来、真打开过页面**

## 9. 交活格式（固定）

```
做了什么：
证据：命令 + 输出 / 截图路径
已知边界：
未完成项：
```

## 10. 允许的做法

- 允许自建 `qa/` 目录放验证脚本
- 允许把浏览器 profile、日志放在项目内
- 摸不通的船司，标注清楚比硬编造选择器重要得多——**不许编造 selector**

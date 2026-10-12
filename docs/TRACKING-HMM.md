# HMM 提单/箱号追踪接入（2026-10-10）

适配器：`engine/tracking/hmm.mjs` · 真单实测：**HDMUSHAF36562700**（2025 年单）
离线单测：`node qa/hmm-track-unit.mjs`（14 项，零网络）· CLI：`node qa/track-cli.mjs hmm <单号>`

## 一、通路（照抄站点自己的走路方式）

| 步 | 事实 | 依据 |
|---|---|---|
| 入口 | `https://www.hmm21.com/e-service/search/index.do?query=<号>` | 首页 T&T 小部件的 `gotoTrkNTrc()` 源码**唯一做的事**就是跳这个地址（`query` 大写、长度 ≥3） |
| 跳转 | 站点自己 302 → `/e-service/general/trackNTrace/TrackNTrace.do` | 实测 |
| 数据 | 页面再请求 `POST/GET /e-service/general/trackNTrace/selectTrackNTrace.do` | 该响应是**服务端渲染的完整结果片段**（实测 32KB） |
| 时间线 | 全在片段里：`#shipmentProgress tbody tr.clsMoves` | 含隐藏行 `tr.clsMoves.hidden.clsPreviousMoves`（= 页面「Display Previous Moves」背后的历史全量）→ **不用点展开** |

一个入口认四种号：B/L / Container / Booking / P-O（首页小部件四个 radio 共用这个 query 地址，站点自己识别形态）。

**WAF**：直连 `hmm21.com` 会被顶回 `Access Denied / abnormal connection`（curl 实测 100% 被拒，正文含 reference code）；
必须真 Chrome（无头新档即可）+ **先开首页热身**再进深链。历史「access limited」页照 `BLOCK_RE` 单列 `blocked:true`，**绝不写成「查无结果」**。

## 二、口径（别自作聪明的地方）

- **B/L 号不带 SCAC 前缀**：输入 `HDMUSHAF36562700`，站点回显 `SHAF36562700`（`#thisBl`）。适配器把两个都给出（`docNum` = 站点口径，`number` = 用户输入，`blNumbers[]` = 命中的全部提单）。
- **一票可能命中多张提单**：按箱号查时，同一箱号历史上挂过多票 → 站点给「最新的那票」，`blNumbers` 暴露出来（实测 `CAIU3102121` 直查回的是 `HKGE30401000` 盐田→汉堡，而不是它 2025 年那票上海→卡萨布兰卡）。界面必须显示**站点回传的提单号**，否则用户以为我们查错。
- **时间线是「提单级」不是「箱级」**：HMM 的 Shipment History 不分箱。为对齐 UI 契约（`containers[].events` 才是时间线主来源），事件挂在**第一只箱**上，同时保留顶层 `events`（**别两边相加**，会重复渲染）。
- **Mode 列有两种内容**：运输方式（`Truck` / `Feeder`）或船名航次（`HMM ALGECIRAS 0017W`）→ 按形态分流成 `vessel`/`voyage`，原串留在 `mode`。
- **码头**：时间线行不给码头，从 Shipment Schedule 的 `Location`/`Terminal` 两行建对照表回填 `terminal`。
- **全部历史行按 ACTUAL**：站点图例「红=已发生、蓝=预计」，History 里的行都是已发生的移动 → `timeType:'ACTUAL'`（UI 的「当前状态」取 ACTUAL 最后一条，语义正确）。

## 三、边界（都真跑过）

| 情形 | 判据 | 返回 |
|---|---|---|
| 真单 | 出现 `Shipment History` | `ok:true` + 11 条事件（上海 Yangshan Ph4 → 阿尔赫西拉斯 T/S → 卡萨布兰卡，HMM ALGECIRAS 0017W / CASABLANCA A 0425S） |
| 查无此单 | **不跳转**，停在 `/e-service/search/index.do`，站内搜索 `Total 0` | `notFound:true`，原话如实回传（含 pageUrl） |
| 站点拦截 | 正文含 `Access Denied` / `abnormal connection` / `security@hmm21.com` | `blocked:true`（与 notFound 分开） |
| 门户壳/超时 | 无以上三种信号 | `ok:false` + 「结果页未出现（门户壳/超时）——稍后重查」；先首页热身重试 1 轮 |

## 四、静默

全程无头新档（`engine/browser.mjs` 默认档），探针包 `qa/quiet-probe.sh`：跑完比对屏幕可见窗口数，实测 `0 → 0`。
自测用独立 profile（`SSH_PROFILE_DIR=/tmp/...`），不抢爹地 App 正在用的 profile。

## 五、待卡主（UI 卡）处理的一个口径（不属本卡）

`engine/tracking/normalize.mjs` 的 `phaseOf()` 词表里「已完成」只认 `DELIVER|EMPTY RETURN|GATE.?OUT`，
而 HMM 的收尾状态原文是 `Import Empty Container Returned`（含 "EMPTY CONTAINER RETURNED"，**不含** "EMPTY RETURN" 连串）
→ 已完结的 HMM 单会被标成 `phase: In Transit`。建议词表加 `EMPTY CONTAINER RETURN|RETURNED`，或判「最后一条 ACTUAL 含 RETURN」。

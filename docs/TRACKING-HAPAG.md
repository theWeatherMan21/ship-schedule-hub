# Hapag-Lloyd 提单/箱号追踪 · 接入说明（2026-10-12 收口）

## 一、通路（全部实测）

- **入口（legacy 深链）**：
  `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html?blno=<号>`
  - GET 深链免提交、服务端直接渲染结果；无 `-legacy` 的旧地址已 302 跳新 Tracking BETA，勿用。
  - 结果页：容器列表（Type / Container No. / Status / Date / Place of Activity），每行有 Details 按钮
    （JSF id 形如 `tracing_by_booking_f:hl27:hl53`；CSS 选择器里冒号需转义）。
  - 详情页：Container Information（Type/Description/Dimension/Tare/Max Payload）+ Last Movement
    + 事件表（Status / Place of Activity / Date / Time / Transport / Voyage No.）。
  - 站方口径：事件**粗体 = 实际(ACTUAL)**；非粗体 = 计划(EXPECTED)；空日期 = 待更新（undated）。
- **否定态**：`DOCUMENT does not exist. (Format : HLCUHAM030712345)` → `errorKind:'not-found'`
  （如实转达，别和"被拦"混）。
- 提交式旧表单备注（备查）：BL 字段预填 `HLCU` 前缀须先清空；POST `?_a=tracing_by_booking`。

## 二、CF 过盾 与「无头 ⇄ 有头」双模（本日关键收口）

- 背景：Hapag 全站 Cloudflare Managed Challenge。
- **结论：无头可用**，前提 = 有效 `cf_clearance` + **UA 与过盾时一致**。
  - 教训：无头曾写死 UA `Chrome/140`，而真机 Chrome 是 152 → 带凭证仍被挑战（凭证绑定 UA）。
  - 修复：`engine/browser.mjs` 的 `realChromeUA()` 动态对齐真机 Chrome 大版本，无头/有头 UA 一致。
- **模式**（`SSH_HAPAG_MODE=auto|headless|headed`，默认 auto）：
  1. **无头先行**（launch / headless-new）——profile 里有凭证时 **8~10 秒全通**（零窗口）；
  2. 无头被拦（凭证缺失/过期）→ **自动升级有头真指纹**（launchHeadedQuiet 最小化）过盾并刷新 `cf_clearance`；
  3. 凭证落回同一 profile → 后续无头继续复用（自适应，无需人工）。
- 实测（2026-10-12）：无头三连 8.2s / 9.1s / 10.2s 全通、各 9 事件；App selftest 无头真跑 → UI 1 container · 9 events。

## 三、解析要点（防脏数据）

- 列表行：只收**含箱号**的行；同箱多行去重（优先保留带 Details 按钮的那行）。
- 事件行过滤：`cells >= 4`；日期列必须合法（`YYYY-MM-DD` 或空）；表头/布局行剔除（黑名单：Type/Description/…）。
- 详情抓**第一箱**（多箱场景后续可扩）。
- 明细证据自动落盘：`evidence/hapag-track-*-list.txt` / `-detail.txt`。

## 四、真单验收

- `HLCUTS12608CSOQ6` → 箱 **UWLU4114042 · 45GP**，NINGBO → ISTANBUL：
  8-23 进港 → 8-31 装船（MARIE MAERSK 634W）→ 9-19/20 PORT SAID → 9-27/29 换船（MAERSK SIRAC 638N）→ **10-05 ISTANBUL 卸船**（9 事件全实数）。
- 无记录号样例：`HLCUTS12609DETN4`（新旧系统均无记录，业务性 not-found）。

## 五、QA 资产

- 探针链：`qa/probe-hapag-*.mjs`（有头/无头/cookie 复用/legacy 表单/行结构 dump 等）。
- 识别覆盖：`qa/track-identify-test.mjs`（HLCU 前缀 SCAC + 8 位订舱 + 16 位提单形态）。
- 无独立离线单测（解析正确性以真实端到端为准；关键判据均有注释与探针可复查）。

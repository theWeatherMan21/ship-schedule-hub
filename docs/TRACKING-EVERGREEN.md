# Evergreen 长荣海运 · 提单/箱号/订舱追踪接入说明（2026-10-12）

## 一、通路（纯 HTTP，无浏览器）

- **入口**：`https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do`（官方 ShipmentLink，无挑战）
- **方式**：直接 `POST` 表单（`application/x-www-form-urlencoded`），**无需浏览器进程**：
  - 提单：`{ TYPE:'BL', BL:<12位不含 EGLV>, SEL:'s_bl', NO:<同> }`
  - 柜号：`{ TYPE:'CNTR', CNTR:<11位>, SEL:'s_cntr', NO:<同> }`
  - 移动明细：`{ TYPE:'CntrMove', bl_no/onboard_date/pol/pod/podctry, cntr_no:<柜> }`
- **两段式**：先 summary（航次/箱列表），再逐柜拉 moves（时间线）；柜视图会给出官方 `bl_no` 链接用于跳该柜当次行程。
- ★ 站方口径：提单号输入**不带 EGLV 前缀**（自行剥离）；纯 12 位数字为提单/订舱形态；柜号 `[A-Z]{4}\d{7}`。
- ★ 网络抖动（`fetch failed`）自动重试一次（2026-10-12 App 内实测偶发）；HTTP 状态错误不重试。

## 二、真单验收（2026-10-12）

| 号 | 结果 |
|---|---|
| **EGLV142552582916**（提单） | SHANGHAI (CN) → PORT AU PRINCE (HT)，箱 FCIU7002130，**10 事件**（2025-10-17 → 2026-01-05），`Completed`（Empty Container Returned），船 EVER LOYAL 0754-073E / EVER CAREER 0574-120N |
| **FCIU7002130**（柜） | 经容器视图官方 BL 链接 → 6 事件（箱子已复用，当前行程与历史提单不同，语义正确） |

- 识别元数据：`evergreen tracking:'live'`；UI 说明栏已列入。
- 验证链（工人实施 + 主线复核）：官方 fixture 断言、identify 108/0、normalize 回归、UI 回放、App 实机 selftest（`1 container(s) · 10 events`，SHANGHAI → PORT AU PRINCE，Completed）。

## 三、QA 资产与边界

- 单测：`qa/evergreen-track-test.mjs`（官方 fixture 断言：身份/10 事件/日期/船名/实体解码/完成态/畸形响应与非法输入）；fixtures：`qa/fixtures/evergreen-result.html`、`evergreen-moves.html`
- 边界：订舱号仅特定国家可用（站方限制）；柜历史为"当次行程"（箱复用时不显示历史提单事件，与站方语义一致）。

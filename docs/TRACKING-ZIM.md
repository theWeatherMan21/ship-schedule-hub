# ZIM（以星）提单 / 箱号追踪 · 接入说明

卡片：`t_22d7387a`【提单追踪】以星 · 接入 ｜ 模块：`engine/tracking/zim.mjs`（导出 `trackZim` / `parseZimResponse`）｜ 2026-10-12

## 一句话

与船期同域（zim.com），追踪走站内网关 `apigw.zim.com` —— **Akamai 护着裸请求，必须在页面上下文里 fetch**（无头浏览器、零窗口）。一次查询 ~10s（含页面就绪等待 + 一次重试）。

## 端点（实摸）

| 用途 | 调用 |
| --- | --- |
| 查询 | `GET https://apigw.zim.com/digital/TrackShipment/v2/complete-result?reference=<号>&subscription-key=<key>` |

- `subscription-key` 为站内**公开配置值**（2026-10-10 从页面 JS 提取；失效时按同法重抓）。
- **双形态响应**：
  - **提单/参考号** → `consgListItem[0]`：`blRouteLeg.vpBrl[]`（航线腿：港口/船名/航次/进出港时刻）+ `consDetails.consContainers.consContainersItem[]`（箱级 `unitActivities`）+ `finalEta / agreedEta` + `consCycleStatusDesc`
  - **箱号** → `unitListItem[0]`：`vpBrl.vpBrl[]`（同上）+ `unitActivities` + `finalEta`
- 事件字段：`activityCode / activityDesc / activityDateTz`（港口当地时刻）/ `placeFromDesc` / `countryFromName` / `vesselName / voyage`。

## 语义注意

- **无箱级活动的票**（实测样本如 MEX/VAN：`cycleStatusDesc=Unknown`、无 `unitActivities`）→ 箱子保留、事件为空、route/eta 照出——**如实展示，不编事件**。
- `cycleStatusDesc`：`Closed` → 归一化 phase=Completed；`Open` → 在途。
- ETA 口径：`finalEta.etaPodDate`（**到港**）为 `eta`；交付 `etaDelDate` 存 `etaDelivery`；`podFlag`（DELAY 等）随原文保留。
- 站方对部分票只给票级数据（无箱级活动）——不是解析失败。

## 验证

- 离线单元 `qa/zim-track-unit.mjs` **23/0**（fixtures：7 个真实响应样本 `qa/fixtures/zim-track-samples.json`）。
- 真网 CLI：`ZIMUBCN10212938`（10 事件）、`TGBU4028006`（9 事件）全链通过。
- 实机：selftest 自动识别 ZIM + 结果卡（BARCELONA → NEW YORK · Completed · 10 events）。

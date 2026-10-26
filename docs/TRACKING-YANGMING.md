# Yang Ming 阳明海运 · 提单/箱号/订舱追踪接入说明（2026-10-12）

## 一、通路（站内 API，实测打通）

- **入口页**：`https://www.yangming.com/en/esolution/tracking/cargo_tracking`（官方 Cargo Tracking，无挑战）
- **站内 API**（必须在 yangming.com 页面上下文内 `fetch`）：
  `GET /api/CargoTracking/GetTracking?paramTrackNo=<号>&paramTrackPosition=<模式>&paramRefNo=<上下文>`
- **参数矩阵（实测）**：

| position | refNo | 效果 |
|---|---|---|
| `SEARCH` | 空 | 任意号直查（柜/提单/订舱自动识别，响应带 `trackType`） |
| `BL_CT` | 提单号 | 提单视角下钻该柜事件（=官网详情页同款"该票视角"） |
| `BL_CT` | 空 | 退回柜实时视图 |
| `CNTR_CT` | 提单号 | 无效（successCnt=0，勿用） |

- **响应结构**：`{ successCnt, containerList[], blList[], bookingList[], emptyList[] }`
  - `containerList[i]`：`returnTrackNo / cnSize / cnType / cnTypeDesc / ctStatusInfo[] / dcsaStatusInfo[]`
  - `blList[0]`：`trackType:'B/L No' / blType / basicInfo{loading,discharge,vesselName,vesselComn,…} / routingInfo.routingSchedule[] / containerInfo[]`
  - 事件字段：`seq / moveDate('2026/09/30 16:33') / eventDesc / atFacility / toFacility / dportETA / tsMode / eventClassifie('Actual'|'Estimated')`
  - ★ `tsMode` 可能内嵌 HTML：`'VESSEL<BR />YM INTELLIGENT<BR />(298N)'`——已清洗提取船名/航次。
  - ★ 事件 `seq` 递增=时间倒序；模块统一转时间正序。

## 二、适配器逻辑（engine/tracking/yangming.mjs）

1. 无头打开追踪页 → `fetch(SEARCH)` 直查；
2. 有 `containerList` → 柜模式（全柜遍历，DCSA 事件优先）；
3. 有 `blList` → 票级信息（basicInfo/routingInfo）+ 逐柜 `fetch(BL_CT, ref=提单号)` 下钻补全事件（上限 4 柜，防大票）；
4. 仅 `bookingList` → 识别为订舱号（尽力解析柜特征，无明细时如实标注，不误报 not-found）；
5. 空 → `not-found`。

## 三、真单验收（2026-10-12）

| 号 | 结果 |
|---|---|
| **YMLU4794131**（柜） | 20 事件（2026-08-24 SURABAYA → 2026-09-30 KEELUNG），`Completed`（空箱归还），船 YM CENTENNIAL 070N / YM INTELLIGENT 298N |
| **N237068499**（提单，Seaway Bill） | SHANGHAI (CNSHA) → ROTTERDAM (NLRTM)，HMM DUBLIN 018W，下钻柜 FCIU… YMLU4794131 8 事件（2026-02-06 → 04-10） |
| 无效号 | `successCnt:0` → not-found（如 XXXX3432533） |

- 识别元数据：`yangming tracking:'live'`；UI 说明栏已列入。
- App 实机 selftest（无头真跑）通过：`1 container(s) · 20 events`，路线 `SURABAYA → KEELUNG`。

## 四、QA 资产与边界

- 单测：`qa/yangming-track-unit.mjs`（36/0，含多柜/booking/tsMode/HTML 清洗用例）；fixtures：`qa/fixtures/yangming-track-*.json`
- 复核：工人独立复核报告 `YANGMING-REVIEW.md`（5 个缺口已全部修复：多柜遍历、booking 不误报、空返 Completed 映射、下钻 ETA 重算、未知分类处理）。
- 边界：订舱号形态未完全验证（结构未出现真样本）；BL 下钻上限 4 柜；柜模式 origin/destination 由事件城市近似（站方无结构化航线字段）。

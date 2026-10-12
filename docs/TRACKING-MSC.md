# MSC 提单/箱号追踪接入（engine/tracking/msc.mjs）· 2026-10-10

> 交付：MSC 单号 → 时间线（引擎级，真单实跑见 §5）。App 内接线由「提单追踪 UI / 搬家马士基 App 接线」卡负责。

## 1. 通路（XHR 实摸，非官方 API）

提交 MSC 追踪表单时，页面打的是自己的站内接口：

```
POST https://www.msc.com/api/feature/tools/TrackingInfo
头：content-type: application/json
    accept: application/json, text/plain, */*
    x-requested-with: XMLHttpRequest      ← 缺它 → 200 但空响应（与船期 SearchSailingRoutes 同一个坑）
体：{ "trackingNumber": "MEDUW7272208", "trackingMode": "0" }
      trackingMode: "0" = Container/Bill of Lading Number    "1" = Booking Number
```

- **Akamai 护着**：`curl` 直打一律 403 `Access Denied`（换 UA、带头都无效）→ 必须在 `msc.com` 页面上下文里 `fetch`。
- **轻量页够用（实测）**：`goto('https://www.msc.com/__light__')` + 700ms → 页内 fetch 200；导航+等待 2.2–2.7s，
  完整追踪页要 6.7s。引擎两级入口：先轻量页，拿不到 JSON 再退完整页 `en/track-a-shipment`。
- **深链（实测可用，页面自己会查）**：`https://www.msc.com/en/track-a-shipment?params=<base64>`
  base64 内容 = `trackingNumber=MEDUW7272208&trackingMode=0`（**不带 padding 的 base64**）。
  实测落页后输入框已填号、页面自己发 TrackingInfo 并渲染结果 → 可作「打开 MSC 原页看结果」兜底。
- 入口页无验证码（登录页之外）；headless 新档 + 新 profile 实测 3 连 200。

## 2. 响应结构（字段映射表）

```
{ IsSuccess: bool, Data: {…} | "错误文案" }
Data.TrackingType        "Bill Of Lading" | "Container"     ← 单号识别结果（可回显给用户）
Data.TrackingTitle       "BILL OF LADING:" | "CONTAINER NUMBER:"
Data.TrackingNumber      回显单号
Data.TrackingResultsLabel "Tracking results provided by MSC on 10.10.2026 at 09:24 Central Europe Standard Time"
Data.BillOfLadings[]     BillOfLadingNumber / NumberOfContainers / Delivered
    GeneralTrackingInfo  ShippedFrom / ShippedTo / PortOfLoad / PortOfDischarge /
                         Transshipments[] / PriceCalculationDate / FinalPodEtaDate
    ContainersInfo[]     ContainerNumber / ContainerType（"40' HIGH CUBE REEFER"）/ Delivered /
                         PodEtaDate（ETA）/ LatestMove（最近位置）
        Events[]         Order（0 起、时间升序）/ Date / Location / UnLocationCode /
                         Description / Detail[] / EquipmentHandling{Name,Smdg} / Vessel{IMO,Flag,FlagName} /
                         IntermediaryPortCalls[{LocationName,Country,Eta,Etd}]
```

**解析要点（踩过的坑）**

1. **日期是 `dd/MM/yyyy`（瑞士口径）**，不是美式 `MM/dd/yyyy`。实测 `11/01/2026` = 2026-01-11，
   `PriceCalculationDate 25/12/2025` = 2025-12-25。直接 `new Date()` 会整整错月 → 引擎里 `mscDate()` 显式转。
   可用带 ` HH:mm` 的形态（IntermediaryPortCalls 的 Eta/Etd）。
2. **船名/航次在 `Detail[]` 里，不在 `Vessel{}` 里**：`Vessel` 只给 IMO/船旗/建造年。
   判据 = `Vessel.IMO` 非空 → `Detail[0]`=船名、`Detail[1]`=航次（实测 `["MSC TARA III","HS552A"]`）；
   无船事件 `Detail` 是 `["LADEN"]` / `["EMPTY"]`（别当成船名）。
3. **`Order` 是权威时间序**（0 最老）；同日多事件（如"Import to consignee" 与 "Empty received at CY" 同天）靠它定序。
4. **ETA 是一条事件**（`Description = "Estimated Time of Arrival"`，日期在未来）→ 按时间排序它会变成"最新事件"。
   引擎同时给 `current`（含 ETA）与 `lastMove`（最近一次**已发生**动作），另外给 `eta` / `delivered`，UI 三个数都拿得到。
5. 箱状态：`ContainersInfo.Delivered` = 是否已交付；`LatestMove` = 最近位置；`PodEtaDate` = 卸货港 ETA。

## 3. 错误语义（必须与"我们没抓到"分开）

| 情况 | 接口表现 | 引擎返回 |
| --- | --- | --- |
| 单号在 MSC 系统里查无（格式也可能只是不被它认） | `200 {"IsSuccess":false,"Data":"No results found for this Container number. …"}` | `{ok:false, errorKind:'not-found', error:<MSC 原话>}` |
| 箱号格式合法但不在 MSC 在役箱队（实测 `MSCU1234566`） | `200 {"IsSuccess":false,"Data":"Off Service"}` | 同上，error 就是 MSC 原话 `Off Service`（别自己改写成"查无此号"） |
| 通路被拦/改版（非 JSON） | 非 JSON 体 | `{ok:false, errorKind:'blocked', error:'…被拦/改版…'}` |
| 单号其实是订舱号 | mode 0 报 not-found | 引擎自动再打 mode 1，成功则 `mode:'1'` |

**边界实测（2026-10-10）**：垃圾输入 `hello` → MSC 回通用 not-found 文案（引擎不崩、如实转达）；
`MSCU1234566`（ISO 6346 合法、非在役箱）→ `Off Service`。

**实测反例**：`M237055674`（爹地给的候选号）mode 0/1 都回 not-found —— 它**不是** MSC 的箱号/B/L/订舱号（10 位、M+9 数字，不符合 MSC 任何格式），归属待识别器卡判定。
**订舱号模式（mode 1）代码已备但尚未验证**：拿公开文档里的两个订舱号（`241ISZ1655566`、`070ISA0949739`）实测均 not-found
（可能是旧单已出查询窗口）→ 等真订舱号到手再补一条证据，别把"没验证过"说成"已验证"。

## 4. 引擎用法

```js
import { trackMsc } from './engine/tracking/msc.mjs';
const r = await trackMsc('MEDUW7272208');          // 自带 ctx：单号单开
// 或复用浏览器：const r = await trackMsc(num, { ctx });
// r.ok=true 时：r.trackingType / r.origin / r.destination / r.transshipments / r.status /
//              r.lastMove / r.eta / r.delivered / r.containers[{num,size,eta,delivered,latestMove,events[]}]
//              events[]: {time(ISO), activity, city, locode, terminal, terminalCode, vessel, voyage, imo, via[], isEta, isCurrent}
```

实跑：`SSH_PROFILE_DIR=/tmp/msc-$$ bash qa/quiet-probe.sh qa/track-cli-msc.mjs <号…>`
（`qa/track-cli-msc.mjs` 一次可传多个号、共用一个浏览器；静默红线由 quiet-probe.sh 兜底）

## 5. 真单实测证据（2026-10-10，全新临时 profile，零窗口）

| 单号 | 类型 | 结果 | 耗时 |
| --- | --- | --- | --- |
| `MEDUW7272208` | Bill of Lading | SHANGHAI,CN → HO CHI MINH CITY,VN；1 箱 MSNU1490601(20' DRY VAN)；**6 条事件**（空箱提箱→进 CY→装船 MSC TARA III HS552A→卸船→交收货人→空箱回场）；Delivered=true | 3.8s |
| `MSCU7325344` | Container | YANTIAN,CN → VANCOUVER,CA；40' HIGH CUBE REEFER；**4 条事件**（含未来 ETA 2026-10-17 @DELTAPORT，船 EXPRESS ROME UK636A，经 BUSAN/QINGDAO/SHANGHAI）；Delivered=false | 2.8s |
| `MEDU6543219` | Container | TINCAN/LAGOS,NG → NHAVA SHEVA,IN（经 KRIBI,CM）；**10 条事件**（含 COLOMBO 转船：MSC TAURUS VII FN606R → GREENFIELD IP610R）；Delivered=true | 3.1s |
| `M237055674` | 未知 | MSC 明确否定（not-found，非通路故障） | 3.6s |

原始 JSON dump：`qa` 探针输出见 kanban 证据目录 `evidence/msc-*.json`；CLI 日志 `evidence/msc-cli-run.log`。

> ⚠️ 上述三个"真单"来自**公开文档**（公开到网的 Arrival Notice / 公开数据集里的 MSC 单号），
> 只用于验证通路与解析；**不要**写进任何测试固件或产品默认值里长期保存（他人货运数据）。

## 6. 待办（不属本卡）

- 统一入口 `engine/tracking/index.mjs`（按识别器 card 的前缀表分发 maersk/msc/…）：由 UI 页签卡建，避免两张卡同时造同一个文件。
- 缓存：同号短时复查建议走 TTL 缓存（App 层统一做，别在每家引擎里各写一份）。

## 7. 静默自检会被"邻居探针"污染（本轮实测一次误报，记下来）

本轮 4 连跑时一次 `quiet-probe.sh` 报「屏幕上多出 1 个窗口」，同一时刻 `onscreen --ours` 为空、
也没有 `msc-*` 残留 Chrome 进程 → 是同时段**别的卡**的有头探针（当时机上有 `hapag-track-probe-1`、
`hmm-probe-a`、`prof-c6` 三个 Chrome）的窗口被算成了"ours"（助手只按 owner 名含 Chrome 系过滤，分不清是谁的）。
判据要叠加：①只统计**本项目 profile / 自己进程**的 Chrome 窗口；②引擎自报模式（headless-new）；
③无残留浏览器进程。三条一致才算静默通过 —— 别把邻居的窗口记成自己的违规，也别因此去"修"本来没问题的无头通路。


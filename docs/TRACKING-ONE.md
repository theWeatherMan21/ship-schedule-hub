# ONE（海洋网联）提单 / 箱号追踪 · 接入说明

卡片：`t_4f35b4a3`【提单追踪】ONE · 接入 ｜ 模块：`engine/tracking/one.mjs`（导出 `trackOne`）｜ 2026-10-10

## 一句话

ONE 的追踪和船期**同源**（`ecomm.one-line.com` 的 eDH API）——**公开、无鉴权、无验证码、纯 HTTP**，
不需要浏览器、不需要 profile、零窗口。一次查询 ~1.5–5s。

## 端点（实锤：站内 Next.js chunk `pages/manage-shipment/cargo-tracking-*.js`）

| 用途 | 调用 |
| --- | --- |
| 搜索 | `POST https://ecomm.one-line.com/api/v2/edh/containers/track-and-trace/search` |
| 时间线 | `GET  …/v2/edh/containers/track-and-trace/cop-events?booking_no=<b>&container_no=<c>` |
| 老号归一（兜底） | `POST …/v2/edh/containers/track-and-trace/validate-booking` |

搜索请求体：

```json
{ "page": 1, "page_length": 20,
  "filters": { "search_text": "HAMG12062700", "search_type": "BKG_NO" },
  "timestamp": 1791616700000 }
```

`search_type`：`BKG_NO`（BL 号 / 订舱号）｜`CNTR_NO`（箱号）｜`PO_NO`｜`ALL`。
返回 `data[]`：每票含 `bookingNo / containerNo / containerTypeSize / weight / por / pod / place /
copNo / latestEvent / cargoEvents[] / deadlineEvents[] / vesselVoyage / cargoReleaseCustoms`。
`cop-events` 返回该箱的完整时间线（`eventName / eventDate(UTC) / eventLocalPortDate(港口当地) /
triggerType(ACTUAL|ESTIMATED) / location / yard / vessel`）。

## 号码写法（站方口径）

- **BL 号 = `ONEY` + 12 位**；网页输入框只收**后 12 位、不带 `ONEY` 前缀**（如 `HAMG12062700`）。
  本模块**两种都收**（自动剥 `ONEY`）。
- 订舱号同字段、同写法；箱号形如 `ONEU4227196`（`ONEU/ONEY` + 7 位 → 自动判成箱号查询）。
- ✅ **自动识别（2026-10-12 起）**：官方两种「后 12 位」形态均可自动识别为 ONE 并直接查询——
  3 字母+9 数字（`PUS123456789`）、4 字母+8 数字（`PUSA12345678`）；带 `ONEY` 前缀的完整号
  （`ONEY`+12 位）识别后由本模块自动剥离前缀、按官网格式查询。实测：`ONEYSZPG70884900`
  → 剥为 `SZPG70884900` → 南沙→温哥华 40 事件 OK（2026-10-12）。官方口径来源：one-line.com
  Cargo Tracking（"enter only the last 12 characters … without the prefix ONEY"；Mail Tracking
  给出 3+9 / 4+8 两种形态）。
- ⚠ 例外：**字母数字交错**的罕见形态（官方未列的变体，如 `SH5FVD622400` / `NB3JJE454300`）
  无法自动路由，需人工在下拉里选 ONE。已实测存在真实号：`HAMG12062700` / `SZPG70884900` /
  `GYEG18729700` / `SH5FVD622400`。

## 输出契约

统一结构（与 `engine/tracking/maersk.mjs` 对齐），经 `engine/tracking/normalize.mjs` 归一：

```
{ ok, number, carrier:'one', docNum, searchType, origin, destination,
  lastUpdate, status, current, eta, vessel,
  containers:[{ num, size, type, status, lastUpdate, weight, copNo, eta,
                events:[{ time, utc, activity, city, country, terminal, vessel, voyage,
                          trigger, timeType, seq, isCurrent }],
                undatedEvents:[…], rawCopEvents, rawSearch }],
  raw:{ search, match, status } }
```

两个易错点（本模块已处理）：

1. **`timeType`**：归一化层靠 `ACTUAL / EXPECTED` 区分「已发生」与「预计」——ONE 站上叫
   `ESTIMATED`，本模块翻译成 `EXPECTED`。不翻译的话，摘要会把**未来的预计到港**写成「当前位置」。
2. **无时刻事件**：ONE 对部分中转港里程碑（`Feeder Loading/Unloading …`）**不给时间**。
   normalize 只按 time 排序，这类事件会浮到时间线最前面造成假象 → 本模块把它们移出 `events`，
   另存 `containers[].undatedEvents` + raw（**不编造时间**）。

时间口径：`time` = 港口当地时间（`eventLocalPortDate`），`utc` = `eventDate`。

## 实测证据（真单 · 可复跑）

`qa/track-one-evidence.json`（原始 API 响应：搜索 + cop-events）、`qa/track-one-cli.mjs`（单号试跑 CLI）。

| 输入 | 类型 | 结果 |
| --- | --- | --- |
| `HAMG12062700` | BL/订舱号 | 汉堡 → 迈阿密，1 箱 8 事件（NYK REMUS 0083） |
| `SZPG70884900` | BL/订舱号 | 南沙 → 温哥华，**4 箱** × 10 事件（含中转盐田/支线） |
| `GYEG18729700` | BL/订舱号 | 波索尔哈 → 高雄，1 箱 14 事件（釜山中转，换 MOL CELEBRATION→HMM DREAM） |
| `SH5FVD622400` | BL/订舱号 | 上海 → 长滩，1 箱 8 事件 |
| `ONEU4227196` | 箱号 | 鹿特丹 → 卡加延德奥罗，1 箱 **12 事件（含 4 条 EXPECTED + ETA 2026-10-14）** |

复跑：`node engine/tracking/cli.mjs --number <号> --carrier one --no-cache`

## 其他实测坑

- 号码格式不合法 / 网关拒绝时，站方直接 HTTP 400 `APIGEE-ERR-400`（不是「无结果」空体）；
  本模块统一映射成「查不到」的人类可读错误。
- `validate-booking` 对查不到的号返回 `{bkgBefore:'',bkgAfter:''}`（不报错），只有真老号才有
  `bkgAfter` 归一结果 —— 所以只在首次搜索空结果时才试它。
- 站上 `containerTypeSize` 有两种写法：`20'DRY ST.` 与 `40H.REEFER`（不带引号），解析尺寸要容错。
- 2024 年前的旧订舱号在新系统里查不到（老页面 `CUP_HOM_3301.do` 才有）——按「无结果」如实报即可。

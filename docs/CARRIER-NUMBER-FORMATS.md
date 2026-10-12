# 11 家船司单号格式 × 识别规则 × 查询方法 —— 全量调研

> **日期**：2026-10-12 ｜ **方法**：Exa 检索（官方页面/官方文档优先）+ 我方实名实证 ｜ **用途**：识别器（`engine/tracking/identify.mjs`）与追踪接入的对照基线
> **来源分级**：R1 = 船司官方页面/官方文档；R2 = 行业服务商汇总（Vizion/Terminal49/Airlift/Tradlinx 等）；R3 = 博客/泛述（仅作线索，未采信）
> 覆盖范围 = 本项目接入的 11 家：Maersk / MSC / CMA CGM / COSCO / Hapag-Lloyd / ONE / Evergreen / HMM / Yang Ming / ZIM / OOCL

## 一、总表

| 船司 | SCAC | BL 号格式 | 订舱号格式 | 官方追踪入口（接受：箱 / 提单 / 订舱） | 识别器现状（identify.mjs） |
|---|---|---|---|---|---|
| **Maersk** | MAEU | **9 位纯数字**（例 909876543） | **9 位纯数字**（例 222334455） | maersk.com/tracking/ ✅三种 | ✅ 9 位数字自动 |
| **MSC** | MSCU | **MEDU + 2 字母数字 + 6 数字**（例 MEDUW7272208，总 12）；另见 181 系列实证 | 同字段 | msc.com/en/track-a-shipment ✅箱/提单 | ✅ MSCU/MEDU 前缀；✅ 181 系列（10-12 加） |
| **CMA CGM** | CMDU | **CMDU + 8~12 字母数字**；变体 LGS0184344A | （唯一 booking ref，格式未详） | cma-cgm.com/eBusiness/Tracking ✅三种（≤3 个） | ✅ CMDU 前缀；⬜ LGS 形态未覆盖 |
| **COSCO** | COSU | **10 位纯数字**（例 5051645160；可带 COSU 前缀） | 同 BL（站点 both 混用） | elines.coscoshipping.com/ebusiness/cargoTracking ✅三种（分号多号） | ✅ COSU 前缀；⬜ 裸 10 位数字未覆盖 |
| **Hapag-Lloyd** | HLCU | **HLCU + 2 字母 + 1 字母数字 + 9 字母数字**（总 16；例 HLCUHAM123456789） | **8 位数字**（官方 EDI：8-digit booking number） | hapag-lloyd.com/en/online-business/track/track.html ✅箱/订舱(含 BL) | ✅ HLCU 前缀；🟡 8 位数字低置信候选 |
| **ONE** | ONEY | **ONEY + 12**；后 12 位 = 3 字母+9 数字 或 4 字母+8 数字（PUS123456789 / PUSA12345678） | 同字段 | ecomm.one-line.com ✅箱/提单/订舱（官网只收后 12 位） | ✅ ONEY 前缀；✅ 两种后 12 位（10-12 加）；🟡 杂形态手选 |
| **Evergreen** | EGLV | **12 位纯数字**（官方例 012345678900） | 12 位数字（booking 追踪仅部分国家） | ct.shipmentlink.com ✅三种 | ✅ EGLV 前缀；⬜ 12 位纯数字未覆盖 |
| **HMM** | HDMU | **HDMU + 2 字母 + 2 字母 + 7 数字**（总 15，例 HDMUBUHB1234567，HQ 实证 HDMUSHAF36562700） | **8 位数字**（例 12345678） | hmm21.com Track & Trace ✅箱/提单/订舱/PO | ✅ HDMU/HMMU 前缀 |
| **Yang Ming** | YMLU（注册） | YMJA 前缀（2023-10 起）/ 9–12 位数字（例 230123456） | 可用（形态未明） | yangming.com/en/esolution/cargo_tracking ✅三种（≤12 个，无登录） | ✅ YMLU/YMJA 前缀 |
| **ZIM** | ZIMU | **ZIMU + 3 字母 + 7 数字**（例 ZIMUBCN1234567） | **M + 数字**（例 M0123456） | zim.com/tools/track-a-shipment ✅三种（≤10 个） | ✅ ZIMU 前缀；🟡 M+数字低置信候选 |
| **OOCL** | OOCL | OOLU + 载体码（例 OOLU1234567890）；亦记 10 位数字 | 可用（形态未明） | oocl.com Cargo Tracking ✅三种（无登录） | ✅ OOLU 前缀；⬜ 裸数字未覆盖 |

## 二、逐家详情与来源

### 1. Maersk（马士基）
- **BL/订舱**：均 9 位纯数字。R1 证据：官方 Track and Trace API 文档 —— `transportDocumentReference`（B/L，例 `909876543`）、`carrierBookingReference`（订舱，例 `222334455`）［developer.maersk.com；api-evangelist 镜像 openapi］。R2：maerskes.com "Bill of Lading number consists of 9 characters"。
- **追踪**：maersk.com/tracking/（先选 Ocean/Air/LCL/Parcel 类型；接受箱号/BL/订舱；未登录可见当前位置/历史/预计）。
- **识别器**：✅ `9 位纯数字 → Maersk（自动，0.6）`。
- **备注**：官方 API 需 Consumer-Key（我方走网页 fastpath，不用）。

### 2. MSC（地中海航运）
- **BL**：`MEDU`（2018 起新单）+ 2 字母数字 + 6 数字（R2 Vizion 表；例 `MEDUA1234567`/`MEDUAB123456`）。我方实证：`MEDUW7272208`（= MEDU + W7 + 272208 ✔ 形态吻合）。
- **181 系列**：无前缀参考号（我方实证 `181AS0266823514M1` SHEKOU→ISTANBUL，缓存+live 双证；2026-10-12 归户）。
- **追踪**：msc.com/en/track-a-shipment —— 输入框标"Container/Bill of Lading Number"。myMSC 门户（注册）支持 BL/Booking 文档级操作。R1。
- **识别器**：✅ `MSCU/MEDU` 前缀；✅ 181 系列。

### 3. CMA CGM（达飞）
- **BL**：`CMDU` + 8~12 字母数字（R2 Tradlinx）；变体 `LGS0184344A`（短字母前缀+数字块+尾字母，R2 Melsun）；旧式 Web Reference `WBAJP1234567` **已废弃**（R1 CMA 官宣"One Single Booking Reference"）。
- **追踪**：cma-cgm.com/eBusiness/Tracking —— "Search by Container Number, Shipment Ref or My Ref"，一次最多 3 个。R1。
- **识别器**：✅ `CMDU` 前缀；⬜ LGS 形态未覆盖。
- **备注**：我方追踪接入被 DataDome 拦（未接，船期已接）。

### 4. COSCO（中远海运）
- **BL**：10 位纯数字（R2 Vizion"10 numbers"；R1 线索：官网 cut-off 页例 `5051645160`；COP 集成文档例 `6103622780`）。可带 `COSU` 前缀（我方实证 `COSU6469105960`）。
- **订舱**：与 BL 同型；官网 `numberType: bl / bkg / cntr / both` 自动判别，支持分号多号。R1（跟踪 URL 参数实锤）。
- **追踪**：elines.coscoshipping.com/ebusiness/cargoTracking。R1。
- **识别器**：✅ `COSU/COAU/COEU` 前缀；⬜ 裸 10 位数字未覆盖。

### 5. Hapag-Lloyd（赫伯罗特）
- **BL**：`HLCU` + 2 字母 + 1 字母数字 + 9 字母数字（总 16）；官方 API 示例 `HLCUDE1XXXXXXXX8`（R1），用户指南例 `HLCUHAM123456789`（R2，含 3 字母办事处码 HAM）。**B/L 明显比别人长，别裁剪**。
- **订舱**：**8 位数字**（R1 官方 EDI MIG："BN = Hapag-Lloyd's 8-digit booking number"）。
- **追踪**：hapag-lloyd.com/en/online-business/track/track.html —— "Track by booking"（订舱/BL）与 "Track by container" 两入口。R1。
- **识别器**：✅ `HLCU/HLUS/HPET` 前缀；🟡 8 位数字低置信候选（首位 hapag——注意 HMM 订舱也是 8 位，冲突见 §四）。
- **备注**：我方追踪被 Interactive Challenge 拦（未接，船期已接）。

### 6. ONE（海洋网联）
- **BL**：`ONEY` + 12 字符；官网口径"输入只收**后 12 位**"；官方两种形态：**3 字母+9 数字**（`PUS123456789`）/ **4 字母+8 数字**（`PUSA12345678`、订舱样例 `HAMG12062700`）。R1（one-line.com Cargo Tracking + Mail Tracking）。
- **追踪**：ecomm.one-line.com（我方已接，纯 HTTP 零浏览器）。官网 search_type：`BKG_NO / CNTR_NO / PO_NO / ALL`。
- **识别器**：✅ `ONEY` 前缀；✅ 两种后 12 位（2026-10-12 加）；🟡 字母数字交错杂形态（`SH5FVD622400`/`NB3JJE454300`）需手选。
- **备注**：带 ONEY 前缀的输入由适配器自动剥离→官网格式查询（`ONEYSZPG70884900`→`SZPG70884900` 实测 OK）。

### 7. Evergreen（长荣）
- **BL**：**12 位纯数字**（R1 官方 ShipmentLink 页面直接给出例子 `012345678900`——全行业少数官方自证格式的船司）。`EGLV/EGHU` 是 filing 码。
- **订舱**：同为 12 位数字；**booking 追踪仅特定国家/地区可用**（R1 官方声明）。
- **追踪**：ct.shipmentlink.com/servlet/TDB1_CargoTracking.do —— Quick/Multiple Tracking，接受 BL/箱号/订舱。R1。
- **识别器**：✅ `EGLV` 前缀；⬜ 裸 12 位数字未覆盖（宽形态，多义）。

### 8. HMM（现代商船）
- **BL**：`HDMU` + 2 字母（收货地码，如 BU=Busan）+ 2 字母（交货地码，如 HB=Hamburg）+ 7 位序列（总 15，例 `HDMUBUHB1234567`，R2 文档）。我方实证：`HDMUSHAF36562700`。注册箱前缀：HDMU/HMMU/KOCU。
- **订舱**：8 位数字（R2 例 `12345678`）。
- **追踪**：hmm21.com Track & Trace —— 接受 B/L / 箱号 / 订舱 / PO。R1（官方 FAQ/手册）。
- **识别器**：✅ `HDMU/HMMU` 前缀。
- **备注**：HDMU vs HMMU 起头在第三方资料中说法不一（R2 不确定）；官方不公布格式——以票据为准。

### 9. Yang Ming（阳明）
- **BL**：`YMJA` 前缀（2023-10-01 起替代 YMLU/YMPR 作为提单号前缀与 AMS 申报码；注册 SCAC 仍 YMLU，R2 Expedion/Terminal49）；也可 9–12 位数字（R2 Terminal49 例 `230123456`）。Vizion 另记 "1 letter + 9 numbers"（例 `A123456789`）——两说并存。
- **追踪**：yangming.com/en/esolution/cargo_tracking —— 接受箱号/BL/订舱号，**一次最多 12 个**。旧地址 track_trace.aspx 已废弃（R2）。
- **识别器**：✅ `YMLU/YMJA` 前缀。

### 10. ZIM（以星）
- **BL**：`ZIMU` + 3 字母 + 7 数字（例 `ZIMUBCN1234567`，R1 官网例）。
- **订舱**：`M` + 数字（例 `M0123456`，R2 Terminal49）。
- **追踪**：zim.com/tools/track-a-shipment —— 接受 BL/订舱/箱号，**一次最多 10 个**（逗号/空格/换行分隔）。R1。
- **识别器**：✅ `ZIMU` 前缀；🟡 `M+数字` 低置信候选。

### 11. OOCL（东方海外）
- **BL**：`OOLU` + 载体码（例 `OOLU1234567890`，R2 Tradlinx）；Vizion 记 "10 numbers"。
- **追踪**：oocl.com Cargo Tracking —— B/L # / Booking # / Container # 三选一，无需登录。R1。
- **识别器**：✅ `OOLU` 前缀；⬜ 裸数字未覆盖。

## 三、识别器差距清单（供决策）

| 优先级 | 事项 | 说明 |
|---|---|---|
| ✅ 已完成 | MSC 181 系列 / ONE 后 12 位两形态 / scac-loose（11 位提单型） | 2026-10-12 已上线 |
| ✅ 已加（10-12） | **10 位纯数字 → COSCO / OOCL 候选（不自动）** | 两家 BL 均 10 位数字；作候选提示（爹地已圈） |
| ✅ 已加（10-12） | **12 位纯数字 → Evergreen 候选（不自动）** | 官方自证 12 位；多义，仅候选 |
| 🟡 待定 | **9–12 位数字 → Yang Ming 候选（不自动）** | R2 形态；多义 |
| 🔴 冲突项 | Hapag 8 位数字 vs HMM 8 位数字 → 均保持"低置信候选" | 两家订舱号同形，不可自动路由 |
| ⬜ 不做 | 裸数字自动路由（除 Maersk 9 位） | 盲区属多义形态，自动化误路由率高 |

## 四、备注与争议

1. **8 位数字双解**：Hapag 与 HMM 的订舱号都是 8 位数字（官方/半官方各一），识别器保持"低置信候选（hapag 首位）"，不自动。
2. **HMM BL 前缀说**：HDMU 与 HMMU 之争见于第三方；官方无格式文档。识别器两家都收。
3. **YM BL 形态说**：Expd/T49 说 YMJA+号 / 9–12 位数字；Vizion 说 1 字母+9 数字。并存记录。
4. **MSC 181 系列**：非公开格式（我方实证归户）；如遇同族新号，沿用规则。
5. **官方 API 现状**：Maersk/Hapag/CMA 有开发门户（需 key/OAuth2），我方不依赖；以网页 fastpath 为准。
6. 官方追踪页速查：Maersk `maersk.com/tracking/` ｜ MSC `msc.com/en/track-a-shipment` ｜ CMA `cma-cgm.com/eBusiness/Tracking` ｜ COSCO `elines.coscoshipping.com/ebusiness/cargoTracking` ｜ Hapag `hapag-lloyd.com/en/online-business/track/track.html` ｜ ONE `ecomm.one-line.com` ｜ Evergreen `ct.shipmentlink.com` ｜ HMM `hmm21.com` ｜ YM `yangming.com/en/esolution/cargo_tracking` ｜ ZIM `zim.com/tools/track-a-shipment` ｜ OOCL `oocl.com` Cargo Tracking。

## 五、主要来源

- **Vizion**「Bill of lading number formatting」全表：https://support.vizionapi.com/migration/bill-of-lading-formatting （R2，2024-01 起观察表，覆盖 19 家）
- **ONE 官方** Cargo Tracking / Mail Tracking（R1）：https://ecomm.one-line.com
- **Hapag-Lloyd 官方** Track 页面 + EDI MIG + API 门户（R1）：https://www.hapag-lloyd.com/en/online-business/track/track.html
- **Maersk 官方** Track and Trace API 文档（R1，经 api-evangelist 镜像）
- **Evergreen ShipmentLink 官方**（R1）：https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do
- **COSCO 官方** eBusiness 追踪（R1）：https://elines.coscoshipping.com/ebusiness/cargoTracking
- **CMA CGM 官方** 追踪与新闻稿（R1）：https://www.cma-cgm.com/eBusiness/Tracking
- **HMM 官方** 手册/FAQ（R1）：https://www.hmm21.com
- **Yang Ming 官方** 追踪页 + 用户手册（R1）：https://www.yangming.com/en/esolution/cargo_tracking
- **ZIM 官方** 追踪页（R1）：https://www.zim.com/tools/track-a-shipment
- **OOCL 官方** Cargo Tracking（R1）：https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx
- 辅助（R2）：Airlift / Terminal49 / Tradlinx / Melsun / maalbardaar 各船司页

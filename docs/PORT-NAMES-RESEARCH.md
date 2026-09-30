# 港口命名调研 —— 同一港口在各船司系统的不同搜索名

> 调研日期：2026-09-23 ｜ 目的：让引擎知道「同一个港口，每家船司该用什么名字搜」

## 调研方法

直连各家「地点查询」接口（无需登录、比驱动页面快百倍）：

| 船司 | 接口 | 状态 |
| --- | --- | --- |
| CMA CGM | `/api/PortsWithInlands/GetAllPlaces?id=<关键词>` | ✅ 直连可用 |
| Yang Ming | `/api/P2P/GetLocations?queryType=F&searchByCode=TRUE&locationName=<关键词>` | ✅ 直连可用 |
| MSC | `/api/feature/tools/GetAllAvailableCountriesAndPorts` | ⛔ Akamai 拦（需浏览器上下文）|
| ZIM | `apigw.zim.com/digitalMasterData/.../locations?searchTerm=` | ⛔ Akamai 拦 |
| COSCO | `/ebusiness/sailingSchedule/searchByCity` | ⏳ 待测 |
| Maersk / ONE / Evergreen / HMM / Hapag | 待挖 | ⏳ |

## 核心发现（比名字差异本身更重要）

**① 同一个港口，各家的 LOCODE 可能不同** —— 不能假设「一个港口 = 一个码」：

- 深圳：YangMing 用 `CNSZP`，而业界常见写法是 `CNSZX`
- 南沙：CMA 用 `CNNSA`（老港），YangMing 区分 `CNNNP`（新港）/ `CNNSA`（老港）

**② 同一港口在同一家还分 Port / Door / Ramp 多种类型** —— 查船期必须用 **Port**：

- CMA 的返回带 `capsule` 字段：`Port` = 港口，`Door` = 门到门内陆点，`Ramp • Door` = 铁路场站
- 例：伊斯坦布尔在 CMA 有 4 条 —— `ISTANBUL`(Door) / `ISTANBUL, TR`(Door) / `HAYDARPASA ISTANBUL ASIAN SIDE`(Port) / `ISTANBUL, AMBARLI PORT E. SIDE`(Port)
- **直接搜 ISTANBUL 可能命中 Door 点导致无船期**，这就是「马士基必须选 CY」的同类问题

**③ 同名地点会污染候选** —— 必须靠国家/州省码消歧：

- 南沙：CMA 首条是 `NANSHAN, 44`（深圳南山，不是广州南沙）
- 鹿特丹：YangMing 返回 9 条，含德国小镇 Rottweil/Rottum/Rottenburg 等干扰项
- 鹿特丹：CMA 还有 `ROTTERDAM, NY`(美国) / `ROTTERDAM`(新加坡)

## 逐港口对比

### Nansha（南沙）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `NANSHAN, 44 ; CN ; CNNA1` | CNNA1 | Door |
| CMA | `GUANGZHOU - NANSHA OLD TOWN, 44 ; CN ; CN1KA` | CN1KA | Door |
| CMA | `NANSHA ; CN ; CNNSA` | CNNSA | Port |
| CMA | `NANSHA ; CN ; CNNSA` | CNNSA | Ramp • Door |
| YangMing | `NANSHA NEW PORT, GD (CNNNP)` | CNNNP | — |
| YangMing | `NANSHA OLD PORT, GD (CNNSA)` | CNNSA | — |

### Shenzhen（深圳）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `SHENZHEN - PINGHU, 44 ; CN ; CNPHU` | CNPHU | Door |
| CMA | `SHENZHEN - SONGGANG, 44 ; CN ; CNSAG` | CNSAG | Door |
| CMA | `SHENZHEN - LONGGANG, 44 ; CN ; CN1KW` | CN1KW | Door |
| CMA | `SHENZHEN - XIXIANG, 44 ; CN ; CNXIX` | CNXIX | Door |
| CMA | `SHENZHEN - SHAWAN, 44 ; CN ; CN1LD` | CN1LD | Door |
| CMA | `SHENZHEN - BUJI, 44 ; CN ; CNBUJ` | CNBUJ | Door |
| CMA | `SHENZHEN - SHATOUJIAO, 44 ; CN ; CNSTJ` | CNSTJ | Door |
| CMA | `SHENZHEN - SHIYAN, 44 ; CN ; CNSYN` | CNSYN | Door |
| CMA | `SHENZHEN - HUAQIAOCHENG, 44 ; CN ; CN1KT` | CN1KT | Door |
| CMA | `SHENZHEN - CHEGONGMIAO, 44 ; CN ; CN1KP` | CN1KP | Door |
| CMA | `SHENZHEN - SHAJING, 44 ; CN ; CNSHJ` | CNSHJ | Door |
| CMA | `SHENZHEN - PINGDI, 44 ; CN ; CN1MD` | CN1MD | Door |
| YangMing | `SHENANDOAH, GA (USUYS)` | USUYS | — |
| YangMing | `SHENANDOAH, VA (USYHD)` | USYHD | — |
| YangMing | `SHENSTONE (GBHEN)` | GBHEN | — |
| YangMing | `SHENWAN, GD (CNSNW)` | CNSNW | — |
| YangMing | `SHENYANG, LN (CNSHE)` | CNSHE | — |
| YangMing | `SHENZHEN, GD (CNSZP)` | CNSZP | — |

### Shekou（蛇口）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `SHEKOU ; CN ; CNSHK` | CNSHK | Port |
| CMA | `SHEKOU ; CN ; CNSHK` | CNSHK | Ramp • Door |
| YangMing | `SHEKOU, GD (CNSHK)` | CNSHK | — |

### Yantian（盐田）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `YANTIAN ; CN ; CNYTN` | CNYTN | Port |
| CMA | `YANTIAN ; CN ; CNYTN` | CNYTN | Ramp • Door |
| CMA | `DONGGUAN - YANTIAN, 44 ; CN ; CN1MG` | CN1MG | Door |
| YangMing | `YANTAI, SD (CNYNT)` | CNYNT | — |
| YangMing | `YANTIAN, GD (CNYTN)` | CNYTN | — |

### Chiwan（赤湾）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `CHIWAN ; CN ; CNCWN` | CNCWN | Door |
| YangMing | `CHIWAN, GD (CNCWN)` | CNCWN | — |

### Guangzhou（广州）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `GUANGZHOU - TONGHE, 44 ; CN ; CN1LU` | CN1LU | Door |
| CMA | `GUANGZHOU - DONGCHONG, 44 ; CN ; CN1LO` | CN1LO | Door |
| CMA | `GUANGZHOU (POP ONLY) ; CN ; CNCA9` | CNCA9 | Door |
| CMA | `GUANGZHOU - TONGDEWAI, 44 ; CN ; CN1KF` | CN1KF | Door |
| CMA | `GUANGZHOU - RENHE, 44 ; CN ; CN1LQ` | CN1LQ | Door |
| CMA | `GUANGZHOU - YUWOTOU, 44 ; CN ; CN1KK` | CN1KK | Door |
| CMA | `GUANGZHOU - SHILING, 44 ; CN ; CN1KC` | CN1KC | Door |
| CMA | `GUANGZHOU - FANGCUN, 44 ; CN ; CN1JR` | CN1JR | Door |
| CMA | `GUANGZHOU - XINZAO, 44 ; CN ; CNXZO` | CNXZO | Door |
| CMA | `GUANGZHOU - LUOCHONGWAI, 44 ; CN ; CN1JX` | CN1JX | Door |
| CMA | `GUANGZHOU - XINSHI, 44 ; CN ; CN1LW` | CN1LW | Door |
| CMA | `GUANGZHOU - DAGANG, 44 ; CN ; CN1JP` | CN1JP | Door |
| YangMing | `GUANGAO, GD (CNGUO)` | CNGUO | — |
| YangMing | `GUANGZHOU, GD (CNCAN)` | CNCAN | — |
| YangMing | `GUANLAN, GD (CNGLN)` | CNGLN | — |

### Shanghai（上海）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `SHANGHAI - PUDONG NEW DISTRICT, 31 ; CN ; CN1CI` | CN1CI | Door |
| CMA | `SHANGHAI PU DONG APT ; CN ; CNPVG` | CNPVG | Door |
| CMA | `SHANGHAI - SONGJIANG, 31 ; CN ; CNSNG` | CNSNG | Door |
| CMA | `SHANGHAI - NANHUI, 31 ; CN ; CNNNH` | CNNNH | Door |
| CMA | `SHANGHAI - CHONGMING, 31 ; CN ; CNCMG` | CNCMG | Door |
| CMA | `SHANGHAI - BAOSHAN, 31 ; CN ; CNBSD` | CNBSD | Door |
| CMA | `SHANGHAI - MINHANG, 31 ; CN ; CN1CJ` | CN1CJ | Door |
| CMA | `SHANGHAI - FENGXIAN, 31 ; CN ; CNFA1` | CNFA1 | Door |
| CMA | `SHANGHAI - JINSHAN, 31 ; CN ; CNJNS` | CNJNS | Door |
| CMA | `SHANGHAI (POP ONLY) ; CN ; CNPV1` | CNPV1 | Door |
| CMA | `SHANGHAI - QINGPU, 31 ; CN ; CNQG1` | CNQG1 | Door |
| CMA | `SHANGHAI ; CN ; CNSHA` | CNSHA | Port |
| YangMing | `SHANGHAI, SH (CNSHA)` | CNSHA | — |
| YangMing | `SHANNON (IESNN)` | IESNN | — |
| YangMing | `SHANNON, IL (USSVR)` | USSVR | — |
| YangMing | `SHANNON, MS (USSZN)` | USSZN | — |
| YangMing | `SHANTOU, GD (CNSWA)` | CNSWA | — |
| YangMing | `SHANWEI, GD (CNSWE)` | CNSWE | — |

### Ningbo（宁波）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `NINGBO - LIYANG, 33 ; CN ; CN1DF` | CN1DF | Door |
| CMA | `NINGBO - XIANGSHAN, 33 ; CN ; CN1DK` | CN1DK | Door |
| CMA | `NINGBO - CHALU, 33 ; CN ; CN1EM` | CN1EM | Door |
| CMA | `NINGBO - MAZHU, 33 ; CN ; CN1ET` | CN1ET | Door |
| CMA | `NINGBO (POP ONLY) ; CN ; CNPV7` | CNPV7 | Door |
| CMA | `DRONNINGBORG, 82 ; DK ; DKDRO` | DKDRO | Door |
| CMA | `NINGBO - CICHENG, 33 ; CN ; CNCCH` | CNCCH | Door |
| CMA | `NINGBO - ZHENHAI, 33 ; CN ; CNZHH` | CNZHH | Door |
| CMA | `NINGBO - LINSHAN, 33 ; CN ; CN1ES` | CN1ES | Door |
| CMA | `NINGBO - CIXI, 33 ; CN ; CN1CY` | CN1CY | Door |
| CMA | `NINGBO - YUYAO, 33 ; CN ; CNYOU` | CNYOU | Door |
| CMA | `NINGBO - QIUCUN, 33 ; CN ; CN1DI` | CN1DI | Door |
| YangMing | `NINGBO, ZJ (CNNGB)` | CNNGB | — |

### Qingdao（青岛）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `QINGDAO ; CN ; CNTAO` | CNTAO | Port |
| CMA | `QINGDAO ; CN ; CNTAO` | CNTAO | Ramp • Door |
| CMA | `QINGDAO (POP ONLY) ; CN ; CNPV3` | CNPV3 | Door |
| CMA | `QINGDAO - CHENGYANG, 37 ; CN ; CN1HX` | CN1HX | Door |
| CMA | `QINGDAO - HUANGDAO, 37 ; CN ; CN1HQ` | CN1HQ | Door |
| YangMing | `QINGDAO, SD (CNTAO)` | CNTAO | — |
| YangMing | `QINGXI, GD (CNQIN)` | CNQIN | — |
| YangMing | `QINGXIAN, HE (CNQXN)` | CNQXN | — |
| YangMing | `QINGYUAN, GD (CNQYN)` | CNQYN | — |

### Tianjin（天津）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `TIANJIN - XIQING, 12 ; CN ; CN1IH` | CN1IH | Door |
| CMA | `TIANJIN - DONGLI, 12 ; CN ; CN1IE` | CN1IE | Door |
| CMA | `TIANJIN - BAODIXIAN, 12 ; CN ; CN1II` | CN1II | Door |
| CMA | `TIANJIN - WUQING, 12 ; CN ; CNYU5` | CNYU5 | Door |
| CMA | `TIANJIN - JIXIAN, 12 ; CN ; CN1IK` | CN1IK | Door |
| CMA | `TIANJIN - JINGHAIXIAN, 12 ; CN ; CN1IJ` | CN1IJ | Door |
| CMA | `TIANJIN ; CN ; CNTSN` | CNTSN | Door |
| CMA | `TIANJIN (POP ONLY) ; CN ; CNPV5` | CNPV5 | Door |
| CMA | `TIANJIN - JINNAN, 12 ; CN ; CN1IG` | CN1IG | Door |
| CMA | `TIANJIN - BINHAI, 12 ; CN ; CN1IC` | CN1IC | Door |
| CMA | `TIANJIN - BEICHEN, 12 ; CN ; CN1IB` | CN1IB | Door |
| CMA | `TIANJIN - DAGANG, 12 ; CN ; CN1ID` | CN1ID | Door |

### Xiamen（厦门）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `XIAMEN (POP ONLY) ; CN ; CNXM1` | CNXM1 | Door |
| CMA | `XIAMEN ; CN ; CNXMN` | CNXMN | Port |
| CMA | `XIAMEN ; CN ; CNXMN` | CNXMN | Ramp • Door |
| YangMing | `XIAMEN, FJ (CNXMN)` | CNXMN | — |

### Dalian（大连）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `DALIAN - ZHONGSHAN, 21 ; CN ; CN1HD` | CN1HD | Door |
| CMA | `DALIAN - PULANDIAN, 21 ; CN ; CN1HJ` | CN1HJ | Door |
| CMA | `DALIAN - GANJINGZI, 21 ; CN ; CN1GY` | CN1GY | Door |
| CMA | `DALIAN - JINZHOU, 21 ; CN ; CN1GZ` | CN1GZ | Door |
| CMA | `DALIAN (POP ONLY) ; CN ; CNPV4` | CNPV4 | Door |
| CMA | `WUDALIANCHI, 23 ; CN ; CNWA2` | CNWA2 | Door |
| CMA | `DALIAN ; CN ; CNDLC` | CNDLC | Port |
| CMA | `DALIAN ; CN ; CNDLC` | CNDLC | Ramp • Door |
| CMA | `DALIAN - XIGANG, 21 ; CN ; CN1HC` | CN1HC | Door |
| CMA | `DALIAN - SHAHEKOU, 21 ; CN ; CN1HB` | CN1HB | Door |
| YangMing | `DALIAN, LN (CNDLC)` | CNDLC | — |
| YangMing | `DALINGSHAN, GD (CNDLS)` | CNDLS | — |

### Istanbul（伊斯坦布尔）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `HAYDARPASA ISTANBUL ASIAN SIDE ; TR ; TRHAY` | TRHAY | Port |
| CMA | `HAYDARPASA ISTANBUL ASIAN SIDE ; TR ; TRHAY` | TRHAY | Ramp • Door |
| CMA | `ISTANBUL, TR ; TR ; TRXXI` | TRXXI | Door |
| CMA | `ISTANBUL ; TR ; TRIST` | TRIST | Door |
| CMA | `ISTANBUL, AMBARLI PORT E. SIDE ; TR ; TRAVC` | TRAVC | Port |
| CMA | `ISTANBUL, AMBARLI PORT E. SIDE ; TR ; TRAVC` | TRAVC | Ramp • Door |
| YangMing | `ISTANBUL (TRIST)` | TRIST | — |

### Rotterdam（鹿特丹）

| 船司 | 搜索名 | LOCODE | 类型 |
| --- | --- | --- | --- |
| CMA | `ROTTERDAM, NY ; US ; USRAJ` | USRAJ | Door |
| CMA | `ROTTERDAM ; SG ; SGHQ1` | SGHQ1 | Door |
| CMA | `ROTTERDAM ; NL ; NLRTM` | NLRTM | Port |
| CMA | `ROTTERDAM ; NL ; NLRTM` | NLRTM | Ramp • Door |
| CMA | `ROTTERDAM JUNCTION, NY ; US ; USRJN` | USRJN | Door |
| YangMing | `ROTT A. INN (DERMI)` | DERMI | — |
| YangMing | `ROTTENACKER (DERTA)` | DERTA | — |
| YangMing | `ROTTENBURG A. D. LAABER (DERTT)` | DERTT | — |
| YangMing | `ROTTENBURG AM NECKAR (DEZFI)` | DEZFI | — |
| YangMing | `ROTTERDAM (NLRTM)` | NLRTM | — |
| YangMing | `ROTTERDAM JUNCTION, NY (USRJN)` | USRJN | — |
| YangMing | `ROTTERDAM, NY (USRTD)` | USRTD | — |
| YangMing | `ROTTUM (NLRTU)` | NLRTU | — |
| YangMing | `ROTTWEIL (DEROL)` | DEROL | — |

## 结论 / 对引擎的意义

1. **别名表不能只按「港口」建，要按「船司 × 港口」建** —— 同一港口各家名字/码都不同
2. **必须带类型过滤**：只接受 Port 类候选，跳过 Door/Ramp（否则拿到门到门点，无船期）
3. **必须带国家消歧**：候选匹配时用国家码约束，避免南沙→深圳南山、鹿特丹→德国小镇
4. **首选策略**：查询时优先用「港口级」名字（如 NANSHA 而非 NANSHAN），再回退码头级
5. 各家接口可直连的优先直连（CMA/YangMing），被反爬拦的走浏览器上下文（MSC/ZIM）

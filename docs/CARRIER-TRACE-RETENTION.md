# 各船司 Track & Trace 数据保留期（2026-10-26 查证）

> 用途：解释「为什么这单查不到」。船司官网的公开查询**不是永久档案**，过期就查不到，
> 跟号码对不对、网络通不通都无关。

## 一、有官方明文（可直接引用原文）

| 船司 | 公开查询保留期 | 原文 / 出处 |
|---|---|---|
| **Wan Hai 万海** | **90 天** | “Cargo status data is only kept for 90 days.” — wanhai.com → FAQ / Cargo Tracking 页 |
| **CMA CGM 达飞** | **还空箱后 15 天** | 追踪页报错原文：“…because your container has already been returned to the depot more than 15 days” — cma-cgm.com/eBusiness/Tracking |
| **Maersk 马士基** | **到「还空柜」为止；或 ETA + 30 天** | 马士基大中华区官方指引 PDF：「此功能只适用于追踪当前正在运输中的货柜，如果目的港已归还空柜，或在 ETA+30 天后才来追踪都是无法用此方法追踪的」（非注册用户） |
| **Yang Ming 阳明** | **订舱资料 1 年** | yml.com.cn 订舱查询页：“Within one (1) year of booking records are available.”（提单查询未明写） |
| **Hapag-Lloyd 赫伯罗特** | **约 12 个月**（我方实测） | 实测：`HLCUTS12608*`（2026-08）可查 14 条事件；20 个 2025 单单全部 `DOCUMENT does not exist`。官方只对 reefer 产品写明「到港日 -3 个月 ~ +5 个月」 |
| **MSC 地中海** | reefer 数据到「还空 + 30 天」；BL 查询无明文 | MSC iReefer FAQ：“available until 30 days after empty received at container yard (trip end)” |
| **Evergreen 长荣** | IoT/reefer 数据到「行程结束 + 30 天」；BL 查询无明文 | ShipmentLink FAQ：“from the initiation of the journey to 30 days after journey completion” |

## 二、没查到官方说明

ONE、ZIM、COSCO、HMM、SITC、Akkon、PIL、Matson、KMTC —— 官网 FAQ 均未写保留期。

侧面证据（第三方聚合商的口径，能反推「大多数船司的有效窗口就 2~3 个月」）：

| 来源 | 口径 |
|---|---|
| ShipsGo | 跟踪到 Gate Out 或**卸货后 80 天**，理由写明「most carriers restrict data sharing after that period」 |
| Tradlinx | 套餐默认 **90 天**保留，付费版才 unlimited |
| Expeditors（货代） | 完成后 **120 天** |
| AfterShip（通用） | **120 天** |
| FMC/NSAC 2022 建议 | 呼吁船司把集装箱里程碑「公开可查 **2 年**」——反证现状远小于 2 年 |

## 三、结论（对插件的意义）

1. **查询窗口大致排序**：CMA CGM(15 天) < Maersk(ETA+30) < 万海(90 天) < 阳明(1 年) < Hapag(约 1 年) < MSC/长荣(依产品而定)。
2. 单据超过窗口 → 官网一律返回「查无此单 / 找不到货物记录」，任何工具都查不到，只能走 API 或有账号的客户门户。
3. 插件在「查无」时的文案已按船司区分，避免把「过期」误报成「号码错 / 货代单」。

## 四、复核方式（随时可跑）

```bash
# 单号直接打引擎
node engine/tracking/cli.mjs --number <BL> --carrier <carrier> --timeout 90000
```

新单能查、旧单查不到 = 正常；**新单（3 个月内）也查不到才是真问题**。

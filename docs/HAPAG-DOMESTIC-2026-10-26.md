# Hapag-Lloyd 国内直连实测（2026-10-26）

**结论：国内 IP 直连没问题，之前查不到是两个独立原因——走了废弃的 legacy 页 + 单子本身超过官网保留期。**

## 1. URL 实测矩阵（Windows 测试机，国内出口 IP）

| URL | 结果 |
|---|---|
| `hapag-lloyd.com/en/.../track-by-booking-solution-legacy.html` | ❌ 302 → `.cn/en/...legacy` → 显示「由于维护工作，我们的在线业务服务…」，**页面 0 个表单** |
| `hapag-lloyd.cn/en/.../track-by-booking-solution-legacy.html` | ❌ 同上（legacy 页两个域都废弃了） |
| `hapag-lloyd.com/en/.../track-by-booking-solution.html` | ⚠️ 能开，会被 302 到 `.cn/en/...`，较慢 |
| **`hapag-lloyd.cn/zh/.../track-by-booking-solution.html`** | ✅ **有表单、有结果、最快**（国内首选） |

所以适配器改成：**CN 中文页优先 → 失败再试 .com**；表单是 JS 渲染的，必须等 `[id*="hl16"]` 出现（15s）再判「不可用」。

## 2. 表单字段

- `hl12` = 订舱号（Booking），**只接受纯数字**（如 `38095103`），填字母会报「该值不是合法的数值」
- `hl16` = 提单号（BL），`HLCU` + 12 位
- `hl18` = 查询按钮

## 3. 关键发现：官网只保留近 12 个月

同一批真实单据（`Mediterranean Worksheet 2025` 里的 20 个 HLCU 号）：

| 号码 | 年份 | 结果 |
|---|---|---|
| `HLCU9DD221329487` | 2026-08 | ✅ 14 条事件（YANTIAN → ISTANBUL，箱 TCLU1555844） |
| `HLCUE300F5C71EA7` | 2026-08 | ✅ 有结果 |
| `HLCU94708ABFC5A7` | 2025 | ❌ `DOCUMENT does not exist (Format : HLCU10CFF08B7518)` |
| `HLCU220885E704A8` | 2025 | ❌ 同上 |
| 其余 18 个 2025 单 | 2025 | ❌ 同上（批量 0/20） |

**不是号码错、不是打不开，是官网查不到一年前的单。** 插件文案已改成
「Hapag 官网无记录（仅保留近 12 个月）」，不再误导成「货代单 / 号码错」。

## 4. 单票耗时

- Windows（国内 IP，CN 页）：**8~15s**
- macOS（.com 页，有 CF 抖动）：**可到 100s**（改 CN 优先后 ~10s）

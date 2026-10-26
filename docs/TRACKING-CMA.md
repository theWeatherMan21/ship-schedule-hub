# CMA CGM 达飞 · 提单/订舱/箱号追踪接入说明（2026-10-12）

## 一、通路（真单实测一次；DataDome 限流待复核）

- **入口**：GET `https://www.cma-cgm.com/eBusiness/Tracking`（正常时返回搜索表单）
- **表单**：`input#Reference`（提单/订舱/柜号）+ `button#btnTracking`（提交）
- **提交**：`POST https://www.cma-cgm.com/ebusiness/tracking/search` → 200 → 同页渲染结果
- **结果行**（实测形态）：
  `CMAU2081132 22G1 (20ST) GATE IN EMPTY AT DEPOT ISTANBUL, AMBARLI PORT E. SIDE Thu. 05-MAR-2026 14:41 PM [Display Details]`
- **否定态**：`Your shipment was not found, please modify your search`

## 二、真单验收记录（2026-10-12）

- `NGP3170431`（Booking）→ **2 柜**：`CMAU2081132` / `CMAU7247427`，22G1 (20ST)，`GATE IN EMPTY AT DEPOT` @ ISTANBUL, AMBARLI PORT E. SIDE，2026-03-05 14:41 / 14:35 —— **首次访问一次性成功**。
- 之后**连续访问触发 DataDome 拦截**（换出口 IP、换干净浏览器档案均未绕过；系访问频度累积所致）→ **站方限流机制，非程序缺陷**。
- 结论：**链路可用**（低频访问）；适配器按"低频 + 被拦冷却重试"设计。

## 三、适配器策略（engine/tracking/cma.mjs）

- 无头浏览器 → 打开追踪页 → 等表单就绪（被拦时表单不出现，可判别）→ 填号提交 → 轮询结果（`Tracking details` / `was not found`）。
- **被拦自动冷却重试**（默认 25s × 2 次）；仍失败 → 如实返回 `errorKind:'blocked'`（不伪装成功）。
- 纯解析函数 `parseCmaText`（导出，离线单测 **23/0**，用例全部来自实况样本）；`cmaDate` 做 12/24 小时制换算。
- 边界：当前解析**列表级结果**（柜号/箱型/状态/地点/时间）；"Display Details" 的逐柜明细时间线待复核时补。

## 四、待办（解冻条件）

- **冷却后复核**（数小时/次日）：用 `NGP3170431` 跑 CLI 验收 →
  - 通过后：`identify` 的 cma `tracking:'none'→'live'`；UI 说明栏列入；补 Display Details 明细解析；
  - 若长期被限流：保持 `tracking:'none'`（UI 不宣称接通），如实标注站方限制。

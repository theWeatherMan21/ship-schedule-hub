# 任务卡 V6D —— 收尾 ONE 一家（7/10 → 8/10）

爸爸红线不变：全程无头 / browser-profile 独占 / 每通一家写 PROJECT.md「四·五、船司链路台账」/ 自述不算证据。

## 已完成（勿重做）
- 并发端到端 **prefilled 7/10**（run-2026-09-22T08-24）：msc / maersk / evergreen / hmm / **cma（Transit 45 Days）** / **cosco（Shortest Transit 26 天）** / **yangming**
- 婉宜已修：`isBlockPage` SPA 空 body 二次采样 + `openPage` 等 load ≤5s
- 已知不可修边界（无需再试）：zim（Akamai 深链挑战）、hapag（Cloudflare 交互挑战，降级档）

## 本轮只做 1 件事（时间盒 1.5 小时）

**修 ONE 一家**：并发跑报「候选点选未完成（o=false d=false），仅开页」，但**单跑是 OK 的**（evidence/m4-one.txt 11:53 版：输入 "ningbo" → 候选 `NINGBO, ZHEJIANG, CHINA (CY)` 选中 → 搜索 → 结果表）。说明是**并发下的时序问题**，不是选择器错误。

排查方向：
1. 并发时 ONE 页面渲染慢 → 候选等待时间不够（当前可能 12s，试提到 20-25s）
2. 候选容器 `role=option` 在并发下可能被其它页面抢占/未渲染 → 参考 m4-probe 的轮询匹配（排除隐藏原生 select）
3. 输入后是否有 re-render 清空输入框 → 加「点选后回读 inputValue 校验，失败则重试一次」

## 验收（DoD）
1. 真跑过：`node engine/query.mjs --origin Ningbo --destination Istanbul --date 2026-09-29` 并发跑，**prefilled ≥ 8/10**
2. 证据留档：PROJECT.md 链路台账 10 行判定列全填；docs/PORT-ALIASES.md 补 ONE 的实测候选串（`NINGBO, ZHEJIANG, CHINA (CY)` / `ISTANBUL, TURKEY (CY)`）
3. 回归没坏：已 prefilled 的 7 家不许掉
4. 无窗口：跑完 `osascript -e 'tell application "System Events" to tell process "Google Chrome" to count windows'` 须为 0

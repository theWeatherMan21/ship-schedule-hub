# 任务卡 V6C —— 四家配方打磨（并发端到端 prefilled 4 → 目标 8）

爸爸红线不变：全程无头（硬闸已焊死）/ browser-profile 独占 / 每通一家写 PROJECT.md「四·五、船司链路台账」/ 自述不算证据（evidence 三件套）。

## 已完成（勿重做）
- 词典驱动：`db/ports.db` + `engine/lib/portsolve.mjs` 三档解析，7 配方已接入
- 词典版回归 ✅：COSCO/Evergreen/HMM/YangMing/MSC/ONE（单跑均 OK）
- Maersk v6 回归 ✅（5 条船期）
- **并发端到端 ✅ 0 崩溃，prefilled 4/10**（run-2026-09-22T07-53）：
  - ✅ prefilled：msc / maersk / evergreen / hmm
  - ⏳ opened 6 家待修（见下）
- 婉宜已修：`isBlockPage` SPA 空 body 误判（二次采样）+ `openPage` 等 load ≤5s

## 本轮任务（时间盒 3 小时）

修 4 家配方，让**并发跑**也能 prefilled（不只单跑 OK）：

1. **cosco / one** — 报错「候选点选未完成（o=false d=false）」：输入后候选没被选中。参考 m4-probe 的候选等待+点击逻辑（轮询匹配 + 排除隐藏原生 select），移植到配方
2. **yangming** — 「locator.waitFor: Timeout 20000ms exceeded」：表单定位器在并发下等不到，加渲染等待/换选择器
3. **cma** — 「配方超时(60000ms)」：Kendo 表单交互耗时过长，优化步骤或调超时；注意 CMA 有 IP 频率限制，别高频重试（跑一次等几分钟）

## 验收（DoD）
1. 真跑过：`node engine/query.mjs --origin Ningbo --destination Istanbul --date 2026-09-29` 并发跑，**prefilled ≥ 8/10**（或每家有明确不可修的证据说明）
2. 证据留档：PROJECT.md 链路台账 10 行判定列全填；`docs/PORT-ALIASES.md` 补 cosco/one/yangming/cma 的实测候选串
3. 回归没坏：Maersk v6 单跑仍出 5 条船期；`prefilled` 已有的 4 家不许掉
4. 无窗口：跑完 `osascript -e 'tell application "System Events" to tell process "Google Chrome" to count windows'` 须为 0

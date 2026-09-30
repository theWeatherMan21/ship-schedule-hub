# 婉宜急件（跑完当前家再看）

爸爸反馈：**测试期间 Chrome 窗口反复弹到他屏幕上，严重影响使用**。

## 原因（已查实）
1. `qa/m4-probe.mjs` 只 import 了 `quietWindow` 没调用 → 每家探针都弹出可见窗口
2. 我这边验证脚本与你的探针**并发抢同一个 browser-profile** → "Opening in existing browser session" 冲突，还触发了 "Restore pages?" 弹窗

## 已修 / 你要做的
1. ✅ 我已在 `qa/m4-probe.mjs` 第 112 行 launch 后加了 `quietWindow(ctx, 'minimized')`（CDP 最小化，屏幕不可见）
2. 你继续跑探针时**确认每次 launch 后都调 quietWindow**；新增脚本同样照做
3. **单实例红线：同一时间只允许一个进程使用 browser-profile**。串行跑各家，不要并行开两个探针
4. 每次探针启动后自检一次：`osascript -e 'tell application "System Events" to tell process "Google Chrome" to get value of attribute "AXMinimized" of every window'` 输出不得含 false（除 about:blank 外）

## 另（我已验证，供你提速）
- Playwright 默认 headless:true（旧模式）对 MSC 仍 403，但 **`--headless=new` + 真实 UA + ignoreDefaultArgs:['--enable-automation']** 在新 profile 上 3 连 200——**无头能用，且不弹窗**。家探可优先走此模式，爬不动再退回有头最小化。
- Maersk Ningbo→Istanbul 已出 CY 候选并选中成功（你的 m4-maersk.txt 我看过），EMPTY 判定可能是等结果时间不够（>=25s）或 CY/SD 组合问题，参考 qa/autonomous-maersk-v6.mjs 的结果等待循环（最长 35s）。


## 【更新 16:35 · 窗口问题已根治，婉宜已改好】

1. **engine/browser.mjs 的 launch() 默认改为无头新档**（`--headless=new` + 真 UA + `ignoreDefaultArgs:['--headless=old']`）：
   零窗口、零气泡、不抢焦点。`headless:'auto'`（默认）= 无头新档；只有显式传 `headless:false` 才走有头+CDP最小化。
   qa/ 下所有脚本调用点已统一改成 `launch({})`。
2. MSC 的 A/B 实测（供参考）：无头新档在新 profile 上 3 连 200；如果某家在无头下被拦（出现 403/挑战页），
   配方里再对该家显式 `launch({ headless: false })` 走有头最小化兜底。
3. 你在跑的探针如果还开着旧进程，跑完当前家后 Ctrl-C 重新拉起，确保用新 launch 语义。
4. ONE 已看到 Istanbul 候选含 CY 字样（"ISTANBUL, TURKEY (CY)"）——输入框回读为空说明 ONE 的组件
   点击后不回填，需要按「选中后读输入框值」验证，空则改用 keyboard ArrowDown+Enter 方式。


## 【再更新 16:50 · 无头锁死，禁止回退】

1. qa/ 下**所有**探针/诊断脚本已统一 `launch({})`（无头新档），包括你正在改的 m4-probe.mjs。
   engine/query.mjs 产线入口也已改默认无头。
2. 4 个旧窗口实验脚本已归档改名 `_archived-probe-*.mjs`——**别再运行/引用它们**。
3. **任何新脚本一律 `launch({})`；确因反爬必须有头时，先在交活说明里写明理由，单独 `headless:false`
   且必须 quietWindow 最小化，并在启动后用 AXMinimized 自检。**
4. 爸爸已两次反馈窗口打扰，此条为最高优先级红线。


## 【21:50 婉宜 · run8 续跑须知 —— run7 于 20:58 中断，别从头再跑】

run7 已确认的结论（证据：run7.log + evidence/m4-*.txt）：
- **真数据 7 家**：Maersk（Ambarli 6 条，26-50 天）、MSC（9 条真实船期）、COSCO（3 艘船多航次，26/45/46 天）、
  ONE（YM WELCOME 051W，55 天）、Evergreen（BEX 28/33、MD2 38 天）、Yang Ming（1 条 63 天）、
  CMA CGM（10+ 方案，BEX 直航 31 天）
- **两个判定 bug 已定论**：① CMA 的 EMPTY 是**误判**——正则把 eco 计算器里的 "NO RESULTS:" 文案当成空结果，
  实际结果文本里有 `Tuesday, 22-SEP-2026 POL Ningbo...` 真实船期行；② HMM 的 "OK" 也是**误判**——
  结果文本实际是 "Search Results (0)"，HAYDARPASA TMNL 没船期。
- **剩 3 家**：① HMM → 换 Ambarli / Kumport / Marport 变体（先看 qa/hmm-dest-variants.json）；
  ② ZIM → `/tools/shipping-schedules` 是 404，先找真实船期入口 URL；
  ③ Hapag → 403 但结果文本有 5997 字符真实内容（"This is the New Vessel Schedule"），
  疑似只是表单选择器不对，重新探表单（不是纯 CF 拦截）。
- **欠账**：PROJECT.md 四·五节台账只写了 Maersk 一行，其余 9 家（含已确认的 6 家）必须补写；
  docs/PORT-ALIASES.md 里 CMA / Hapag / ZIM / HMM 四行也要按新结论改。

**run8 优先顺序**：① 先把已确认的 7 家落盘（台账 + 对照表），中断也不丢；② 再攻 HMM / ZIM / Hapag。
红线不变：`launch({})` 无头新档、单实例串行、搜不到不编造、每批 ≤3 家。

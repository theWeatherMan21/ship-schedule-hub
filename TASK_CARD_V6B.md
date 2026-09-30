# 任务卡 V6B —— V6 余量收尾（续 session 20260922_093509_d5045e）

爸爸红线不变：全程无头 / browser-profile 独占 / 每通一家写台账 / 自述不算证据。

## 已完成（勿重做）
- portdb（db/ports.db）+ portsolve.mjs 三档解析 + 7 配方接入（cma/evergreen/hmm/maersk/msc/yangming/zim）
- 词典版回归 ✅5 家：COSCO/Evergreen/HMM/YangMing/MSC（evidence/m4-*.txt 11:26-11:46 版）
- README.md 已交付；Hapag 降级档已定案（只开页）；ZIM 深链 Akamai 拦（半闭环）

## 本轮做 3 件事（时间盒 2 小时）
1. **CMA / ZIM 词典版回归**：各跑一次 Ningbo→Istanbul（CMA 注意 IP 频率限制，别高频重试）
2. **台账收口**：PROJECT.md 链路台账 10 行全填判定列；docs/PORT-ALIASES.md 把 ONE（CY 候选）和 ZIM（Besiktas/TRBTS、Ambarli/TRKPX、Haydarpasa/TRHYY）补进主表
3. **并发模式加固**：12:07 首次 10 家并发端到端 0 崩溃，但单跑 OK 的家（Maersk/COSCO/YangMing）并发下被反爬拦——错峰启动（每家间隔 3-5s）或复用会话，目标并发跑 ≥4 家 prefilled

（ONE 已由婉宜修复：词典 alias 改短前缀 "ningbo"→候选出→CY 选中→结果表 OK）
（Maersk v6 回归已由婉宜跑过 ✅ DoD-6）

## DoD
每家 evidence 三件套 + 台账判定列无空 + query.mjs --origin Ningbo --destination Istanbul 一次并发跑无一家崩整体。

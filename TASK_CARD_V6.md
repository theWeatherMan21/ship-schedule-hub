# 任务卡 V6 —— 词典驱动 + 收尾两家

爸爸红线（违反=返工）：
1. 全程无头（engine/browser.mjs 硬闸已焊死，勿动）
2. browser-profile 单进程独占，跑前确认无他人占用
3. 每通一家立刻写 PROJECT.md「四·五、船司链路台账」，不许攒批
4. 自述不算证据：每家留 evidence/m4-<carrier>.txt + .png + xhr.json

## 背景（已就绪，勿重建）
- 港口词典 `db/ports.db`（17521 港）+ 查询层 `engine/portdb.mjs`（findPort(word) → {locode, carrierAliases}）已验证
- M4 已通路 7 家：Maersk(×2: Istanbul 直接搜无船期→用 Ambarli Port Istanbul)/MSC/COSCO/ONE/YangMing/Evergreen/HMM（HMM Ningbo→Istanbul 0 条=无直航真实答案）
- M4 待办：ZIM（/tools/shipping-schedules 404，需从 zim.com 首页找真实入口）、CMA（需 cookie 履历，Kendo 表单脆）、Hapag（Cloudflare）

## 本轮任务（时间盒 4 小时）
1. **portdb 接进配方**：engine/recipes/*.mjs 里手写的港口字符串改为调 findPort：
   - 用户输 "Ningbo" → findPort → 取该船司的 alias（无则用 `NAME (LOCODE)` 兜底）
   - 候选选择仍按 CY 徽标/LOCODE 匹配（词典给的是输入串，选择逻辑不变）
   - 每改一家，跑一次 Ningbo→Istanbul 实测留证，写台账
2. **ZIM**：从 zim.com 首页导航找船期真实 URL（可能要过 Akamai，无头新档配方已验证三连 200），跑通 Ningbo→Istanbul 全链，判定写台账
3. **CMA/Hapag 降级定案**：无头实测仍被拦的话，配固定「deep link 直达结果页」或「只开页」降级档，判定从 ❌ 改为「降级档」，写台账说明原因
4. **更新 docs/PORT-ALIASES.md**：把 ZIM/CMA/Hapag 三家的实际称呼补进主表

## DoD（六条全过才算交付）
1. 真跑过：每家 evidence 三件套（txt/png/xhr.json）
2. 爹地视角能用：engine/query.mjs --origin Ningbo --destination Istanbul 并发跑，10 家各回各的判定，无一家崩整体
3. 已部署：改的是源码（无需重打包壳，但 npm run build 若动了 UI 要重出 .app）
4. 证据留档：PROJECT.md 台账 10 行全填（判定列不许有空）
5. 一句使用说明：README 或交付说明里写清 portdb 用法
6. 回归没坏：Maersk Shanghai→Rotterdam v6 脚本重跑仍出 5 条船期

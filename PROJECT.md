# ShipScheduleHub 驾驶舱（PROJECT.md）

> 唯一真相源。中断后靠这份 + 芝麻仓重建上下文。更新频率：每轮收工 3 行。
> 主管：婉宜 · 执行：码农（manong）· 最近更新：**2026-09-30**
> 路径：`/Users/russospencer/Documents/trae_projects/ShipScheduleHub`
> 部署位置：**`/Applications/ShipScheduleHub.app`**（已上线自用）
> 仓库：**https://github.com/theWeatherMan21/ship-schedule-hub**（私有，2026-09-30 首推，402 文件）

## 〇、当前状态（2026-09-30 · 婉宜）

| 维度 | 现状 |
|---|---|
| **北极星** | **已达成** —— 填一次「起运港+目的港+日期」→ 11 家船司并发查 → 结果**直接显示在 App 内**（不再只是开页）|
| 覆盖 | **11 家**：YangMing / MSC / Maersk / ONE / COSCO / Hapag / ZIM / CMA / Evergreen / OOCL / HMM |
| 实测（宁波→伊斯坦布尔） | **11/11 家出真船期，79 条**；上海→鹿特丹 10/11 家、93 条（ZIM 该线无航线）|
| 速度 | 全量 ≈60-90s（最慢 OOCL 38-77s）；**同条件 20 分钟内复查 1s**（结果缓存）|
| 打扰 | **零窗口**：浏览器走 `--headless=new`，屏幕上不出现任何窗口 |
| 界面 | 浅色 + 时间轴行程卡（按船司分组，开船日期为主信息，hover 反馈）——爹地 9-30 选定 002 稿 |
| 运行期数据 | `~/Library/Application Support/ShipScheduleHub/`（profile / evidence / cache，**不在 .app 包内**）|

**在制（WIP）**：无（本轮全部收口）。**下一步候选（待爹地点头才开工）**：
①查询中 spinner 等 4 项 UI 细打磨 ②更多港口别名扩面（釜山/青岛/深圳/新加坡）③「真·植入 WebView」长期方案（Tauri 隐藏窗口，替代外部 Chrome）

## 一、北极星（一句话）
> 做完的那天，**爹地能填一次「起运港 + 目的港 + 日期」，一键查到 Top10 船司的船期，
> 结果直接显示出来看得见** —— 不用再手工逐个开网页、重复输入。

**边界**：不做归一化对比表、不走官方 API 授权（复制各家网页自己发的 XHR）、不嵌 iframe。
**9-24 爹地追加硬指标**：结果至少 10 条及以上；全部船司同时开始（并发）。

## 二、里程碑表

| # | 里程碑（可演示的结果） | DoD | 时间盒 | 状态 |
|---|---|---|---|---|
| M1 | 引擎跑通：命令行能并发打开船司页并预填 | 真跑过 + NDJSON 事件 + 截图 | 1 天 | **已交付待验收**（9-10 实测：Maersk 预填成功、MSC 兜底开页、窗口真静默） |
| M2 | **Tauri 桌面 App 能打开** | 爹地能亲手双击打开看到窗口 | 1 天 | **已交付待验收**（9-21：壳已建、`cargo check` 通过、.app + .dmg 构建成功；婉宜复核属实） |
| M3 | App 里点「并发查询」真能跑：UI ↔ 引擎接通 | 在 App 内点一次，逐家状态实时回显 | 1 天 | **已交付待验收**（Rust 真 spawn 引擎 + `engine://event` 转发，事件名与前端一致；婉宜复核属实） |
| M4 | Top10 配方铺满并实测，状态如实标注 | ≥5 家 `prefilled`，其余如实标兜底/失败 | 2 天 | 未开始（10 家配方已写，仅 2 家实测） |
| M5 | 交付到 `/Applications`，爹地验收 | 视觉验收截图 + 一句话使用说明 | — | 未开始 ← **发现硬缺陷，见风险日志 9-21** |

> 状态只用四态，禁百分比。

## 三、当前 WIP（≤2）

| # | 在制事项 | 下一步动作 | 负责人 | 时间盒截止 | 距可验收还差 |
|---|---|---|---|---|---|
| 1 | **🚀 部署态 10/10 验收通过（2026-09-23）**：把引擎同步进 `/Applications/ShipScheduleHub.app/Contents/Resources/` （含此前**缺失的 `db/ports.db` 词典库**）后，用**部署态引擎真跑** `cd "/Applications/ShipScheduleHub.app/Contents/Resources/engine" && node query.mjs --origin Ningbo --destination Istanbul` → **prefilled 10 / opened 0 / failed 0**，窗口 `AXMinimized=true`（零打扰）。部署态专属修复：**①msc 加 `timeoutMs:130000`**（默认 60s 在部署态 profile 下会超时）；**②hapag 需完整站点 cookie 履历**——部署态 profile 缺 `OptanonAlertBoxClosed`/`FPID`/`_ga` 等导致候选 20s 不出，同步源码态 profile（376M，旧 profile 备份为 `browser-profile.bak-20260923`）后翻绿。**教训：同一份代码在不同 profile 下结果可能不同（站点 cookie 履历影响 SPA 行为），部署态必须真跑。**

**🎉 10/10 全通（2026-09-23）**：`node engine/query.mjs --origin Ningbo --destination Istanbul` → **prefilled 10 / opened 0 / failed 0**（msc/maersk/zim/cma/cosco/hapag/one/evergreen/yangming/hmm）。两项关键突破（均来自爹地指点）：**①日期改可选**（默认不填=用网站默认当天，少一个脆弱交互，重跑 8/10 不掉）；**②有头 + CDP 最小化 + 单页复用**——CF/Akamai 只看指纹不看窗口可见性，故有头真指纹自动过盾，而 CDP `windowState=minimized` 让窗口全程不可见（`AXMinimized=true` 硬证据）。由此 hapag（Managed Challenge，无头永远被拦）与 zim（旧配方**无条件 throw** 导致表单全通也显示 opened，已改成真被拦才降级）双双翻绿。引擎新增 `launchHeadedQuiet()`：有头+立即最小化，**最小化失败自动降级无头**（屏幕绝不留下窗口）。「M4+词典驱动」原记录：：并发端到端 **prefilled 8/10**（run-2026-09-22 最新）：msc/maersk/cma/cosco/one/evergreen/yangming/hmm 全绿（cma Transit 45 Days、cosco Shortest Transit 27 天）；剩 opened 2 = **zim**（Akamai 深链）/ **hapag**（CF）= 硬边界降级档「只开页」。本轮婉宜修的四处：①isBlockPage SPA 空 body 二次采样 ②批内累加错峰+默认串行 ③抖动重试 ④**COSCO 词典 alias 前缀修正**（"ningbo china"→"ningbo"，autocomplete 前缀匹配）+ typeAndPickCandidate 候选池 pick 不中时继续轮询（同容器先渲染 BOTH/CY/DOOR 服务模式项 30 个）。0 崩溃 | **9-23 追加**：①日期改可选（默认不填=用网站默认当天，传 --date 才填）→ 重跑仍 **8/10**，CMA 因默认日期不同出 Transit 52 Days（数据真实）；②**Hapag CF 实测定案**：Managed Challenge **无头永远被拦**（无可点验证界面）、**有头真窗口 10-15s 自动放行**、有头 cookie（仅 __cf_bm）**救不了无头** → hapag 只能走有头或维持降级档，等爹地定 A/B。剩 zim/hapag 硬边界，可按需做「手动接管」体验优化 | 婉宜 | — | 8✅ 2硬边界 |
| 2 | **港口词典 db/ports.db**（爹地定的架构）：UN/LOCODE 全量 17,521 港入库 + aliases 船司实测映射 66 条 + engine/portdb.mjs 查询层 | 已验证：Ningbo/Istanbul/Ambarli/Gebze/Izmit/Haydarpasa 全命中；词典驱动 Evergreen 实测通过 | 婉宜 | — | ✅ 底座完成，配方可调用 portdb 消歧 |
| 2 | **补 App 内界面截图**（DoD-2/4） | 爹地屏幕解锁后跑 `npm run tauri:dev` 截图 | 婉宜 | — | 等爹地解锁屏幕 |

## 四、关键路径（当前里程碑 → 验收）
```
[M1 引擎 ✅] → [M2 壳 ✅] → [M3 接线 ✅] → [★ 自主查询闭环 ✅ 9-21 已证] → [M4 配方铺满] → [M5 部署+验收]
现在卡在：M4 —— Maersk 全自主跑通（见 FINDINGS-2026-09-21.md），把 v6 逻辑写回配方 + 铺其余 9 家
```

## 四·五、船司链路台账（跑通一家记一家，当轮更新；细节挂 FINDINGS 与 evidence）

| 船司 | 状态 | 跑通链路（入口→填法→结果） | 关键配方要点 | 证据 | 更新 |
|---|---|---|---|---|---|
| Maersk | ✅ 自主闭环×2 | ① Shanghai→Rotterdam: 5 条船期(33-47 天) ② **Ningbo→Istanbul 系**: Istanbul 本身无直航,须选 `Ambarli Port Istanbul (CY)` → 6 条船期(26-50 天) | ariaSnapshot 读候选；CY 按徽标选；**同港异名: Istanbul→Ambarli Port**；country 消歧 | engine/evidence/autonomous-maersk-*、qa/autonomous-maersk-ambarli.mjs、docs/PORT-ALIASES.md | 9-21 |
| MSC | 🧪 入口 A/B 通过 | search-a-schedule 入口 200（headless=new+伪装 UA，新 profile 3 连 200）；全链(候选/搜索)验证中 | Playwright 默认 headless:true=旧模式仍 403；`--headless=new`+`ignoreDefaultArgs:['--enable-automation']`+真 UA → 新 profile 也过 | /tmp/headless-{ab,pro,fresh}.mjs 输出 | 9-21 |
| ZIM | ✅ 词典版回归（半闭环定案，v6b 铁证） | 主页 200 → Schedules tab → Origin `ningbo`(词典)→点 "Ningbo (ZJ), China. People's Republic"(CNNGB;10) → Destination `istanbul`(词典)→点 "Besiktas (ISTANBUL)., Turkiye"(TRBTS;10) → Search 已点；结果深链 `point-to-point?portcode=CNNGB;10&portdestinationcode=TRBTS;10` 服务器直接返回 **Akamai "Challenge Validation" HTML（v6b XHR 铁证）** | 深链拦截是服务器级、与浏览器无关；表单链路全通即降级档上限 | evidence/m4-zim.{txt,png,-xhr.json}（06:38 版，XHR 内含 Challenge Validation HTML 全文） | 9-22 |
| CMA CGM | ✅ 词典版闭环（v6b 修复后） | ebusiness/schedules 200；Kendo 行点击法：输入 `ningbo`/`istanbul`（词典）→ 点 `li.place-suggestion` CNNGB/TRAVC Port 行 → input 回读 `NINGBO ; CN ; CNNGB` / `ISTANBUL, AMBARLI PORT E. SIDE ; TR ; TRAVC` → Search → 结果页 **Transit 45 Days** | v6b 两处 bug 修复：①回读须读 #AutoCompletePOL/POD（getByRole('combobox').inputValue() 恒空、隐藏域 ArrivalPlaceCode 残留旧值）②dest group combobox 定位 .catch?.() 永假；IP 频率限制实存（连跑需隔 2min+） | evidence/run-2026-09-22T06-49-08-703Z.ndjson（prefilled, Transit 45 Days）、qa/cma-v6b-diag{2,3,4}.mjs | 9-22 |
| Hapag-Lloyd | 🔴 降级档定案：只开页 | 无头实测仍 Cloudflare 403（title="Just a moment..."，waitChallenge 12s 不放行）→ **判定从 ❌ 改为「降级档：只开页」**，CF 交互式挑战无法自动通过 | 与 9-10 结论一致，复测确认非环境抖动 | qa/zim-cma-hapag-check.mjs 输出（01:58） | 9-22 |
| COSCO | ✅ 词典驱动回归 | searchByCity 入口 200；输入 `ningbo china`(词典)/`istanbul`(词典) → 结果页 "Ningbo,Ningbo,Zhejiang,China Istanbul: :Istanbul:Turkey"，**Shortest Transit Time: 26 Days** | aliases: ningbo china→CNNGB；位置 modal Confirm | evidence/m4-cosco.{txt,png,-xhr.json}（03:26 版） | 9-22 |
| ONE | ✅ 词典驱动回归 | point-to-point-schedule 200；输入 `ningbo zhejiang china cy`/`istanbul turkey cy`（均词典）→ 表单回显 "NINGBO, ZHEJIANG, CHINA (CY) to ISTANBUL, TURKEY (CY)"，**Total 1 results** | ONE 输入框直接吃词典文本无需点候选；9-21 版本曾出 YM WELCOME 051W 55 天 | evidence/m4-one.{txt,png,-xhr.json}（03:29 版） | 9-22 |
| Evergreen | ✅ 词典驱动回归 | shipmentlink 200；输入 `ningbo china cnngb`/`istanbul trist`（均词典）→ 结果 "from NINGBO, CHINA (CNNGB) [ZIP:315000] to ISTANBUL (TRIST) [ZIP:34315]"，**BEX 28/33 天、MD2 38/39 天真船期** | aliases 全命中；表单无候选下拉也直出（搜索按钮触发） | evidence/m4-evergreen.{txt,png,-xhr.json}（03:27 版） | 9-22 |
| Yang Ming | ✅ 词典驱动回归 | P2P 入口 200；react-select 表单：**打主词首段**（`ningbo`，词典全串 `ningbo zj cnngb` 匹配不到），候选点 `NINGBO, ZJ (CNNGB)` + `ISTANBUL (TRIST)` → 结果表含 Voyage Code（9-21 版 1 条 63 天） | YM 特例：origin 选完 to 才 enable；input 定位用 `xpath=//label[contains(.,"Location From")]//following::input[1]` | evidence/m4-yangming.{txt,png,-xhr.json}（03:42 版） | 9-22 |
| HMM | ✅ 词典驱动回归（EMPTY=真实答案） | hmm21 200；输入 `ningbo`/`istanbul`（词典）→ 候选点中 `NINGBO, CHINA` + `ISTANBUL(HAYDARPASA TMNL), TURKIYE [TRHAY]`，**Search Results (0) = 宁波→Haydarpaşa 无直航（真实答案，非误判）** | HMM 候选列表混入导航 menu，靠文本匹配港口行；run8 曾误判 OK 已定案 | evidence/m4-hmm.{txt,png,-xhr.json}（03:30 版） | 9-22 |

## 五、DoD 清单（本项目特化，全绿才算完成）
- [x] 真跑过一次，证据：`evidence/run-msc-maersk.log`、`evidence/run-2026-09-10T07-51-24-661Z.ndjson`
- [ ] 端到端可用（爹地能亲手双击打开 App 用一次）← **未达：无 Tauri 壳**
- [ ] 已部署到：`/Applications/ShipScheduleHub.app`
- [ ] 视觉/功能验收截图（App 界面本身）
- [ ] 回归：非 Tauri 浏览器环境下 UI 降级提示正常
- [ ] 一句话使用说明 + 已知边界

## 六、芝麻仓（不丢，只是不做）
| 日期 | 想法/杂事 | 为什么记它 | 处置 |
|---|---|---|---|
| 2026-09-21 | MSC 配方补 Search 按钮选择器 | M1 实测卡在「找不到可见的 Search 按钮」 | 排 M4 |
| 2026-09-21 | 8 家未实测配方（zim/cma/cosco/hapag/one/evergreen/yangming/hmm） | 配方只写了、没验证 | 排 M4 |
| 2026-09-21 | `git init` + README | 项目非 git 仓库、无 README | 排 M5 |
| 2026-09-21 | 达飞「profile 预热」按钮 | 新 profile 403，爹地日常 Chrome 能通 | 二阶段 |
| 2026-09-21 | 二阶段：抓各家结果页 XHR 做统一对比表 | 达飞结果页 AJAX，背后有 JSON 接口 | 二阶段（需爹地点头） |

## 七、风险与决策日志
| 日期 | 事件/风险 | 裁决 | 影响 |
|---|---|---|---|
| 2026-09-10 | 无头浏览器被 Akamai 全拦（MSC/ZIM/CMA 403、Hapag Cloudflare） | 必须用有头 Chrome | 引擎默认 `headless:false` |
| 2026-09-10 | macOS 把窗口位置钳回屏幕内（-2400/-10000 都变 left=60,top=30） | 改用 CDP `Browser.setWindowBounds` 最小化 | 真·静默，爹地看不到窗口 |
| 2026-09-10 | 码农两次被 provider 额度掐断（zai glm-5.3 → 429；commandcode → 400） | 切 `volcengine-agent-plan`；zai 条目已从 5 个 profile 清除 | 已恢复；**commandcode 仍挂在 5 个 profile 的 custom_providers 里，待清** |
| 2026-09-21 | 项目跑了 11 天无 PROJECT.md、非 git、无 README | 本次补齐驾驶舱 | 中断即失忆风险 |
| 2026-09-21 | **【婉宜复核发现·码农未报】`.app` bundle 内不含 `engine/`** —— `project_root()` 靠从可执行文件向上探 12 级目录找 `engine/query.mjs`，在项目目录里能用，**一旦拷到 `/Applications` 就找不到引擎**，`run_query` 必报「找不到引擎脚本」 | 列为当前 WIP 第 1 项，派码农修：engine 作为 Tauri resource 打进 bundle，改用 `resource_dir()` 解析 | **M5 部署即失效**，必须修完才能交付 |
| 2026-09-21 | 界面截图（DoD-2/4）两次未取到：码农遇 QQ 悬浮视频窗遮挡，婉宜遇屏幕锁屏（`screencapture` 只得到锁屏播放器画面） | 等爹地解锁屏幕后补 | 交付证据链缺一环 |
| 2026-09-21 | **★ 爹地指点破局**：「MSC 要选 CY 才有船期」+「输入后没点选项导致空值」→ v6 全自主验证通过：cookie→填港→选CY→搜索→**读回 5 条真实船期**（Transit 33-47 天） | 候选级 SD/CY 徽标 + ariaSnapshot 读 Shadow DOM + type 触发补全，写进 FINDINGS-2026-09-21.md 和 web-scraping 技能 | **项目最大风险解除**：自主闭环成立，M4 只剩铺量 |
| 2026-09-21 | 打包缺陷已修（v4 轮码农）：engine/ + playwright-core 已打进 .app，已部署 /Applications | 已复核（Resources/engine/query.mjs 存在） | M5 部署路径打通 |

## 八、关联文档
- 需求与任务卡：`TASK_CARD.md`（v1）、`TASK_CARD_V2.md`（v2 续派）
- 反爬实测结论：`FINDINGS-2026-09-10.md`
- 引擎实测证据：`evidence/`（`run-*.ndjson`、`run-msc-maersk.log`、`*.png`）
- 页面结构探测记录：`qa/`（`aria-*.txt`、`probe-*.mjs`）

### 9-23 收尾（爹地报错 + 两点需求）

**① App 启动报错 —— 已修并验证** ✅
- 报错：`启动引擎失败：No such file or directory (os error 2)（PATH 里找不到 node？）`
- 根因：`lib.rs` 的 `find_node()` 无 `SSH_NODE_PATH` 时回退字符串 `"node"`，而 Finder 双击启动的 GUI App **不继承 shell PATH**（只有 `/usr/bin:/bin:/usr/sbin:/sbin`）
- 修复：`find_node()` 改为四级探测（显式环境变量 → 常见安装位 `/opt/homebrew/bin/node` 等 → login shell `command -v node` → nvm 目录扫描）
- 验证：干净 PATH + homebrew node 跑引擎 → `maersk prefilled 59.7s`，windowState=minimized

**② 日期默认当天、不强制 —— 已修** ✅
- 前端：`src/main.js` 日期校验改为「非空才校验格式」，标签改为「日期（YYYY-MM-DD，留空=当天）」
- **顺带抓到真 bug**：`parseArgs` 把 `--date ""` 的空串当 falsy → 解析成布尔 `true` → `dateFormats(true)` 崩 `iso.split is not a function`
- 修复：`parseArgs` 认空串为合法值 + 取值处只认字符串
- 验证：`--date ""` 跑通，各家显示「日期用网站默认」

**③ 港口别名调研（爹地核心要求）** ✅
- 调研方法：直连各家「地点查询」接口（比驱动页面快百倍）
  - CMA `/api/PortsWithInlands/GetAllPlaces?id=<kw>` ✅ 直连
  - YangMing `/api/P2P/GetLocations?locationName=<kw>` ✅ 直连
  - MSC `/api/feature/tools/GetAllAvailableCountriesAndPorts` ✅ 浏览器上下文（全量表 580 港）
  - COSCO `/ebbase/public/general/findCityDistrictByPrefix?prefix=<kw>`（已挖到）
  - ZIM `apigw.zim.com/.../locations?searchTerm=`（需 subscription-key，401）
- **核心发现**：
  1. 各家的命名逻辑不同：MSC 只收录**自己实际挂靠的码头**（搜「深圳」无，得搜蛇口/盐田/大铲湾；广州压根没有）；YangMing 用「城市, 省 (LOCODE)」
  2. **CMA 返回大量内陆点（Door）混在港口里** —— 只有标 `Port` 的才有船期（伊斯坦布尔 4 条只有 2 条是 Port）
  3. **同一港口 LOCODE 各家不同**：深圳 CMA `CNPHU` / YangMing `CNSZP` / MSC 码头码 `CNSHK`；南沙老港 `CNNSA` / 新港 `CNNNP`
  4. **同名干扰**：CMA 搜 nansha 首条是 `NANSHAN`（深圳南山）；鹿特丹混美国/新加坡同名
- 产出：`docs/PORT-NAMES-RESEARCH.md`（253 行）+ `docs/PORT-NAMES-COMPARE.md`（对比表）
- **对引擎的意义**：静态别名表（78 条）永远覆盖不全 → 应改为**查询时动态解析**（输入 → 各家接口拿候选 → 只选 Port 类型 + 国家消歧）

### 9-23 爹地实机反馈（第二次）—— 三个 bug 已修

**现象**：点查询后 10 家全显示「未查询」+ 弹出一个 chrome 空白页

**诊断过程**（用 App 内 evidence/*.ndjson 还原现场）：
```
14:17:14  Ningbo→Istanbul  → msc/maersk/zim/cma/cosco 全部 prefilled ✅（但没写 summary）
14:20:31  Ningbo→Izmit     → summary: total=0 ❌（连 window 事件都没有）
14:20:39  Ningbo→Izmit     → summary: total=0 ❌
```
→ 根因链：第一次查询未跑完（点了停止/异常）→ **残留 Chrome 占着 browser-profile** → 后续
`launchHeadedQuiet()` 有头启动失败 → 无头降级**也用同一 profile** → 同样失败 → 引擎崩 →
而 `engine-error` **只写 stdout 没写 ndjson** → 前端只看 ndjson → 停在「未查询」；
空白窗口即启动失败的残留。

**修复（4 处）**：
1. `engine/browser.mjs` 新增 `killStaleProfileChrome()` —— 启动前清理占用**我们自己的** PROFILE_DIR 的残留进程
   （只匹配 profile 路径，绝不碰爹地日常 Chrome）+ 等待 1.5s 让锁释放
2. `engine/query.mjs` 崩溃时**同时写 ndjson**（`engine-error`），不再只写 stdout —— 前端从此能看到原因
3. `engine/query.mjs` `selected.length === 0` 时**立刻退出、绝不启动浏览器**（防空白窗口）
4. `src/main.js` 三处解锁：`engine-error`/`engine-exit`/点「停止」时重置 `engineRunning` + `updateGoBtn()`
   （此前点过「停止」后 `engineRunning` 永远为 true → 再点查询毫无反应）

**验证**：干净环境 + 部署态跑 `Ningbo → Izmit --carriers maersk` → `prefilled 59.0s`、`windowState=minimized`、`total=1 failed=0` ✅

**顺带**：`--date ""` 空串在 `parseArgs` 里是 falsy 会被当 flag → 已修为「空串是合法值」；
`args.carriers || 默认全选` 意味着传空串=全选（保留此行为，符合直觉）。

### 9-23 关键根因：Tauri v2 缺 capabilities → 前端收不到任何事件（决定性修复）

**现象**：点查询后界面永远停在「engine 未启动 / 全部未查询」，但**引擎其实在正常跑**（evidence/*.ndjson 里
`msc prefilled` 等一应俱全），无任何报错。

**定位过程**：
1. 用 `test-stdout.mjs` 模拟 Rust 的读取行为 → 证明**引擎 stdout 是实时 flush 的**（0.2s 就到 `engine-started`）→ 排除引擎侧
2. 检查 dist 产物 → `engine://event` 监听代码在、无 JS 错误 → 排除前端代码本身
3. 查 `src-tauri/` → **发现根本没有 `capabilities/` 目录**

**根因**：**Tauri v2 的权限系统**——
- `invoke`（调用自定义命令）**默认放行** → 所以 `run_query` 能成功启动引擎，制造了「后端正常」的假象
- `listen`（接收后端事件）属于 **core 插件，必须显式授权** → 无 capability 时**监听被静默拒绝**（不报错）
- 结果：引擎全程正常、界面全程不动

**修复**：新建 `src-tauri/capabilities/default.json`，权限含 `core:default`、`core:event:default`、
`core:event:allow-listen`、`core:event:allow-unlisten`、`core:event:allow-emit`、`core:window:default`；
另给前端 `listenEngineEvents()` 加 try/catch（注册失败时把原因显示到界面，不再静默）。

**验证（婉宜自己走完整流程，不依赖爹地）**：
- 自建 `uitool.swift`（CGEvent 点击/粘贴）+ `ocr_boxes.swift`（带坐标 OCR）定位控件并操作
- 点击「并发查询」后界面实时显示：`● engine 在线` / `已预填并搜索` /
  `已预填 Shanghai (CNSGH) → istanbul turkiye trist（日期用网站默认）并点搜索` / `查询中…` / 其余 `待查询` ✅

**经验固化**：Tauri v2 项目**必须**有 capabilities 目录；只测「命令能否调用」不足以证明前后端通道健康，
**必须验证事件能否到达界面**。

### 9-23 晚 · API 直查改造（fastpath）—— 速度与结果两大问题的正解

**爹地反馈**：①查询极慢不如手查 ②结果界面看不到。根因：此前 100% 走浏览器填表（每家 30-90s），
且只回「已预填」不回船期数据 —— 手段（自动化填表）盖过了目标（快速拿到船期）。

**正解：fastpath（API 直查层）** —— 不是官方 API，就是各家**网页自己查询时发的请求**，原样复制：
- `engine/fastpath.mjs`：每家一个适配器，直连拿结构化船期（船名/航次/ETD/ETA/航程/直转/截关）
- 引擎流程改为：**先并发打 fastpath（1-2s）→ 拿到的直接出结果 → 拿不到的才开浏览器填表**
- MSC 特殊：API 被 Akamai 护着 → 第二档「页面内 fetch」（开页后在它自己页面里调它的 API，仍免填表）

**已打通 2/10**（其余 8 家继续挖）：
| 船司 | 接口 | 实测 |
| --- | --- | --- |
| YangMing | `GET /api/P2P/GetP2PRoutes?locationCodeFrom=CNNGB&...` | **1.3s / 4 条船期** ✅ |
| MSC | `POST /api/feature/tools/SearchSailingRoutes`（页面内） | **5-12s / 1 条** ✅ |

**关键坑（全部实测得出）**：
1. MSC 请求体 `{FromDate, fromPortId:441, toPortId:106, language:"en", dataSourceId:"{GUID}"}` ——
   PortId 来自其全量表（已入库 `db/ports.db` 的 `msc_ports` 表 580 港）；dataSourceId = 页面 `[data-setting-id]`
2. MSC 缺头 `x-requested-with: XMLHttpRequest` → **200 但返回空字符串**（最阴的一个坑）
3. **GUI App 环境无 SSL_CERT_FILE** → node fetch 报 `unable to get local issuer certificate`
   （Clash TUN MITM 证书不被 node 认）→ fastpath 里读 `/etc/ssl/cert.pem` 显式做 CA 重试 ✅
4. fastpath 命中后 runCarrier 的 finally 会重复 emit → App 同一家显示两条（已修）

**前端**：每家一行下面直接显示船期（`船名 航次 开→到 天数 直达/转XX`），不要表格；
新增 `done`（✓ 已查到）状态徽章。

**部署态实测（模拟 GUI App 环境）**：yangming 1.6s(4条) + msc 15.4s(1条) 全 [API] 完成，0 浏览器 ✅

### 9-23 深夜 · API 直查扩容 2→5 家（Ningbo→Istanbul 部署态实测）

| 船司 | 档位 | 速度 | 结果 | 关键 |
|---|---|---|---|---|
| YangMing | 直连 fetch | 1.9s | 4条 | （已有）|
| MSC | 页内 fetch | 7.7s | 1条 | （已有）|
| **COSCO** | 页内 fetch | 3.8s | 4条 | findCityDistrictByPrefix 拿 cityUuid → POST purpoShipmentWs（body 从抓包挖出）|
| **Hapag** | 页内 fetch | 11.4s | 8条 | schedule.api.hlag.cloud/api/routes + **头 x-token: public** + containerType=42GP（错值时 API 自己报允许列表）|
| **ZIM** | 页内 fetch | 17.0s | 8条 | apigw PointToPoint/v2 + SPA 公开 subscription-key + 日期格式 23-September-2026 |

技术要点：
- 引擎加 `--record-xhr` 开关（fetch+XHR 双拦截 init script），一键挖任意家的 API
- Hapag/ZIM 直连都被 CF 挡 → 页内 fetch 档；HMM 直连 403、ONE 站侧 hydration 挂（清 cookie 无效，暂配方兜底，oneDeep 已写好待站恢复）
- 其余 5 家（Maersk/ONE/Evergreen/HMM/CMA）仍走浏览器 30-90s：Maersk 挖到 geography API、CMA 是两段式表单、HMM 有完整 body 但 WAF 拦页内
- 部署态 rsync 同步；inpage 超时 25s→90s（ZIM/ONE 深链渲染需要）

### 9-24 · 「结果条数太少」修复（爹地：结果至少 10 条）

三个堵点全修：
1. **MSC 只回 1 条** → 根因：Data 按航线聚合、每条 Data[i].Routes 是多班次数组，之前只取 Routes[0]。改成每班一行（9-24 实测 8 条：MSC VIVIANA 10-08 → MSC MIRJA 11-18）
2. **前端只显示 5 条** → main.js slice(0,5) 删掉，全部显示
3. **YangMing 开始 400** → 挖出 API 隐含规则：startDate ≥ 今天+4、窗口 ≤ 30 天；改 start=+4/end=+34 后恢复（7 条）

窗口 21→35 天、各 slice 上限 8→12。

部署态终验（Ningbo→Istanbul）：YangMing 2.5s/7条 · MSC 4.1s/8条 · COSCO 4.1s/6条 · Hapag 8.9s/12条 · ZIM 7.3s/9条 = **42 条船期，合计 ~27 秒，failed=0**（build8 已部署）
周班航线 30 天窗的物理条数就是 4-5 条/家；想更多就把窗口再拉长（YangMing 上限 30 天卡着，MSC 天然 6 周）。

### 9-24 · 并发查询落地（爹地：查询依旧一家一家查）

- Rust `run_query` 固定传 `--batch 3`（build9 已部署）：浏览器阶段 3 家并发（批内错峰 4-6s/家 保留，防同 IP 齐射）
- fastpath（API 直查）本来就是全并发 Promise.all
- 部署态实测（5 家浏览器系）：批1=maersk,one,evergreen 同跑（34.8s 首个出结果），批2=hmm,cma；总时长 388s→230s
- 窗口不弹屏：newPage 后立即 quietWindow minimized（browser.mjs:150 已有机制，并发时每页都会压回）
- ONE 批内 173s（它站 hydration 慢，已知问题，拖批尾）

### 9-24 · 「App 里还是串行」根因 = 部署错版本

- build9（Rust --batch 3）12:05 才构建完，我 11:46 就把旧 bundle 拷去了 /Applications → App 跑的仍是 build8 二进制
- 症状对比法：strings 查二进制 batch=0 实锤
- 13:47 重新部署（二进制含 batch），混合自测：yangming 1.8s API 秒回不占批；批1=cosco/hapag/maersk 同跑（57.2s 首个浏览器结果）；批2=evergreen
- 教训：构建是后台任务时，必须等 EXIT 回执再部署，不能并行赶

### 9-24 · 全并发（爹地：为什么只能3家？不能全部同时开始吗？）

- --batch 3 → 12（10 家一批全开）；错峰 4-6s×j → 0.8-1.6s×j（只让开页动作错开，加载全并行）
- 部署态 10 家实测：批1 一次开出 9 家浏览器页；总时长 = 最慢家 41s（vs 串行 ~10 分钟）
  YangMing 2.8s / COSCO 6.9s / ZIM 8.5s / Hapag 9.7s / MSC 10.3s（API）· CMA 30.1s / HMM 34.3s / ONE 34.5s / Maersk 39.7s / Evergreen 41.3s（浏览器）
- 反爬顾虑：10 家是 10 个不同域名，互相不冲突；单家内部行为不变

### 9-24 · 结果格式统一 + 航次补全（爹地：只有两家查到船期、格式不统一、只有船名没航次）

**字段映射修复（Ningbo→Gdansk 部署态实测）：**
- MSC：航次字段名是 `DepartureVoyageNo`（之前猜 VoyageNumber 落空）；天数用每班自己的 `TotalTransitTimeHours`（x 级聚合值会错班）；摘要「转」vs 明细「直达」矛盾 = RoutingType 是航段级，明细按班展开后逐班判断 → 现在一致。15 条带航次 GL638W…
- Hapag：船名在 `leg.vesselDetails.name`（locationName 是地名 NINGBO，之前错把它当船名）；承运航段 = 第一个 modeOfTransport===VESSEL 的 leg；航次 = scheduleVoyageNumber（638W）。MANILA MAERSK / 638W ✅

**顺带工程化：**
- fillAutocomplete 从 query.mjs 抽到 lib/dom.mjs 导出（qa 脚本可直接复用）
- HMM 配方按钮修复：clickByText 会误点导航栏 Search（跳 company.do）→ 精确点 onclick=gotoPortToPort 的按钮
- YangMing Gdansk 直连返回 []：该线无直班，数据事实非 bug

**遗留（下一步）：** 浏览器兜底的 5 家（Maersk/CMA/COSCO/ONE/Evergreen）prefilled 后仍不抓结果 —— 需逐家加结果页抽取。

### 9-24 · 维运网兜底（爹地：查不到/慢的用维运网查）

**API 攻坚结论（停损）：** 维运网 wywapi 网关摸清（/api/getAllShipStartPorts、getCarriersByStartPort、getFleetRoutes 等全通），但船期明细走 Next.js RSC 内部协议 + anti-dom 反爬（CDP 会话页面不渲染、截图超时），自动化成本 >> 直调船司官网。停损。

**已交付（build11）：** App 每行查询结束后，无船期的行显示「🔍 维运网查『起点 → 终点』」链接，点一键用系统浏览器打开维运网船期页（Rust open_external 命令，URL 白名单只允许 weiyun001.com）。查不到的船司一键人工兜底。

### 9-24 下午 · 5 家浏览器船司「结果抓取」补齐（码农执行，婉宜复验）

**部署态全量复验（婉宜亲测，非子代理自报）：**
- Ningbo→Istanbul：**8/10 家出船期，61 条**，0 failed。新增：Maersk 2条（MOGENS MAERSK/639W）、Evergreen 7条、CMA 10条（含转Malta详情）；API 5家照常（yangming 7/msc 8/cosco 6/hapag 12/zim 9）
- Ningbo→Gdansk：**5/10 家出船期，43 条**。Maersk 12条、CMA 10条、MSC 15条、Hapag 6条
- 未出船期的都是真实数据/站侧原因：HMM Istanbul TRHAY 无班次、ONE 站侧 hydration 挂、Evergreen Gdansk 真实无结果、YangMing Gdansk 无直班、COSCO/ZIM Gdansk 候选库缺

**关键改动：**
- query.mjs：配方返回 schedules 数组 → 升级 done/level=1 并 emit；修 res.status 判据漏 done 的 bug
- maersk 配方重写：纯地名填表（词典串致 geography API 404）+ Ambarli 特判 + 卡片正则
- hmm 配方重写：入口改 e-service ScheduleMain.do + TRHAY 船司级 fix + btnRetrieve
- evergreen：#txt_schedule_ori/dest_name + LOCODE 候选 + 隐藏域验证
- cma：Main vessel/Voyage Ref. 卡片正则 + 纯词 fallback
- one：oneDeep 接通（主页预热12s→深链→60s 轮询，不渲染返 null）；站侧 hydration 挂保 prefilled
- cosco：候选 pick 动态纯词

**工程化：** fillAutocomplete 抽到 lib/dom.mjs；探针留 qa/probe-*.mjs。

### 9-24 傍晚 · 第 11 家 OOCL 接入（爹地：好像没有 oocl？）

- 入口：`moc.oocl.com/nj_prs_wss/#/sailing_schedules/search`（官网 Sailing Schedule 的 Angular SPA；ecomm.oocl.com 已废弃 NXDOMAIN）
- 表单：input[ng-model="user.origin"/"user.destination"]（commonLookupInput）；候选 ul.th-dropdown-menu；port_of_* 在 Advanced Search 折叠区（默认收起，别用）
- 主查询：页面自己 POST `mocss/secured/supportData/nsso/searchHubToHubRoute`（参数 originId 等，无需自己构造）
- 结果行级解析：`港名/日期 DD Mon (Ddd)/CY/Schedule Details/CY/港名/日期/N day(s)/.../服务/船名 航次`
- aliases 加 oocl 4 条（纯城市词，OOCL 候选对纯城市名最稳）
- 部署态实测：Istanbul 4 条（TEXAS TRIUMPH 039W 等）、Gdansk 2 条（OOCL TURKIYE 012W / OOCL GDYNIA 011W）——两条线全通
- registry/前端列表 +oocl = 11 家；build12 已部署
- 坑：OOCL SPA 渲染偶发慢（轮询 ng-model 出现再动）；istanbul 候选偶发不弹（等待 7s + 首词匹配）

### 9-29 · 「点击查询无反应」修复（真凶：async 里被静默吞掉的 ReferenceError）

- **症状**：点「并发查询」完全无反应，engine 一直「未启动」，无任何报错
- **真凶**：`src/main.js` 第 233 行引用未定义变量 `originInput` / `destInput`（9-24 加维运网链接时改错）；
  它在 `async` 点击处理函数里抛 ReferenceError，**被静默吞掉**，UI 无任何反馈
- **为什么之前没测出**：空表单时 handler 在前面就 return，跑不到那一行（我浏览器测试用的空表单）
- **修复**：改为 `lastQuery = { origin, destination }`；并加防线：`window.onerror` + `unhandledrejection` → 写进可见的 #summary（未捕获错误不再静默）
- **验证方式（可复用）**：
  1. `qa/click-repro.mjs` —— Playwright 载入真实 dist + **注入 `__TAURI_INTERNALS__` 桩**，点 #btnGo，断言 engine 变「执行中」+ 11 行状态 + `invoke run_query` 真发出（0 页面错误）
  2. Rust `run_query` 入口写 `/tmp/ssh-app-trace.log` 留痕 + `SSH_SELFTEST=1` 自检开关（前端自动填表并点击同一代码路径）
  3. 真 App 自检跑通：trace 有 `run_query ENTER`、引擎进程起、ndjson 有结果
- **真机结果（Ningbo→Istanbul，11 家）**：63 条船期 —— yangming 5 / msc 8 / cma 10 / cosco 6 / hapag 12 / evergreen 7 / zim 12 / oocl 3；maersk 配方超时(116s)→仅打开页；one 站侧挂；hmm 官网站侧真实 0（同配方 Rotterdam 出 12 条，证明抓取通）
- **教训**：Tauri 里改 `document.title` 不会改 NSWindow 标题 → 不能用标题当探针；要看状态就用 DOM 可见元素或文件留痕

### 9-29 下午 · HMM 结果抓取修复（爹地：「MSK ONE HMM 都是可以查到的」）

- **真凶（两层）**：①我 9-24 给 HMM 打了硬映射 `TRIST→TRHAY`(Haydarpaşa TMNL)，选到了没船的码头；②改回 TRIST 后仍 0 条——HMM 候选列表是 `ac_results` 组件，**用 JS 程序化 `el.click()` 它不认**，隐藏域 `srchPointTo_code` 被写成默认第一项 TRHAY → Search Results 0
- **实探候选**（`qa/probe-cands.mjs`）：istanbul → `ISTANBUL(HAYDARPASA TMNL), TURKIYE [TRHAY]` / `ISTANBUL, TURKIYE [TRIST]` / `TRAKYA FREE ZONE (ISTANBUL), TURKIYE [TRTRA]`
- **修复**：候选点选改用 Playwright locator 真实鼠标点击 + **回读隐藏 code 校验**（不符则重试，最多 3 轮）；去掉 TRHAY 硬映射
- **部署态实测**：Ningbo→Istanbul = **done 6 条**（SEASPAN BREEZE 0064W / YM WELCOME 0051W / MSC VIVIANA 0103W …，与爹地官网截图逐条吻合），38s
- **通用教训**：凡「候选点选」环节（各家 autocomplete 组件），一律用真实鼠标事件 + 回读被写入的隐藏域/输入框值自校验——JS `el.click()` 在部分组件上会静默选中默认项
- **仍待办**：Maersk（硬映射 Ambarli 已失效，153s 无结果回显）、ONE（结果页不渲染 → prefilled）已派码农按同一方法修，deleg_60e09a34 + cron 兜底 0fbe8ea2d82d

### 9-29 傍晚 · Maersk/ONE 修复 + 全站切「零窗口」模式

**Maersk（码农修，婉宜复验）**：改走 API 直查 —— `maerskResolve`（geography API 取 GEO_ID，cityName 必须小写）+ POST `routing-unified/routing/routings-queries`（抄页面公开 consumer-key）。实测 **done 5 条 / 9s**（此前 153s 无结果）。真相：TRIST 城市级对该线确实无船期（HTTP 422），马士基卖的是 Ambarli（TRAMB）——旧结论方向对，错在硬编码单点 + 脆表单点选。三级路径：API → 深链 → 老表单兜底。遗留：via 是中转港 facility 码（EGPSDTM）非地名。

**ONE（码农修，婉宜复验）**：站侧改版 mag-* 组件后老流程失效（候选渲染成 tag 但 React 状态没吃到 → 点 submit 报 Destination is mandatory）。新路径：node 直连站内船期 API（`/api/v1/schedule/point-to-point`，无鉴权）+ 配方兜底（页内 API → suggest 取官方名 → 带名深链 → DOM 正则）。实测 **done 2 条 / 6s**。坑：深链只带 LOCODE 会停 728B 壳页，必须同时带 `oriLocNmParam/destLocNmParam`；页内 fetch 必须用绝对 URL（API 在 ecomm 域）。

**全站切零窗口（爹地要求：Chrome 窗口别一直弹）**：
- 原来默认是「有头 + CDP 最小化」（为过反爬），屏幕上会闪窗 → 改为默认 **`--headless=new` 零窗口**（`engine/query.mjs` 启动处；`SSH_ALLOW_HEADED=1` 可回退有头调试）
- 爹地问「能不能从 GitHub 植入轻量浏览器」→ 实测结论：不用。GitHub 上的轻量引擎（Servo/Ladybird/Ultralight/miniblink）要么太早期、要么 Windows 专用/闭源，反爬能力不如真 Chrome；真要「真·植入」应走 **Tauri 隐藏 WebView（系统 WebKit）**，代价是 11 家配方重写（未做，列为后续）
- **关键坑**：验证无头可用性时**不要用 Chrome profile 副本**——副本会给出假失败（Evergreen/OOCL 在副本下失败、真实 profile 下全通）。用真实 profile 才是真结论。
- 部署态全量实测（零窗口）：**11/11 done，76 条船期，屏幕上 Chrome 窗口 0 个**，全程 ~60s
  （yangming 2.5s / one 1.5s / cosco 4.7s / msc 5.4s / maersk 7.8s / evergreen 11.8s / zim 11.9s / hapag 13.1s / hmm 14.2s / cma 26.8s / oocl 62.6s）

### 9-29 晚 · 「改港口再查就失败」修复（爹地反馈）

- **症状**：查过一次后换港口再查，全部船司失败
- **真凶**：词典 `aliases` 表一行坏数据 `shanghai | oocl | CNSHA`，而 `ports` 表里上海的 locode 是 **CNSGH**（CNSHA 不存在）→ `findPort()` 里 `port` 取到 undefined → 抛
  `Cannot read properties of undefined (reading 'name_ascii')` → 11 家船司在港口解析阶段 **0ms 全秒挂**
  （所以只有"换到上海"这类命中坏词时才炸，宁波/伊斯坦布尔不受影响，看起来像"第二次查询失败"）
- **数据修**：`shanghai` alias → CNSGH；ZIM 两个码头级 alias（TRHYY/TRKPX 不在 ports 表）→ TRIST；全表体检后坏行为 0
- **代码防线**（`engine/portdb.mjs`）：alias 行的 locode 必须先验证存在于 ports 表，否则跳过继续按名字查；取不到 port 行一律返回 null（走 unknown 兜底），**绝不让一行坏数据拖垮整批**
- **验证**：shanghai→gdansk 从「11 家全秒挂」→ 正常跑（maersk 7 条 / one 2 条 / oocl 5 条，其余为真实无班次或站侧限制）；紧接着 ningbo→istanbul 复跑 65 条、failed=0；再跑 shanghai→gdansk 可重复、无 failed
- **附带发现（非我方 bug）**：Maersk geography 接口对**土耳其城市**（istanbul/ambarli）返 **401 ERR_GW_001 API Key Validation Failed**，而 ningbo/shanghai/gdansk/rotterdam 均 200；试了 6 种参数绕行（countryCode/大写/query/autocomplete/consumer-key）全 401 —— 站侧问题（当天早些时候同查询是通的）。当前 Maersk 查 Istanbul 会掉兜底

### 9-30 上午 · 上海别名组补齐（码农执行，婉宜复验）

**地基修正（婉宜）**：`aliases.locode` 语义澄清 = **船司自己用的码头码**（允许 CNSHA 这类不在 UN/LOCODE 表的值）；`ports` 表才是权威地名来源，别名命中后 name/country 先按码查 ports、再按港名兜底查，都查不到返回 null（unknown 兜底，绝不抛错）。根因：我们库里上海=CNSGH，而 HMM 官网用 CNSHA —— 码对不上候选永远点不中。

**码农产出**：
- `db/aliases-shanghai.sql` + `db/ports.db`：12 条上海别名（11 家 + un 兜底，source=verified）；**ZIM 的上海码是 CNSNH**（≠CNSHA，Locations API `CNSNH;10`）
- `engine/portdb.mjs`：`findPort(word, carrierId)` 按船司查别名（其次 un，最后旧行为）——修掉「谁先被查到就用谁」的隐患
- `engine/lib/portsolve.mjs` 透传 carrierId；`engine/fastpath.mjs` zimInPage 码头码后缀逐试（`;10`/`;0`）、coscoInPage 增港名兜底；`engine/query.mjs` cosco 注入港名；`hapag.mjs`/`yangming.mjs` 候选匹配去写死宁波/伊斯坦布尔（并集追加动态词/码）

**婉宜独立复验（部署态，自己跑自己数）**：
- shanghai→rotterdam：**done 9 家 / 83 条**，起运港候选类失败 **0**（evergreen、zim 为站侧无该航线/抽取正则写死宁波动词，已记录）
- 部署态 engine 与源 `diff -rq` 一致、`db/ports.db` `cmp` 一致
- 已知站侧限制：ZIM 上海→鹿特丹/格但斯克无航线（Bad Request）；evergreen 结果页抽取正则仍写死 NINGBO/ISTANBUL（非宁波起运止于 prefilled）；ZIM 的 CNSNH 与 UN/LOCODE「Shenhu」撞码（ZIM 配方不读 name，无功能影响）
- 引擎 summary 事件 `prefilled` 字段**有意**把 done 归入（"done(artapi)=prefilled 档"），UI 侧由 refreshSummary 按行徽章自行重算，口径不受影响

### 9-30 · 上海别名组验收 + 垃圾输入加固（婉宜独立复验）

**婉宜独立复验（部署态，自己跑自己数；干净环境，无并发互抢）**：
- `shanghai→rotterdam`：**done 9/11，83 条**，起运港候选类失败 **0**
- `shanghai→gdansk`：**done 7/11，59 条**，起运港候选类失败 **0**
- `ningbo→istanbul` 回归：**done 10/11，72 条，failed=0**（达标 ≥70）
- 代码一致性：`diff -rq engine/` 一致、`db/ports.db` `cmp` 一致

**新发现并加固（婉宜）——垃圾输入静默查成错港口**：
- 起因：我一条测试命令的 shell 拆词写坏，把 `--destination` 传成了布尔 `true`，引擎居然照查不误，结果变成了 **"Struer (DKSTR)"**（丹麦小港，"sTRUE r" 里含 "true"）；空串则命中全表第一行 **"Abu al Bukhoosh"**
- 加固 1（`engine/portdb.mjs::findPort`）：拒绝非字符串 / 长度 <3 的输入；港名兜底改为 **精确 → 前缀 → （≥5 字符才）包含**，杜绝 "true"→Struer 这类误命中
- 加固 2（`engine/query.mjs`）：`--origin/--destination` 非空字符串校验，非法立即 `engine-error` 退出（exit 2），不再发起荒谬查询
- 验证：`--origin "" ...` → 立刻报「参数 --origin 非法」；`shanghai→rotterdam`（yangming）仍 done 10 条；`shanghai/ningbo/istanbul/gdansk/rotterdam/kobe/oslo` 解析全部正确
- 教训：**测试命令本身也会骗人**——shell 拆词/引号写坏会产生"看起来是产品 bug"的假故障；复验前先确认命令传参正确（本次两条"失败"就是我自己造成的）

### 9-30 · Evergreen 结果抽取正则去硬编码（婉宜）

- **问题**：`engine/recipes/evergreen.mjs` 结果页正写死了 `NINGBO, CHINA` / `ISTANBUL` —— 只有查宁波→伊斯坦布尔能抽出行，换起运/目的港一律停在「已预填」（0 条）
- **修**：改为**按本次查询的港口名动态构造正则**（取解析出的港名首词大写；缺失则退化为通配），捕获组顺序不变，下游映射零改动
- **验证**：`shanghai→rotterdam` evergreen **done 10 条**（改前 prefilled/0）；`ningbo→istanbul` 回归 **done 6 条**（与改前一致，无回退）

### 9-30 · 全量复跑最终验收（婉宜，部署态）

| 航线 | done | 总船期 | 起运港候选类失败 | 未出结果的家 |
|---|---|---|---|---|
| shanghai → rotterdam | **10/11** | **93 条** | 0 | zim（官网无此航线，prefilled）|
| ningbo → istanbul | **10/11** | **77 条** | 0 | maersk（官网土耳其地理接口 401，站侧）|

- Evergreen 修好后 shanghai→rotterdam 从 83 条 → **93 条**（evergreen 贡献 10 条）
- Maersk 在 shanghai→rotterdam **4 条 done** —— 说明它只有"土耳其目的地"受影响（站侧 401），其他航线正常
- HMM ningbo→istanbul 出 **12 条**（Search Results 20），较此前 6-7 条更全

### 9-30 · Maersk 土耳其 401 破案并修复（婉宜）

- **破案过程**：先确认 401 与城市无关（宁波/上海/欧洲 200，Istanbul/Ambarli 401）→ 怀疑是请求头 → 探针抓 **Maersk 页面自己发的同一个 geography 请求**，发现它带 `Consumer-Key`（**官网页面明文公开常量，与我们代码里 MAERSK_KEY 是同一个值**）→ 对比代码发现：**这个 Key 只在船期 POST 时带了，查城市时漏了** → 网关对缺 Key 的请求返回 `401 ERR_GW_001 API Key Validation Failed`（只对部分区域严格拦截，所以之前时通时不通）
- **修复**：`engine/fastpath.mjs::maerskResolve` 的 geo fetch 补上 `consumer-key` 头（Key 经 evaluate 参数传入）
- **验证**：`maersk` ningbo→istanbul **done 7 条**（MOGENS MAERSK 等；修前连续多轮 opened/0 条）——`Ningbo(CNNPO) → Ambarli Port Istanbul(TRAMB)`，试过 TRIST(HTTP422)/TRAMB(HTTP200/7)
- **方法论沉淀**：接口 401/403 时，先抓「页面自己发的同一请求」比对自己的请求头（探针 `qa/probe-maersk-geoharvest.mjs` / `probe-maersk-headers.mjs`），往往差的就是一个公开常量；不要急着判定"站点限流/封 IP"

### 9-30 · 里程碑：11/11 家全部出真船期（婉宜终验，部署态）

| 航线 | 出船期 | 总条数 | 说明 |
|---|---|---|---|
| **ningbo → istanbul** | **11/11** | **79 条** | 全员出结果（Maersk 修好后 7 条）|
| shanghai → rotterdam | 10/11 | 93 条 | 仅 ZIM 无此航线（站侧）|

这一轮累计修复：上海别名组（各家港口码显式化）· Evergreen 抽取正则去硬编码 · 垃圾输入加固（含 CLI fail-fast）· **Maersk 土耳其 401（缺 Consumer-Key 请求头）**。

### 9-30 · 两个优化（婉宜）

**① 结果缓存（20 分钟 TTL）**：同条件（起运/目的/日期/船司集合）重复查询直接回放上次结果 ——
实测冷查 77s → 复查 **0s**；行内明确标注「⚡ 缓存（刚刚的结果，20 分钟内有效）」，不冒充实时。
关闭：`--no-cache` 或 `SSH_CACHE_TTL_MS=0`；只有「至少一家真出结果」才写缓存（不把整批失败固化）。
实现：`engine/query.mjs` 读缓存（在 fastpath/浏览器之前，命中即 emit + summary + exit）/ 写缓存（finally 里）。
意义：重复查询提速 + 显著减少对船司官网的重复请求（防限速/防封）。

**② OOCL 接口调查（结论：暂不做 fastpath）**：抓到它的两个端点 ——
`GET .../gsp/cityAutoComplete?userQuery=X&bound=OB|IB`（城市联想，含 `_id`）与
`POST .../nsso/searchHubToHubRoute`（body 带 originId/countryCode/haulageMode…，响应 `data.standardRoutes[]`）。
**但请求体含 `captchaToken`（页面 JS 现场生成，回放直接被拒：`Captcha Error!`）** → 无法复用；
OOCL 维持 DOM 填表路径（38-77s）。它慢不影响体验：结果是流式显示的，其它 10 家先出。

### 9-30 · 结果展示改版：浅色 + 时间轴行程卡（爹地选定 002 稿）

- **流程**：先 grill 问清偏好（风格/主题/主信息/动效/分组）→ 出 3 个可点设计稿（票根式 / 时间轴 / 网格卡，`sketches/00*`）→ 爹地选 **002 时间轴行程式** → 落地 App
- **主题**：全站转**浅色干净风**（原为跟随系统的深色）
- **结果区结构**：每家船司 = 一张分组卡（色条 + 船司名 + 状态徽章 + 摘要行），卡内每条船期 = 时间轴一行：
  左侧**开船日期大字**（`10.06` + 星期）→ 时间轴节点 → 航线 + 船名/航次徽标 + 到港日 → 右侧**天数** + 直达/转胶囊
- **hover 反馈**（爹地指定的动效）：整行右移 3px + 底色透出船司色 + 时间轴节点放大发光
- **数据流零改动**：只改渲染层（`src/main.js` 渲染函数 + `src/styles.css`），查询/引擎逻辑未动
- **视觉验收抓到的 3 个真 bug（已修）**：
  1. `refreshSummary` 仍在查已改名的 `.st-badge` → 每轮查询报 TypeError（改为 `data-st` 属性统计）
  2. 摘要行单行硬截、日期被折断 → 有船期行时摘要只留前导说明（如「API 直查 8 条」）
  3. 左侧「Hapag-Lloyd 赫伯罗特」换行致行高不齐 → 侧栏加宽 248px + 名称不换行
- **验收**：部署态真机截图（`docs/ui-v2-timeline.png`），无报错、行高一致、层次清晰（自评 8.5-9/10）
- **可继续打磨（未做）**：查询中 spinner、次要文字对比度、滚动到底提示、停止按钮样式层级

### 9-30 · 修「ShipScheduleHub 被阻止修改 App」弹窗（婉宜）

- **现象**：macOS 反复弹「"ShipScheduleHub.app" was prevented from modifying apps on your Mac.」（App 管理保护）
- **实锤**：系统日志 `com.apple.tcc.notification.kTCCServiceSystemPolicyAppBundles.com.ross.shipschedulehub`
- **真凶**：运行期可写数据（evidence 截图/ndjson、20 分钟结果缓存、Chrome profile）写在
  `/Applications/ShipScheduleHub.app/Contents/Resources/` 里 —— **macOS 的 App 管理会拦截 App 修改任何 .app 包（包括它自己）**，
  于是每次查询写文件就触发一次通知
- **修复**：`engine/browser.mjs` 新增 `DATA_DIR = ~/Library/Application Support/ShipScheduleHub/`，
  profile / evidence 全部搬过去（含**一次性自动迁移**，rename 旧目录以保住已养熟的 Chrome profile）；包内只留只读资源（engine/ 配方、db 只读副本）
- **验证**：迁移日志 `data-migrated` 两条 → 数据落在 `~/Library/Application Support/ShipScheduleHub/`（78MB）；
  包内 Resources 只剩 `ShipScheduleHub.icns / db / engine`，修后再无新写入；
  修后跑完整查询（msc 19 条 + maersk 5 条）→ **App 管理相关事件新增 0**
- **附带收益**：以后重装 App 不再丢 Chrome 档案与缓存；无需给「App 管理」权限（保持拒绝更安全）

### 9-30 · 转 git 仓库并推 GitHub（婉宜）

- `git init -b main` + 提交 402 文件（`.gitignore` 挡住 node_modules / src-tauri/target / dist / evidence / browser-profile —— 项目 4.0G，实际入库 ~15MB）
- 提交身份：`theWeatherMan21 <theWeatherMan21@users.noreply.github.com>`（gh 已登录账号）
- **私有仓库**：https://github.com/theWeatherMan21/ship-schedule-hub （`gh repo create --private --source=. --push`）
- 远端核验：`visibility=PRIVATE`、`defaultBranchRef=main`、远端文件数 **402**、本地 HEAD 与 origin/main 一致（fa1af78）
- 安全体检：源码内**无密码/私钥/token**；命中的是各家页面**公开常量**（Maersk consumer-key、ZIM subscription-key 等，本就写在对方页面 JS 里），私有仓库无外泄风险
- 项目管理同步更新：`PROJECT.md` 〇节当前状态 + `PORTFOLIO.md`（在推区 + 芝麻仓）

### 9-30 · 并发串词真凶（重大可靠性修复 · 婉宜）

**症状**：全量查询稳定出现「随机某一家失败」，且每轮掉的那家不一样（HMM 报「起运港候选未出（ningbo china cnngb/CNNGB）」——
注意这串词根本不是 HMM 的词，是 Evergreen 的）。

**根因**：`query.mjs` 的 `runCarrier` 在 **12 家并发**时把「本家港口解析结果」写进**共享的 `qBase`**（`qBase._o = ...`），
各家互相覆盖 → A 家读到 B 家的输入词 → 候选点不中 → 整家失败。

**修复**：每家一份**私有 q**（`Proxy` 包 `{...qBase, _o, _d}`），`originText/destText` 从私有对象取；
fastpath 的 in-page 闭包与配方调用全部改用私有的 `oRes/dRes/qLocal`。**共享可变状态在并发路径上是禁区。**

**验证**（部署态、`--no-cache`、连跑两轮）：

| | done | 条数 |
|---|---|---|
| 修复前 | 10/11（随机掉一家）| 72–79（每轮不同）|
| **修复后 第 1 轮** | **11/11** | **84** |
| **修复后 第 2 轮** | **11/11** | **84**（与上轮完全一致）|

### 9-30 · Windows 适配（P1+P2 落地 · 婉宜）

- **P1 引擎跨平台**：`DATA_DIR` 平台化（Win → `%LOCALAPPDATA%\ShipScheduleHub`）；清理残留 Chrome 走 PowerShell+taskkill；
  CA 兜底跨平台（Windows 无 PEM 包 → **自动从系统证书存储导出**一次，企业 HTTPS 检查环境必需）；临时文件路径平台化
- **P2 壳/配置跨平台**：`find_node` 支持 ①`SSH_NODE_PATH` ②**随包 node（`engine/node-bin/`）** ③Win 常见路径（含 nvm-windows/Volta）④`where node` ⑤版本管理器扫描；
  `stop_query` 改「记 PID → Windows `taskkill /T`（杀进程树）/ mac `kill`」；spawn 加 **`CREATE_NO_WINDOW`**（否则科研窗闪黑框）；
  `open_external` 三平台；`bundle.targets=all`；WebView2 `downloadBootstrapper`；字体栈补 `Segoe UI/微软雅黑`；新增 `.gitattributes` 防 CRLF
- **分发关键件（新增 `engine/chrome.mjs`）**：浏览器解析器 ①`SSH_CHROME_PATH` ②系统 Chrome ③Playwright 自带 Chromium
  ④**按需自动下载 Chrome for Testing**（~150MB，只下一次，无需管理员权限）→ **同事机器没装 Chrome 也能跑**
- **CI**：`.github/workflows/build-windows.yml`（`windows-latest` 出 NSIS 安装包，自动下载 node.exe 打进包 → 上传 artifact / 打 tag 发 Release）
- 方案与待办见 `docs/WINDOWS-PORT-PLAN.md`

### 9-30 · 船期条数太少 → 三家窗口全查修（婉宜）

用户报「ONE 还是只有两条船期，至少 5 条以上」。查下来**不是站侧问题，是我们把查询窗口设太窄**：

| 家 | 原窗口 | 实测 | 改为 | 结果 |
|---|---|---|---|---|
| **ONE** | 14 天（`toDate=fromDate+14`）| 14 天 2 条 / 28 天 3 条 / **42 天 8 条** / >42 天 **0 条** | **42 天**（上限）| 2 → **8 条** |
| **OOCL** | 官网默认 `user.weeks=2` | 2 周 3 条 / 6 周 6 条 / **12 周 11 条** | 配方把 `select[ng-model="user.weeks"]` 设成 **12**（回读校验）| 3 → **11 条** |
| **COSCO** | 35 天 | 35 天 5 条 / 56 天 7 条 / **84 天 11 条** | `dateWindow(iso, 84)` | 5 → **11 条** |

顺手修的：
- **OOCL 跨年年份错**：页面只给「10 Dec (Thu)」没有年份，原来写死「今年」→ 12 周窗口必然跨年，
  会把 `2027-01-16` 显示成 `2026-01-16`。改为按参照时间（ETD 参照今天、ETA 参照 ETD）向前滚年份；
  验证 11/11 条「日期差 == 天数」自洽。
- `dateWindow` 加 `daysArg` + `SSH_WIN_DAYS` 覆盖（调窗/探针用；MSC 不受该参数影响，仍走自己 6 周逻辑）。

**全量回归（部署态 · 宁波→伊斯坦布尔）**：`11/11 家 · 104 条`（修前 90 条），每家 ≥6 条。
新增探针：`qa/probe-oocl-window.mjs`（抓页面真实请求体 → 定位 `weeks=2` 这个真凶）、`qa/probe-oocl-form.mjs`。

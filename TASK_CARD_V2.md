# 任务卡 v2（续派）：船期聚合驾驶舱 ShipScheduleHub

> 派单人：婉宜（Supervisor）｜执行：码农（manong）｜委托人：ross（叫「爸爸」）
> **这是续派**：上一轮跑到一半因 provider 额度耗尽中断（非任务失败）。已有产出见下方"现状"。

## 0. 工作目录与现状（先看，别重做）

目录：`/Users/russospencer/Documents/trae_projects/ShipScheduleHub`

**已完成（保留，别推翻重写）**：
- `src/main.js`（221 行）、`src/styles.css`（190 行）、`index.html`、`vite.config.js`、`package.json` —— Tauri UI 骨架
- `engine/lib/utils.mjs`（107 行）、`engine/lib/events.mjs`（10 行）—— 引擎工具层
- `qa/probe*.mjs` + `qa/aria*.txt` —— 10 家船司的页面结构探测记录（**宝贵，别删**）
- `TASK_CARD.md`（v1，含原始需求）
- `FINDINGS-2026-09-10.md` ← **必读**

**还没做**：各船司配方、UI 与引擎串通、真实跑通验证。

## 1. 必读：反爬的确定结论（已做对照实验，别重复试）

详见 `FINDINGS-2026-09-10.md`，核心三条：

1. **必须用有头浏览器**：`headless: true` 下 MSC / ZIM / 达飞全部 403、赫伯罗特被 Cloudflare 盾拦。
   改 `headless: false` 后 **MSC、ZIM 立刻通过**。UA 伪装无效，别再试。
2. **窗口必须挪到屏幕外**（爸爸明确反馈：不要弹窗口打扰他）：
   `args: ['--window-position=-2400,-2400', '--window-size=1440,900', '--disable-blink-features=AutomationControlled']`
   注意：macOS 可能把窗口钳制回屏幕内 —— 若发现窗口可见，改用 `--window-position=-10000,-10000` 或加 `--start-minimized`，
   **验证标准：跑一次查询，屏幕上不该出现新窗口**。
3. **达飞 / 赫伯罗特看 profile 履历**：全新 profile 过不了；达飞在爸爸日常 Chrome 里是通的。
   → 这两家先走第 3 级兜底（只开页面），或做"profile 预热"。

## 2. 爸爸的两条明确指示（必须执行）

- **cookie 弹窗：直接点「接受」**，不要犹豫、不要跳过。
  选择器优先级：`#onetrust-accept-btn-handler` → `button[id*="accept" i]` → 文本匹配 `accept all / accept / 同意 / 接受全部`
- **人机验证：先自己试**（等待挑战自动通过 + reload 重试，最多 2 次），试不过就记 `blocked` 走兜底，
  **绝不能让整个查询失败**。事后我们一起研究。

## 3. 目标（不变）

Tauri 桌面 App：填一次「起运港 / 目的港 / 日期」→ 一键并发打开 Top 10 船司船期查询页 + 尽力预填。
**不解析结果、不做对比表**（那是二阶段）。

## 4. 每家一个「配方」，三级降级（核心设计）

```
① 深链接 URL（若该家实测支持）
② DOM 填表 + 点搜索
③ 兜底：只把该家船期查询页打开
```
**硬要求**：任一家配方失败 → 只标记该家状态，**不能影响其他家、不能让整个查询失败**。
每家在 UI 回显：`已预填并搜索` / `仅打开页面` / `失败(原因)`。

## 5. Top 10 船司与探索起点

| 船司 | 入口 | 已知情况 |
|---|---|---|
| MSC | https://www.msc.com/en/schedules | 有头可通过 ✅，表单字段含 `from`/`to`/`vessel` |
| ZIM | https://www.zim.com/ | 有头 200 ✅ |
| Maersk | https://www.maersk.com/schedules/pointToPoint | 表单真实存在，字段 `ptpDatePicker`/`containerType` |
| CMA CGM | https://www.cma-cgm.com/ebusiness/schedules | 需 profile 履历，先兜底 |
| COSCO | https://elines.coscoshipping.com/ | 首页 JS 壳，船期入口需确认（`/ebusiness/schedule` 是 404） |
| Hapag-Lloyd | https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html | Cloudflare 挑战，先兜底 |
| ONE | https://ecomm.one-line.com/ | `/one-ecom/schedule` 实测 404，入口需重新找 |
| Evergreen | https://www.shipmentlink.com/ | 首页有 Origin/Destination + Search，可试二级 |
| Yang Ming | https://www.yangming.com/en/esolution/schedule/point_to_point_search | P2P 表单待探 |
| HMM | https://www.hmm21.com/ | 无头被拒，有头重测 |

**选择器必须实测确认，不许编造。**摸不通就诚实标兜底，不算失败。

## 6. 红线

- ❌ 不解析/抓取结果数据，不做对比表
- ❌ 不做 iframe 嵌入（已证死路）
- ❌ 不申请官方 API
- ❌ 不读写爸爸日常 Chrome 的 profile（只用项目自己的 `./browser-profile`）
- ❌ **跑测试时不许在屏幕上弹出可见窗口**（见 1.2 的验证标准）
- ❌ 不对船司高频请求：必须分批（每批 ≤3、间隔 2-4 秒）
- ❌ 不改本目录外的任何项目

## 7. 交付物

1. 可运行 Tauri App（README 写清启动命令）
2. 各船司配方实现 + 状态表（通过/兜底/未确认）
3. **实测证据**：≥3 家「自动预填 + 搜索成功」的截图或日志
4. 静默验证：跑一次查询，证明屏幕上没弹新窗口

## 8. 交活格式（固定）

```
做了什么：
证据：命令 + 输出 / 截图路径
已知边界：
未完成项：
```

## 9. 优先顺序（时间有限就先做这些）

1. **先把 headless 全改有头 + 屏幕外**，把 MSC / ZIM / Maersk 三家跑通（这三家可行性最高）
2. 其余 7 家按各自情况推：能通的升配方，不能的落兜底
3. 最后补 README + 证据截图

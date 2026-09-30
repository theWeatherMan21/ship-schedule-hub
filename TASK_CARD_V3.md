# 任务卡 v3：ShipScheduleHub —— 补 Tauri 壳 + 接通引擎（M2 + M3）

> 派单人：婉宜（Supervisor）｜执行：码农（manong）｜委托人：ross（叫「爸爸」）
> 时间盒：**1 天**（到点没达 DoD → 必须回传三态，禁无声拖延）
> 前置：v1/v2 已完成引擎层；本轮只补「壳 + 接线」，**不重写引擎**

## 0. 工作目录与现状（先看，别重做）

目录：`/Users/russospencer/Documents/trae_projects/ShipScheduleHub`

**已完成，保留别推翻**：
- `engine/browser.mjs`（100 行）— 有头 Chrome + CDP 最小化静默窗口 ✅
- `engine/query.mjs`（170 行）— 并发主流程、分批 ≤3、批间隔 2-4s、NDJSON 事件流 ✅
- `engine/recipes/*.mjs` — 10 家船司配方（2 家实测通过，8 家待验）
- `engine/lib/{dom,utils,events}.mjs`、`engine/registry.mjs`
- `src/main.js`（221 行）— UI 骨架，**已写好 `invoke('run_query')` / `invoke('stop_query')` 调用**
- `src/styles.css`（190 行）、`index.html`、`vite.config.js`
- `evidence/` — 实测证据（`run-msc-maersk.log`：马士基预填成功、MSC 兜底、窗口真静默）

**❌ 本轮要补的（这就是卡点）**：
- `src-tauri/` — **空目录！** Tauri 壳完全不存在
- `ui/` — 空目录（可删或忽略）
- 根 `node_modules` — 未安装
- UI 的 `invoke('run_query')` 没有 Rust 后端实现 → 点了没反应

## 1. 目标（一句话）

**让爸爸能双击打开 ShipScheduleHub，填港口日期、点「并发查询」，看到 10 家船司状态实时回显，并真的把浏览器页面开好预填好。**

## 2. 必须实现的两条命令（UI 已经按这个签名调用）

看 `src/main.js` 第 145 行与 216 行：
```js
invoke('run_query', { args: { origin, destination, date, carriers, headless, visible } })
invoke('stop_query', {})
```

Rust 侧要实现：
1. **`run_query`**：spawn `node engine/query.mjs --origin X --destination Y --date Z --carriers a,b,c`
   → 逐行读它的 **stdout NDJSON**（`engine-started` / `carrier-status` / `summary` / `engine-exit`）
   → 每读到一行，用 `app.emit("engine://event", payload)` 转发给前端
   → 前端 `src/main.js` 第 183 行已经在监听 `engine://event`，**事件名必须一致**
2. **`stop_query`**：kill 掉子进程

**关键细节**：
- 引擎路径要用 Tauri 的 resource 解析或绝对路径，**不要假设 cwd**
- `engine/node_modules` 已装好 `playwright-core`，**spawn 时 cwd 设为 engine 目录**（或显式指定 node 路径）
- 子进程 stderr 也要收集，出错时回报给前端（爸爸要看到为什么失败）
- 非零退出要如实上报，不许吞

## 3. 硬红线（不可违反）

- ❌ 不重写 `engine/` 里的任何东西（除必要 bug 修复）
- ❌ 不解析船司结果数据、不做对比表
- ❌ 不碰爸爸日常 Chrome 的 profile（只用 `./browser-profile`）
- ❌ **跑测试时屏幕上不许出现可见窗口**（引擎已用 CDP 最小化，别改坏）
- ❌ 不改本目录外的项目
- ❌ 分批限速不许改（每批 ≤3、间隔 2-4s）

## 4. DoD（六条全绿才算完，逐条给证据）

1. **真跑过**：`npm run tauri:dev` 或构建后能启动，留下命令输出
2. **端到端可用**：App 里填「Shanghai / Rotterdam / 日期」→ 点「并发查询」→ 界面**逐家状态实时变化**（待查询→查询中→已预填并搜索/仅打开页面）
3. **落到他会点的位置**：说明爸爸怎么启动（`npm run tauri:dev`，或构建出 .app 放哪）
4. **证据留档**：App 界面截图（含状态回显）+ 引擎 NDJSON 日志路径
5. **一句话使用说明** + 已知边界（哪几家是兜底/失败）
6. **回归**：非 Tauri 环境（浏览器直接开）仍显示降级提示，不崩

## 5. 时间盒与熔断

- 时间盒 **1 天**。到点没全绿 → **当场三选一汇报**：①砍范围交付 ②重估延期（说清新日期+理由）③放弃。
- 同一思路失败 2 次 → 停手重评，换路，别原地第三次。

## 6. 交活格式（固定）

```
做了什么：
证据：命令 + 输出 / 截图路径
已知边界：
未完成项：
```

## 7. 优先顺序（时间不够就按这个砍）

1. **先让 App 能打开**（Tauri 壳 + 前端渲染）← 最小可跑
2. **再接 run_query**，让 1-2 家船司的状态能回显 ← 竖切贯通
3. 再补 stop_query、错误上报、构建产物
4. 最后才是 8 家未实测配方（**这条不在本轮 DoD 内**，属于 M4）

**注意**：如果 Tauri 构建遇到环境问题（如 cargo 依赖下载慢、Clash TUN 影响），别死磕——先在日志里说清楚，回传三态，我们一起看。

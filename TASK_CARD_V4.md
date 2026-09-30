# 任务卡 v4：修打包缺陷 —— 把 engine 打进 .app（M5 阻塞项）

> 派单人：婉宜（Supervisor）｜执行：码农（manong）｜时间盒：**半天**
> 上一轮（v3）交付已复核通过：壳 + 接线是真的、`cargo check` 干净、.app/.dmg 都构建出来了。**干得好。**
> 本轮只修一个缺陷，别扩大范围。

## 0. 缺陷（婉宜复核发现，v3 未报）

`.app` bundle 里**不含 `engine/`**：

```
ShipScheduleHub.app/Contents/
├── MacOS/shipschedulehub
├── Resources/ShipScheduleHub.icns
└── Info.plist          ← 没有 engine/
```

`project_root()` 现在靠「从可执行文件向上探 12 级目录找 `engine/query.mjs`」定位引擎。
在项目目录里跑没问题，**但把 .app 拷到 `/Applications` 后，向上 12 级都找不到 engine** →
`run_query` 必报「找不到引擎脚本」，App 变成空壳。

**这是 M5 交付的硬阻塞**：不修就不能给爸爸用。

## 1. 要做的（就这一件事）

1. **把 `engine/` 作为 Tauri resource 打进 bundle**
   - `tauri.conf.json` 的 `bundle.resources` 里加入 engine（注意排除 `engine/node_modules` 与 `browser-profile`，否则包会巨大；或者只打包需要的 .mjs）
   - ⚠️ 引擎依赖 `playwright-core`（在 `engine/node_modules`）。**要么一并打包**，要么改为让引擎用系统里已有的 playwright-core —— 你选更稳的一条，并在交付说明里写清依赖怎么解决的
2. **`project_root()` 改为优先用 Tauri 的 `resource_dir()` 解析**，保留现有探测作为开发态回退
3. **在 `/Applications` 实跑验证**（这是本轮 DoD 的核心）：
   ```
   cp -R src-tauri/target/release/bundle/macos/ShipScheduleHub.app /Applications/
   open /Applications/ShipScheduleHub.app
   ```
   然后点「并发查询」（可以只勾 Maersk 一家，快）→ **状态必须真的动起来**（不是报「找不到引擎脚本」）

## 2. 红线

- ❌ 不重写 engine 逻辑
- ❌ 不解析结果、不做对比表
- ❌ 跑测试不许在屏幕上弹可见窗口（引擎已用 CDP 最小化，别改坏）
- ❌ 不改本目录外的项目（`/Applications` 里拷一份测试允许）

## 3. DoD（全绿才算完）

1. `.app` 内能确认 engine 已打进（给出 `find` 输出）
2. `/Applications/ShipScheduleHub.app` 双击能开
3. **在 `/Applications` 场景下点查询，引擎真的跑起来**（给出 NDJSON 日志路径 + 状态）
4. 开发态 `npm run tauri:dev` 仍能跑（回归没坏）
5. 交付说明里写清：引擎依赖（playwright-core）怎么解决的、包体积多大

## 4. 交活格式

```
做了什么：
证据：命令 + 输出 / 日志路径
已知边界：
未完成项：
```

## 5. 时间盒熔断

半天。到点没全绿 → 三选一汇报（砍范围/重估/放弃），别无声拖。

## 6. 提示

- 如果打包 playwright-core 让体积不可接受，**替代方案**：让引擎从系统 Node 的全局路径 require playwright-core，
  或在 App 首次启动时提示用户跑一次 `npm install`。选哪条都行，**关键是把「拷到 /Applications 还能用」验证通过**。
- Clash TUN 可能拖慢 cargo/npm 下载，遇到卡住别死磕，回传三态。

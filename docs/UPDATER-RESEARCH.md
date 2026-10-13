# 启动时静默检查更新 —— 模块调研（2026-10-13）

> 需求：App **每次启动**时**静默**检查「git/GitHub 上有没有新版本」，不打扰用户。
> 研究方式：Exa 检索（Tauri / Electron / Wails / 自研 4 类实践）+ 对本仓库实测。

## 一、本项目的硬约束（实测，决定方案取舍）

| 事实 | 实测结果 |
|---|---|
| 仓库可见性 | **PRIVATE**（`gh repo view` → `"visibility":"PRIVATE"`）|
| 无凭据查 `api.github.com/.../releases/latest` | **404**（App 内不带 token = 查不到）|
| 带 token 查同一端点 | 200（`v1.4.0`，3 资产）|
| `releases/latest/download/latest.json` | **404**（我们还没产出 Tauri updater 清单）|

**结论**：**私有仓库是这件事的主要矛盾**。App 里不能藏 PAT（会泄露），所以要么「换个地方放公开元数据」，要么「给 App 一个只读凭据」。

## 二、现成模块盘点

| 模块 | 形态 | 静默检查 | 适配我们 | 备注 |
|---|---|---|---|---|
| **`tauri-plugin-updater`**（官方，v2） | Rust/Tauri 插件 | ✅ `check()` 可只查不装 | 需签名密钥 + 清单产物 | `createUpdaterArtifacts:true` + `pubkey`(minisign) + 端点 `.../latest.json`；**私有仓库仍 404** |
| **`tauri-updater-private`**（社区 crate） | 官方插件的薄包装 | ✅ | 需把**只读 PAT 打进二进制** | 给私有仓库加 `Authorization`；清单走 `raw.githubusercontent.com`，资产走 API + `Accept: application/octet-stream` |
| **`update-notifier`**（npm, sindresorhus） | Node CLI 库 | ✅ **unref'ed 子进程**，不阻塞启动 | ✗（面向 CLI 查 npm registry） | 值得抄的设计：**间隔阈值 + 结果持久化**（下次启动读缓存） |
| **`electron-update-notifier`** | Electron 库 | ✅ `silent:true` | ✗（非 Electron） | 从 GitHub repo 取 release，只提示不自动装 |
| **自研 GitHub API 检查** | ~60 行 | ✅ | **最轻** | 只在**公开**仓库可行（私有需凭据/代理） |

## 三、静默检查的通用最佳实践（多案例提炼）

来源：bomlens PR#303、flaviocopes（Mac 自更新）、minutes commit、Wails/Shoppleet、Glyx docs、goose `githubUpdater.ts`。

1. **延迟启动**（3–5s 或 boot 完成后）——不抢启动资源；"check after a short delay so the app is responsive first"。
2. **失败静默**——"Every failure (offline, rate limit, bad JSON) returns null — the notice is a courtesy, **never a boot blocker**"。
3. **节流 + 持久化**——把 `lastCheck` 落盘，24h 内只查一次；"opening it ten times a day makes one request"。
4. **非模态提示**——banner/toast（"Restart Now" / "Later"），**绝不弹模态框**、绝不打断正在进行的操作（minutes 甚至做到"录制中不提示"）。
5. **可跳过版本**——"Skip This Version" 记住用户选择，避免每天骚扰同一个人。
6. **请求要带超时 + User-Agent**——GitHub 强制要求 UA；goose 用 30s AbortController。
7. **不要在客户端塞 token**（公共分发场景）——正确做法是**公开清单**或**服务端代理**。

## 四、方案对比与推荐

| 方案 | 做法 | 代价 | 能力 |
|---|---|---|---|
| **A. 公开版本清单**（推荐先做） | 把 `{"version":"1.4.0","url":"<release页>","notes":"..."}` 放到**公开可读**处（公开 Gist / 独立公开 repo 的 raw / 任意静态托管）；App 启动拉它比对 | **极低**（CI 多一步 + 前端 ~60 行） | **只提示**「有新版本」，点击打开 Release 页 |
| **B. `tauri-updater-private`** | 只读 PAT（限本仓库、Contents:Read）打进二进制 | 中（PAT 管理 + 签名密钥 + CI 改） | **完整自动下载安装** |
| **C. 公开镜像 repo** | 源码私有，**release 产物镜像**到独立公开 repo（`gh release create -R`） | 中（多一个 repo + CI 一步） | 完整自动更新，且清单/资产都能匿名读 |
| **D. 自建代理** | 小服务持 token，App 查代理（可加缓存/紧急下线开关） | 高（要运维） | 企业级（多用户、限流保护、强制最低版本） |

**推荐路线**：**先 A**（满足「启动静默检查 git 更新」，一行提示，零凭据风险）→ 若日后想要一键自动更新，再上 **C**（比 B 更干净：不用把 token 塞进产物）。

### 已知坑（务必避开）

- `github.com/.../releases/latest/download/latest.json` 对**私有仓库无视 `Authorization`**，必然 404；要用 `raw.githubusercontent.com`（清单提交到默认分支）或公开 repo。
- 若清单里的资产 URL 指向 `api.github.com/repos/.../releases/assets/<id>`，**未认证客户端会撞 60 次/小时/IP 配额 → 403**；应改写成公开的 `releases/download/...` 直链。
- 前端调用 `download/downloadAndInstall` 时**不要传 `headers`**（会整表替换，静默丢掉预置 Authorization）。

## 五、轻量版（方案 A）实现草图

```js
// engine/lib/update-check.mjs —— 启动静默检查（失败一律静默）
import fs from 'node:fs';
import path from 'node:path';

const MANIFEST = 'https://<公开处>/shiphub-latest.json';  // {"version":"1.4.0","url":"...","notes":"..."}
const STATE = path.join(process.env.SSH_DATA_DIR || '.', 'update-check.json');
const INTERVAL_MS = 24 * 3600 * 1000;   // 24h 内不重复查（落盘节流）

export function isNewer(latest, current) {
  const p = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const a = p(latest), b = p(current);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

export async function checkForUpdate(currentVersion, { fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8').toString() || '{}');
    if (now - (st.lastCheck || 0) < INTERVAL_MS) return st.result || null;  // 节流：读缓存
    const r = await fetchImpl(MANIFEST, { headers: { 'user-agent': `ShipScheduleHub/${currentVersion}` }, signal: AbortSignal.timeout(15000) });
    const j = r.ok ? await r.json() : null;
    const result = j && isNewer(j.version, currentVersion) ? { version: j.version, url: j.url, notes: j.notes || '' } : null;
    fs.writeFileSync(STATE, JSON.stringify({ lastCheck: now, result }));
    return result;   // null = 无更新/失败（调用方静默）
  } catch { return null; }   // 离线 / 限流 / 坏 JSON → 静默
}
```

前端接线（启动后延迟、非模态）：

```js
setTimeout(async () => {
  const u = await checkForUpdate(APP_VERSION);
  if (u) showUpdateBadge(u);   // 顶部一行小提示「v1.4.1 可用 · 查看」→ 打开 u.url
}, 5000);
```

CI 侧（发布时产出清单，方案 A）：

```yaml
- name: Publish update manifest
  run: |
    printf '{"version":"%s","url":"%s","notes":""}' "$VERSION" "$RELEASE_URL" > shiphub-latest.json
    # 推到公开可读处（公开 Gist / 公开 repo raw）
```

---

## 六、实施结果（2026-10-13 已完成）

**最终方案**：**复用本机已登录的 `gh` 凭据查私有 release** —— 比公开托管更干净（零公开托管、零 token 入档、零公开仓库）。

实现（`src-tauri/src/lib.rs` + `src/main.js` + `src/styles.css`）：

| 部分 | 内容 |
|---|---|
| Rust `check_update` command | 找 `gh`（`SSH_GH_PATH` → `/opt/homebrew/bin/gh` → `/usr/local/bin/gh` → `~/.local/bin/gh`）→ `gh api repos/.../releases/latest --jq` → 语义化版本比较 `is_newer()` |
| 节流 | 落盘 `~/Library/Application Support/com.ross.shipschedulehub/update-check.json`（bundle id 目录），**24h 内命中缓存** |
| 静默 | 任何失败（找不到 gh / 未登录 / 网络失败 / 坏 JSON）→ `{hasUpdate:false, silent:true}`，不打扰 |
| 前端 | 启动**延迟 5s** → `invoke('check_update')` → 有新版才在窗口顶部插一条绿色提示（**DOM API 构建，无 innerHTML**），带「查看更新 / 跳过此版本 / ×」 |
| 验收开关 | `SSH_FORCE_UPDATE=1` 把 current 降到 1.3.0 强制走通提示条（该模式**不写缓存**，避免污染真实结果） |

**验证**：
- Rust 单测 `cargo test` **5 passed / 0 failed**（含版本比较 8 个断言）
- 实机两条路径：有更新 → 绿色提示条「有新版本 v1.4.0（当前 v1.3.0）· 查看更新 · 跳过此版本 · ×」；无更新 → **完全静默**（截图 update-bar-final.png / update-bar-normal.png）
- 缓存落盘内容核对：正常路径写 `{current:"1.4.0", hasUpdate:false}`，force 路径不写

**遗留/边界**：本方案依赖本机 `gh` 登录态（自用场景最优）；若要分发给同事自动更新，走文档第四节方案 C（公开镜像 repo）+ Tauri 官方 updater。

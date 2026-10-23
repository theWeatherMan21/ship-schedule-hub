# 海运聚合追踪 · 可行性核查（2026-10-23）

> 目的：OOCL 官网被 Cloudflare + CargoSmart 滑块挡住（见 `OOCL-TRACKING-2026-10-23.md`），
> 评估「换聚合站拿数据」这条路。全部为实测，不是二手说法。

## 结论速览

| 候选 | 能不能自动化 | 判定 |
|---|---|---|
| **维运网** weiyun001.com | ❌ | `/track` 是 Next.js App Router；翻遍 59 个客户端 chunk **没有任何 `/api/` 路径**，数据走 RSC 内部协议；页面挂 `antidom.js` 检测自动化 |
| **搜航网** sofreight.com | ❌ | 站内「货物追踪」直接外链 `17track.net`（包裹级），无海运提单追踪入口；`apiv6.sofreight.com/api` 有网关但要登录态 |
| **CargoSmart** cargosmart.com | ❌ | `/tracking` 直接 404；公开页无匿名接口（它正是给 OOCL 提供滑块的那家） |
| **Terminal49** | ⚠️ 免费档只能写不能读 | 正式 REST API（`api.terminal49.com/v2`）+ MCP + 测试单号；**实测：免费档 `POST /v2/tracking_requests` 201 可建，但 GET 一律 401「除创建追踪请求外都需要付费」**；API 读取+webhook 属 Essential 档（付费） |
| **ShipsGo** | ✅ 需 API key | 覆盖 160+ 船司、标准 JSON；但 `shipsgo.com` 对我们的出口 IP 直接 Cloudflare 403（登录后台仍可用） |

## 维运网细节（为什么放弃）

```bash
curl -sSL https://www.weiyun001.com/track        # 307 → ?regionredirected=true，200，365 KB
# 提取页面引用的 59 个 chunk，逐个下载后 grep：
grep -oE "/api/[A-Za-z0-9_/]{4,70}" <每个 chunk>  # → 0 条命中
```
- 只找到常量：`HISTORY__SHIP_TRACK_QUERY_RECORD_KEY`、路由 `/track`、`CargoTracking`；
  以及上传组件的 `https://wywapi.weiyun001.com/api`（那是文件上传，不是追踪）。
- 与 2026-09-24 的结论一致：**船期/追踪明细走 RSC 内部协议，无公开客户端端点**。

## 推荐路线：Terminal49 免费档

理由：有正式 API 契约（OpenAPI + JSON:API）、有测试单号、不靠解验证码；
且它覆盖的不是只有 OOCL —— 接一家等于给**所有未接入船司**兜底。

需要的一步（人为）：
1. 注册 <https://terminal49.com>（免费档，无需信用卡）
2. 后台生成 API token
3. 落到本机 `~/.hermes/.env`：`T49_API_TOKEN=***`（或直接告诉我，我写进去）

接好之后的实现计划：
- 新增 `engine/tracking/oocl.mjs`：无 `T49_API_TOKEN` 时返回 `errorKind:'no-credential'`（不静默失败）
- 有 token：`POST /v2/containers` 或 `POST /v2/shipments`（按 BL 号建 tracking request）→ 拉里程碑 → 归一化
- 先用官方 **test numbers** 验通，再拿爹地真单回归
- 顺带可作「未接入船司」（SITC/万海/KMTC…）的通用兜底通道

## 反面教材（别重复）

- 不要为了 OOCL 去解滑块：站点风控方 CargoSmart 同时在多家船司用，属长期猫鼠游戏。
- 不要假设聚合站比船司好抓：维运网/搜航网的反爬（antidom + RSC）**强于**多数船司官网。


## 2026-10-23 追加：Terminal49 实测结论（免费档不可用）

拿到 API key 后实测：

| 动作 | 结果 |
|---|---|
| `POST /v2/tracking_requests`（test number `TEST-TR-SUCCEEDED`, scac `TEST`） | **201**，返回 `status: pending` |
| `GET /v2/tracking_requests/{id}` | **401** — `You do not have permissions for using the API, except for creating tracking requests. All other permissions require a paid plan.` |
| `GET /v2/containers` | **401**（同上） |
| `DELETE /v2/tracking_requests/{id}` | 404（免费档不允许删，需后台 UI 手删） |
| 定价页 | 免费档不含 API 读取；**API access & webhooks 在 Essential 档**（年度合约 / 按量） |

→ **免费档是只写不读，接不出可用数据。** 要用只能付费升级。

## 拍板结果（2026-10-23，爹地）

**选 B：维持 10/11 自动，OOCL 手工查。** 不为一家船司开年度合约。

- 已在 T49 后台保留一个 API key（名称 `Hermes-WPS`），token 存本机 `~/.hermes/.env` 的 `T49_API_TOKEN`；
  将来若升级付费，可直接复用，无需重新申请。
- 账号里遗留 1 个测试 tracking request（`TEST-TR-SUCCEEDED`），API 删不掉，可在后台
  Developers → Tracking Requests 手动删除。

# 海运聚合追踪 · 可行性核查（2026-10-23）

> 目的：OOCL 官网被 Cloudflare + CargoSmart 滑块挡住（见 `OOCL-TRACKING-2026-10-23.md`），
> 评估「换聚合站拿数据」这条路。全部为实测，不是二手说法。

## 结论速览

| 候选 | 能不能自动化 | 判定 |
|---|---|---|
| **维运网** weiyun001.com | ❌ | `/track` 是 Next.js App Router；翻遍 59 个客户端 chunk **没有任何 `/api/` 路径**，数据走 RSC 内部协议；页面挂 `antidom.js` 检测自动化 |
| **搜航网** sofreight.com | ❌ | 站内「货物追踪」直接外链 `17track.net`（包裹级），无海运提单追踪入口；`apiv6.sofreight.com/api` 有网关但要登录态 |
| **CargoSmart** cargosmart.com | ❌ | `/tracking` 直接 404；公开页无匿名接口（它正是给 OOCL 提供滑块的那家） |
| **Terminal49** | ✅ 需 API token | 正式 REST API（`api.terminal49.com/v2`，`Authorization: Token …`）+ MCP server + 官方测试单号；免费档「最多 10 个在途箱」 |
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

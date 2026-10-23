# OOCL 追踪接入评估（2026-10-23）

> 背景：11 家船司追踪里唯一缺 OOCL。本轮用无头 Chrome 实探了官方追踪链路，结论是
> **匿名自动化不可靠，不建议硬接**。证据如下（全部为实测，非推测）。

## 实测过程

1. 入口页
   `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx`
   → HTTP 200（179 KB）。

2. 页面结构（无头 dump）：
   | 元素 | 说明 |
   |---|---|
   | `input#SEARCH_NUMBER` | 单号输入框 |
   | `select#ooclCargoSelector` | 类型：`bl` / `booking` / `cont` |
   | `a#container_btn` | 「Search」，`onclick="ListeningCargoTrackingBtn()"` |
   | `form#aspnetForm` | ASP.NET WebForms（ViewState 回传） |

3. 提交时抓到的网络请求：
   ```
   POST https://www.oocl.com/cdn-cgi/challenge-platform/h/b/jsd/oneshot/...
   ```
   → **Cloudflare JSD 挑战**（`/cdn-cgi/challenge-platform/` 是 CF 的管理挑战端点）。

4. 页面内嵌验证码资源：
   ```
   https://cs-captcha-public.cargosmart.com/captcha/public/js/crypto-js.js
   https://cs-captcha-public.cargosmart.com/captcha/public/css/verify.css
   <div id="cs_captcha" slide-text="Slide to verify not a robot" …>
   ```
   → **CargoSmart 滑块验证**（OOCL 所属 CargoSmart 平台的通用风控）。

5. 备选通路试过：
   - `pbservice.moc.oocl.com/party/vesseltracking/vessel_tracking_search.jsf` → 302 到登录页，非公开。
   - 直接 GET 带 `?SEARCH_NUMBER=` → 只回表单页，不返回结果（结果走 postback + 客户端风控）。

## 结论

OOCL 匿名追踪 = **Cloudflare 挑战 + CargoSmart 滑块**双重风控。自动化要过就得解滑块，
属于长期猫鼠游戏，且随时失效 —— 不符合本项目「稳定、可回归」的交付标准。

**当前处置**：不写 `oocl.mjs`。CLI/App/加载项对 OOCL 单号返回明确文案：
「OOCL 暂未接入（官网需滑块验证，请手工查）」，不再给泛化错误。

## 若要真接，可选路线（按可行性）

| 路线 | 成本 | 说明 |
|---|---|---|
| 付费聚合 API（Vizion / Terminal49） | 订阅费 | 一次接入 11+ 家，最省事；Vizion 文档里 OOCL 明确支持 |
| 维运网/搜航网等聚合站 | 需评估反爬 | 见 `weiyun-aggregator-research` 技能；适合国内网络 |
| 人工半自动 | 0 | 用户在官网手点一次滑块；工具只做「提醒该查了」 |
| 解滑块 | 高、且不稳 | 不建议 |

> 复核时间：2026-10-23。站方若改版（例如改成公开 JSON 接口），本结论需重测。

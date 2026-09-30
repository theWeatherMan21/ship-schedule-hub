# 任务卡 v5：M4 数据验证 —— Ningbo→Istanbul 逐家打通（先证数据，不谈壳）

> 派单人：婉宜（Supervisor）｜执行：码农（manong）｜委托人：ross（叫「爸爸」）
> 时间盒：**2 天**（到点回传三态，禁无声拖延）
> 委托人原话（最高优先级）：「先把每个船司都测试好，就用 Ningbo-Istanbul 这两个港口测试，
> 然后先搞清楚不同船司对同一个港口的不同称呼，比如 Izmit 可能等于 Gebze 或者 Izmit Korfezi 等等，
> 如果连船期都搜不到，后面做了也没意义」

## 0. 北极星与本轮目标

**本轮只做一件事：证明「机器自主」能从每家船司官网搜出 Ningbo→Istanbul 的真实船期数据。**
壳/App/UI 都不是本轮的事。搜不到数据的船司，App 再漂亮也是空壳。

## 1. 已验证的基础（直接用，别重造）

- **Maersk 全自主闭环已通**（2026-09-21，婉宜亲测）：
  cookie→填港→**选 CY 候选**→日期→Search→**读回 5 条真实船期**（Transit 33-47 天）
- 完整打法 + 四条铁律：**必读 `FINDINGS-2026-09-21.md`**，脚本 `qa/autonomous-maersk-v6.mjs`
- 浏览器层 `engine/browser.mjs`（有头 + CDP 最小化静默）直接复用

### 四条铁律（Maersk 实测总结，逐家适用）
1. **输入后必须点候选**，否则输入框被清空，提交必报 "Please enter X"
2. **同港多候选是常态**（SD/CY 服务模式、国家同名），**按徽标文本选，不按索引**
3. **读候选文本用 ariaSnapshot()/textContent**，mc-*/Shadow DOM 组件上 innerText 返回空串
4. **fill('') 后接 type(..., {delay})**，别用 pressSequentially（会废掉自动补全触发）

## 2. 测试口径（固定，别换）

- **起运港：Ningbo**（中国宁波）
- **目的港：Istanbul**（土耳其伊斯坦布尔 —— 周边有 Ambarli/Haydarpasa/Gebze/Izmit Korfezi/Marda 等港口，
  各家叫法不同，**这正是本轮要摸清的**）
- 日期：测试日 +7 天的 DD/MM/YYYY
- **交付一份《同港异名对照表》**：每家船司把 Istanbul 系列叫什么、选哪个、结果区给几条船期

## 3. 十家清单与已知状态

| 船司 | 入口 | 已知 |
|---|---|---|
| Maersk | maersk.com/schedules/pointToPoint | ✅ 闭环已通，写回配方即可 |
| MSC | msc.com/en/search-a-schedule | 有头 200；Search 按钮曾「找不到可见的」——按铁律 3 用 ariaSnapshot 排查 |
| CMA CGM | cma-cgm.com/ebusiness/schedules | 需 profile 履历，新 profile 403 → 若被拦记 fallback |
| COSCO | elines.coscoshipping.com | 船期入口未确认，先探 |
| Hapag-Lloyd | hapag-lloyd.com/…/vessel-schedule.html | Cloudflare 挑战，先试，过不去记 fallback |
| ONE | ecomm.one-line.com | 入口曾 404，重新探真实入口 |
| Evergreen | shipmentlink.com | 首页 Origin/Destination 表单已探到 |
| Yang Ming | yangming.com/esolution/schedule/point_to_point_search | P2P 表单已探到 |
| HMM | hmm21.com/e-service/schedule/ | location/date 表单已探到 |
| ZIM | zim.com | 船期子路径 Akamai 403（有头也拦），试主页入口 |

## 4. 每家的工作循环（照此执行）

```
1. 打开入口 → cookie 直accept（爸爸指示）→ isBlockPage 判拦截
2. 输入 Ningbo → 等候选 → ariaSnapshot 读全部候选文本 → 记录进对照表 → 点 China 那个
3. 输入 Istanbul → 同样读候选（Ambarli? Haydarpasa? Gebze? Izmit Korfezi?）→
   按「Istanbul 主港优先，CY 优先，Turkey 命中优先」打分选
4. 日期 → 搜索 → 等 15-30s → 抓结果页文本 + XHR
5. 判定三态：✅ 有船期（几条，ETD/ETA/transit）/ ⚠️ 搜到但空（记录候选叫法，试换港名）
   / ❌ 拦截或无入口（如实记录原因）
6. 证据：evidence/m4-<carrier>.txt + .png + 对应配方 .mjs 修改
```

**换名重试规则**（同港异名的精髓）：Istanbul 搜不到 → 依次试 Ambarli / Haydarpasa / Gebze /
Izmit Korfezi / Istanbul (Ambarli)……每个变体的候选文本都记进对照表，**这些就是爸爸要的情报**。

## 5. 交付物

1. **《同港异名对照表》** `docs/PORT-ALIASES.md`：行=船司，列=它对 Istanbul 系的称呼、选中项、结果条数
   **⚠️ 铁律：每跑通一家，立刻把链路写进 PROJECT.md 的「四·五、船司链路台账」**（入口→填法→结果→配方要点→证据路径），
   不许攒到最后一起写——中断了台账必须仍是最新状态
2. 每家配方文件更新 + 三态判定
3. `evidence/m4-*.txt/png` 逐家证据
4. 汇总报告（三态格式）

## 6. 红线（老规矩）

- ❌ 不碰 UI/App/壳（那是下一轮）
- ❌ 不碰爸爸日常 Chrome profile
- ❌ 测试窗口不许出现在屏幕上（CDP 最小化）
- ❌ 分批限速（每批 ≤3、间隔 2-4s），被限速就等 60s 再试，别轰炸
- ❌ 搜不到不编造：如实记录「空结果 + 试过哪些变体」，这是有价值的情报不是失败

## 7. 交活格式

```
做了什么：
同港异名对照表：（直接贴表）
三态汇总：✅x家 ⚠️x家 ❌x家（各家一句话）
证据路径：
未完成项：
```

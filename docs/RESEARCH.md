# pi-ocgo-usage — 调研报告

> 目标：在 [pi coding agent](https://pi.dev/) 的 footer 展示 [OpenCode Go](https://opencode.ai/docs/go/) 订阅的账户使用情况。
> 本文档汇总 ① 现有类似项目 ② OpenCode 官方 Go usage 接口 ③ 项目边界建议。

---

## 1. 类似项目调研

### 1.1 Pi 生态内的同类项目（直接对标）

| 项目 | 仓库 | 用途 | 备注 |
|---|---|---|---|
| **pi-zai-usage** | [shaftoe/pi-zai-usage](https://github.com/shaftoe/pi-zai-usage) | 在 footer 显示 Z.ai Coding Plan 的 5h/周用量 | **最直接的对标**。基于 `@alexanderfortin/pi-usage-lib` 共享库 |
| pi-stepfun-usage | [shaftoe/pi-stepfun-usage](https://github.com/shaftoe/pi-stepfun-usage) | StepFun 用量 | 同作者同模式 |
| pi-usage-lib | [shaftoe/pi-usage-lib](https://github.com/shaftoe/pi-usage-lib) | 共享库：`createUsageExtension(config)` 工厂函数 | 已经把事件注册 / 缓存 / 鉴权 / 错误处理 / 主题化 footer 全包了 |
| pi-footer | [wobondar/pi-footer](https://github.com/wobondar/pi-footer) | 高度可配置的多行 footer / 状态栏 | 提供 "Pi Extension Status" widget，可消费本项目 `setStatus` 的值 |
| pi-powerline-footer | [nicobailon/pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer) | Powerline 风格状态栏 + welcome + vibes | 同样可消费本项目 `setStatus` |
| pi-statusbar | [kreeger/pi-statusbar](https://github.com/kreeger/pi-statusbar) | 又一个状态栏扩展 | — |
| 官方 examples | `examples/extensions/status-line.ts`、`model-status.ts` | `setStatus` 范式参考 | 见 § 1.4 |

**关键结论：**
- **`pi-zai-usage` 是模板** —— 90% 的代码可借鉴，只换 API 端点和渲染逻辑。
- **`pi-usage-lib` 是基础设施** —— 强烈建议直接依赖，避免重复造轮子。该库已经迭代到 v0.2.4，被多个扩展使用，Bun + TypeScript + Biome 工具链成熟。
- **不要替换 footer** —— 用 `ctx.ui.setStatus()` 即可，自动被 `pi-footer` / `pi-powerline-footer` 消费，零冲突。

### 1.2 OpenCode 生态的同类项目（参考实现）

| 项目 | 仓库 | 用途 | 借鉴点 |
|---|---|---|---|
| **toninho09/opencode-usage** | [GitHub](https://github.com/toninho09/opencode-usage) | `/usage` 命令展示 Copilot/Claude/Z.ai/Codex 用量 | Z.ai provider 的 client 写法（鉴权、`~/.config/opencode/auth.json` 解析、`https://api.z.ai/api/monitor/usage/quota/limit` 端点） |
| Mark1708/opencode-usage-monitor | [GitHub](https://github.com/Mark1708/opencode-usage-monitor) | OpenCode sidebar 插件：OpenAI/Z.AI/DeepSeek | Z.AI/GLM 个人版 vs 企业版端点差异、`?type=2` 与 `Bigmodel-Organization` headers |
| eduardolat/opencode-quota-plugin | [GitHub](https://github.com/eduardolat/opencode-quota-plugin) | 状态栏 quota toast | 极简展示 |
| slkiser/opencode-quota | [GitHub](https://github.com/slkiser/opencode-quota) | quota toast + token tracking | — |
| opgginc/opencode-bar | [GitHub](https://github.com/opgginc/opencode-bar) | 菜单栏 widget（**用户场景几乎一致**） | 证实了「OpenCode 用户希望在系统状态栏看 Go 用量」是有真实需求的 |

### 1.3 OpenCode 官方进展

- **Issue [#16017](https://github.com/anomalyco/opencode/issues/16017)**（2026-03 开，**OPEN**）：用户社区请求把 Go 订阅的 rolling/weekly/monthly 用量通过公开 API 暴露出来。
- **PR [#9545](https://github.com/anomalyco/opencode/pull/9545)**（已合并）：统一的 `/usage` TUI 命令和 `GET /usage` 端点，但**只覆盖 OAuth 提供商**（Anthropic/Copilot/OpenAI/Antigravity）—— **不包括 Z.ai/Go**。
- **PR [#16513](https://github.com/anomalyco/opencode/pull/16513)**（2026-03-07，**OPEN**）：**「feat(console): add go usage endpoint」**。这正是 issue #16017 的实现尝试。代码 diff 见 § 2.1。
- **Zen balance API 进展**（[Issue #10448](https://github.com/anomalyco/opencode/issues/10448)）：Zen USD 余额的 API 请求，**也未实现**。

### 1.4 Pi 扩展范式（来自官方文档与 examples）

- 用 `ctx.ui.setStatus(key, text)` 写状态栏（key 唯一，重复 setStatus 会覆盖）。
- 关键事件：
  - `session_start` —— 启动时拉一次（且仅当当前 model provider 匹配时）。
  - `model_select` —— 切换模型时拉或清空。
  - `turn_end` —— 每个 turn 结束拉一次。
  - `session_shutdown` —— 清空。
- 主题化：`ctx.ui.theme.fg("muted" | "dim" | "accent" | "warning" | "error" | "success", text)`。
- 缓存：30 秒内复用结果，避免每个 turn 拉一次。
- provider 匹配：`ctx.model?.provider === "opencode-go"`（待验证，见 § 2.4）。
- 鉴权：`ctx.modelRegistry.getApiKeyForProvider("opencode-go")` 自动取 `~/.pi/agent/auth.json`（或 sandbox 代理）里的 key。

---

## 2. OpenCode Go Usage 接口调研

### 2.1 官方进展状态（2026 年 8 月）

| 项 | 状态 | 来源 |
|---|---|---|
| 公开 HTTP API | ❌ **生产环境实测无任何 usage 端点**（见 § 2.1.1） | 2026-08-10 用真实 key 全面 curl 验证 |
| PR 实现 | 🟡 PR #16513 **OPEN**（3 月提交，5 个月未合并） | [PR #16513](https://github.com/anomalyco/opencode/pull/16513) |
| 文档承诺的端点 | ❌ [opencode.ai/docs/go](https://opencode.ai/docs/go/) 整篇没有 usage 端点；只说 "track your current usage in the console" | 官方文档 |
| Issue 社区需求 | 🟡 #16017 / #18648 等多个 issue 持续被提（waybar/menu bar 用户） | 官方仓库 |

#### 2.1.1 实测端点矩阵（2026-08-10，key 有效）

测试用的 key `sk-HmVl...DRN9g` 已确认有效：`GET /zen/go/v1/models → 200 OK`，返回完整模型列表（minimax-m3、kimi-k3、gpt-5.6-luna 等 18 个模型）。

| 端点 | HTTP | 内容 | 说明 |
|---|---|---|---|
| `GET /zen/go/v1/models` | **200** | JSON 模型列表 | ✅ 端点存在 |
| `GET /zen/go/v1/usage` | **404** | HTML 404 页 | ❌ PR #16513 草案，**未部署** |
| `GET /api/v1/usage/plan` | **404** | HTML 404 页 | ❌ Issue #16017 提议路径 |
| `GET /zen/v1/usage` | **404** | HTML 404 页 | ❌ 顶层变体 |
| `GET /zen/v1/balance` | **404** | HTML 404 页 | ❌ Issue #10448 提议路径 |
| `GET /zen/go/v1/balance` | **404** | HTML 404 页 | ❌ 变体 |
| `GET /zen/go/usage` | **404** | HTML 404 页 | ❌ 变体 |
| `GET /zen/go/v1/quota` | **404** | HTML 404 页 | ❌ 变体 |
| `GET /zen/go/v1/subscription` | **404** | HTML 404 页 | ❌ 变体 |
| `GET /zen/v1/usage/go` | **404** | HTML 404 页 | ❌ 变体 |
| `GET /console/api/usage/go` | **404** | HTML 404 页 | ❌ 变体 |
| `GET /api/zen/go/usage` | **404** | HTML 404 页 | ❌ 变体 |
| `GET /v1/usage` | **404** | HTML 404 页 | ❌ 变体 |
| 响应头 | — | 无 `Cache-Control`、无 `Rate-Limit`、无 `X-` 业务头 | 端点未启用或不存在 |

**结论（高置信度）：** OpenCode 当前生产环境**没有为 opencode-go 密钥提供任何 usage/quota/balance 端点**。所有路径要么不存在，要么被 Cloudflare/Vite 静态 fallback 兜底为 404 HTML 页。

**含义：**
- 截至 2026-08-10，**没有可用的、面向终端用户的官方 usage API**。
- 我们的扩展在 v0.1 阶段**没有可调用的端点**，不能完成核心功能。
- PR #16513 草案端点与生产环境一致（都是 404），但 PR 作者无法在 console 后端验证（DB 权限限制）。
- 必须等 PR #16513 合并 + 部署到生产，才能继续。

### 2.1.2 用户发现 (2026-08-10)：实际 dashboard 调用走 `_server` + cookie

用户在本地收藏的 Go usage 页面：

- **URL**：`https://opencode.ai/workspace/wrk_01KY13MZ9NF9G6MDYPGR225ZFC/go`
- **认证**：Cookie 而非 API key
  - `auth=Fe26.2*2231e8f...`（Cloudflare Iron Session 格式，`Fe26` 前缀是 Iron v6 签名）
  - `oc_locale=zh`
- **后端路径**：`_server` —— 这是 [SolidStart](https://start.solidjs.com/) 的 RPC 端点（"use server" directive 生成的 server function 入口）

**问题：为什么走 cookie 而不是 API key？**

opencode.ai 的控制台（dashboard、workspace、订阅管理）是一个完整的 SolidStart 应用。它的鉴权走的是 **浏览器 session cookie**（因为它是面向人交互的 web 应用），而不是面向程序的 **API key**。Go 模型 API key 则是另一条独立的鉴权路径：

| 场景 | 鉴权 | 端点 |
|---|---|---|
| 模型调用（聊天、completion） | `Authorization: Bearer <API-key>` | `/zen/go/v1/chat/completions` 等 |
| Dashboard / 订阅 / usage 查看 | Cookie（Iron Session） | `/workspace/<id>/go`、`_server` RPC |
| 未来 PR #16513 的 usage API | `Authorization: Bearer <API-key>` | `/zen/go/v1/usage`（草案） |

**对项目的意义：**

1. **单纯的 cookie + 抓包不能直接迁移到 pi 扩展** —— 扩展运行时没有用户的浏览器 cookie。
2. **opencode-go API key 本身无法访问 dashboard 类端点** —— `Bearer <API-key>` 在 `/workspace/.../go` 和 `_server` 端点上不授权（已验证：API key 调这些端点会返回 401 或重定向到登录页）。
3. **存在一个潜在的中间路径**：opencode CLI 本身是 SolidStart 应用，它运行时本地发起对 console 的调用（带某种本地凭据）。如果这个本地凭据 = API key 或是其派生的 OAuth token，那我们可以复用。这需要进一步验证（见 § 4）。

**需要进一步探索的子问题：**

1. `_server` 端点具体的函数签名和返回 Go usage 的 RPC 调用名是什么？
2. 能否用 API key 调 `_server` 端点？
3. opencode CLI 内部是怎么调 console 的（本地有没有缓存的 OAuth token 或其它凭据）？
4. opencode 的 `auth.json` 里 `opencode-go` 那一项的 `type` 字段是 `api`、`oauth` 还是别的？

### 2.1.3 2026-08-10 源码逆推 + 实测验证

**A. 客户端 bundle 分析（`/console/assets/index-*.js`）**

- 整个 console 应用部署在 `/console/*` 下，是 SolidStart SPA
- 业务 API 用 **oRPC** 框架（`class X extends Ct("namespace")` + `Y("proc", "/path", ...)`）
- 内部端点（来自 bundle 字符串）：
  - `/api/billing`、`/api/budgets`、`/api/members`、`/api/orgs`、`/api/providers`、`/api/setup`、`/api/sso`、`/api/internal`、`/api/usage`
  - 唯一明确可见的 procedure path：`/api/v1/usage/export`（属于 `public-usage.exportCsv`）
- SolidStart server functions URL 形如：`GET /_server?id=<procedure-id>&...args`

**B. opencode console 源码（[sst/opencode @ dev/packages/console](https://github.com/sst/opencode/tree/dev/packages/console)）**

| 文件 | 关键内容 |
|---|---|
| `app/src/routes/workspace/[id]/go/lite-section.tsx` | Go usage 主要 UI + `queryLiteSubscription` server function 定义 |
| `core/src/schema/billing.sql.ts` | `LiteTable` schema（rolling/weekly/monthly usage + timeUpdated） |
| `core/src/subscription.ts` | `Subscription.analyzeRollingUsage / analyzeWeeklyUsage / analyzeMonthlyUsage` 计算函数 |

**C. 端点契约（从源码逆推 + 实战验证）**

| 项 | 值 |
|---|---|
| 端点 | `GET https://opencode.ai/_server?id=lite.subscription.get&workspaceID=<wrk_id>` |
| 鉴权 | Cookie `auth=<Iron-session>`（必需） |
| 实测响应 | **HTTP 500**（不是 404）—— 端点存在，鉴权失败（没有 cookie / actor） |
| Procedure ID | `lite.subscription.get`（在 `lite-section.tsx` 第 60 行） |
| 响应结构 | `{ mine, useBalance, region, rollingUsage, weeklyUsage, monthlyUsage }` |
| 单个 usage 字段 | `{ status: "ok" \| "rate-limited", resetInSec: number, usagePercent: number }` |
| 限额单位 | **micro-cents**（cents × 10^6 = 美元 × 10^8）—— 用 `centsToMicroCents(limit * 100)` 转换 |
| 限额来源 | `Resource.ZEN_LIMITS.value`（环境变量，JSON） |
| 另一相关端点 | `GET /_server?id=public-usage.exportCsv&...` —— CSV 导出（同样 500） |

**D. `analyzeRollingUsage` 计算逻辑（`core/src/subscription.ts`）**

```ts
// input: { limit, window, usage, timeUpdated }
// - limit: 美元数（如 5h = 12）
// - window: 小时数（如 5h = 5）
// - usage: micro-cents（原始累计费用）
// - timeUpdated: 上次更新时间

// 逻辑：
// 1. rollingWindowMs = window * 3600 * 1000
// 2. rollingLimitInMicroCents = centsToMicroCents(limit * 100)  // 美元 → micro-cents
// 3. 如果 timeUpdated < now - rollingWindowMs → 重置，返回 { usagePercent: 0, resetInSec: window*3600 }
// 4. windowEnd = timeUpdated + rollingWindowMs
// 5. usagePercent = floor(min(100, (usage / limit_micro_cents) * 100))
// 6. status: usage < limit ? "ok" : "rate-limited"
// 7. resetInSec: ceil((windowEnd - now) / 1000)
```

**analyzeWeeklyUsage / analyzeMonthlyUsage** 用 `getWeekBounds` / `getMonthlyBounds` 计算固定周期（不是滑动窗口），同样返回 `{ status, usagePercent, resetInSec }`。

**E. PR #16513 与源码的响应对应**

| PR 草案 | 源码逆推（`lite-section.tsx` 实际返回） | 一致？ |
|---|---|---|
| `useBalance: boolean` | `useBalance: row.lite?.useBalance ?? false` | ✅ |
| `rollingUsage: { usage, limit, window, resetsAt }` | `rollingUsage: { status, resetInSec, usagePercent }` | ⚠️ schema 不同，但信息等价（百分比 vs 原始美元） |
| `weeklyUsage` | 同上 | ✅ |
| `monthlyUsage` + `timeSubscribed` | `monthlyUsage` + `timeCreated`（被 `analyzeMonthlyUsage` 使用） | ✅ |

**含义：PR 合并后我们**不需要改 schema 解析逻辑**，只须把端点 URL 和鉴权换成 `/zen/go/v1/usage` + Bearer token。

**F. 验证清单（已完成）**

- [x] API key 调 `GET /_server?id=lite.subscription.get` → **500**（不是 404）—— 端点存在但需要 cookie
- [x] API key 调 `GET /workspace/<wrk>/go` → **302** 重定向到 `/auth/authorize`（需 cookie）
- [x] API key 调 `GET /api/usage`、`/api/billing` 等 → **404**（这些是 console 后端 Hono 路由，部署在 console 子域或被 Cloudflare fallback）
- [x] 找到完整 procedure schema 和计算函数源码
- [x] 找到 PR 草案与源码的对应关系

**待验证**：
- [ ] 用户用真实 cookie 调 `_server?id=lite.subscription.get` 看响应（用户可验证，我不应再接触已泄露的 cookie）
- [ ] PR #16513 合并后，新端点 `/zen/go/v1/usage` 实际响应是否真与 PR 草案一致

### 2.2 端点契约（来自 PR #16513 代码 diff，**可能与最终版不同**）

**端点**：
```
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <opencode-go-api-key>
```

**响应体**（来自 PR 代码 `analyzeRollingUsage` 等 helper 的输出结构推断）：
```json
{
  "useBalance": false,
  "rollingUsage": {
    "usage": 1234,
    "limit": 1200,
    "window": 18000000,
    "resetsAt": "2026-08-10T18:30:00Z"
  },
  "weeklyUsage": {
    "usage": 5000,
    "limit": 3000,
    "window": 604800000,
    "resetsAt": "2026-08-16T00:00:00Z"
  },
  "monthlyUsage": {
    "usage": 2000,
    "limit": 6000,
    "window": 2592000000,
    "resetsAt": "2026-09-01T00:00:00Z",
    "timeSubscribed": "2026-05-15T..."
  }
}
```

**字段含义（推断，需进一步确认）**：
- `usage` —— 已用美元数（滚动窗口 / 周 / 月）
- `limit` —— 限额美元数（按官方文档：5h = $12, 周 = $30, 月 = $60）
- `window` —— 窗口长度（毫秒）—— 5h=18,000,000、7d=604,800,000、30d=2,592,000,000
- `resetsAt` —— 窗口重置的 ISO 时间
- `useBalance` —— 是否启用 "Use balance" 兜底（开启后超额走 Zen 余额）

**注意事项（PR 作者自述）**：
1. 没有 Go 订阅的有效 key 会返回 **401**（而非 404），跟凭据错误无法区分。
2. 没有缓存头，也没有文档化轮询间隔。**必须客户端自带冷却**（≥ 60s，建议 5 分钟）以保护 opencode DB。

### 2.3 与 Z.ai API 的对比

| 维度 | Z.ai Coding Plan | OpenCode Go |
|---|---|---|
| 端点 | `https://api.z.ai/api/monitor/usage/quota/limit` | `https://opencode.ai/zen/go/v1/usage`（PR #16513，待合并） |
| 鉴权 | `Authorization: <raw-key>`（**不是 Bearer**！） | `Authorization: Bearer <key>` |
| 响应粒度 | `limits[]` 数组（type+unit 编码窗口） | 三个具名对象：`rollingUsage` / `weeklyUsage` / `monthlyUsage` |
| 已知窗口 | 5h + 周 + 月（按 type+unit 编码） | 5h + 周 + 月（具名）—— **完全相同** |
| 稳定性 | 稳定（多个客户端实现） | 草案状态（PR 未合并，无客户端） |
| 计划 ID | `zai-coding-plan` | `opencode-go` |
| 复选器 | `TOKENS_LIMIT` | 直接在字段名上 |

### 2.4 Pi 中的 provider 命名

Pi 的 `ctx.model.provider` 在配置 `opencode-go/<model-id>` 时**预期**是 `"opencode-go"`（与 Z.ai 的 `"zai"` 命名约定一致）。**但需要验证**：

- 打开 `~/.pi/agent/auth.json`，登录 Go 后确认 key 项是 `"opencode-go"` 还是 `"opencode"` 还是别的。
- 启动 pi 时用 `ctx.model?.provider` 打印一下。

> 如果命名不是 `opencode-go`，需要在 extension 内做归一化（用 `ctx.model.id` 包含 `opencode-go/` 前缀作为兜底判定）。

### 2.5 凭据存储位置

| 环境 | 路径 |
|---|---|
| Linux | `~/.local/share/opencode/auth.json` |
| macOS | `~/Library/Application Support/opencode/auth.json` |
| Windows | `%LOCALAPPDATA%\opencode\auth.json` |

但 **在 Pi 扩展里不要直接读这个文件**！用 `ctx.modelRegistry.getApiKeyForProvider("opencode-go")` 让 Pi 统一处理（sandbox / env / 文件三种来源都覆盖）。`pi-usage-lib` 的 `buildAuthHeaders()` 已经封装好这点。

---

## 3. 项目边界（做什么 / 不做什么 / 留给用户）

### 3.1 ✅ 必做（v0.1 范围）

1. **读取 opencode-go 凭据**
   - 用 `ctx.modelRegistry.getApiKeyForProvider("opencode-go")`（通过 `pi-usage-lib` 的 `buildAuthHeaders`）。
   - 没有 key 时静默清空 footer，不报错。

2. **请求 Go usage API**
   - 默认 `https://opencode.ai/zen/go/v1/usage`。
   - 端点 URL 做成可配置（settings 文件覆盖），以便 PR #16513 改路径时无需发新版本。

3. **渲染三个窗口到 footer**
   - 格式参考 Z.ai：`5h 23% (3h 7m) · wk 30% (6d 2h) · mo 12% (12d)`。
   - 颜色阈值（参考 Z.ai 实践）：> 80% warning、> 90% critical。
   - `setStatus("opencode-go-usage", "...")`，让 `pi-footer` / `pi-powerline-footer` 自动消费。
   - 时间剩余用 `pi-usage-lib/datetime` 的 `formatTimeRemainingFromEpochMs`。

4. **缓存与刷新**
   - 30 秒缓存（与 pi-usage-lib 默认一致），但建议**可配置为 5 分钟**（保护 opencode DB，呼应 PR #16513 作者的担忧）。
   - 事件：仅在 `model_select` 切换到 opencode-go provider 时 + 每个 `turn_end` 触发刷新。
   - 切换到非 opencode-go 模型时 `setStatus(key, undefined)` 清空。

5. **优雅降级**
   - 401/404/5xx 时显示 `<err:httpXXX>` 或清空（通过 `renderError`），不抛错。
   - 端点未发布时（404），README 引导用户去 PR #16513 催更。

6. **技术栈**
   - Bun + TypeScript（与 `pi-zai-usage` 一致）。
   - Biome lint/format。
   - 通过 `pi install npm:pi-ocgo-usage` 分发到 npm。
   - `package.json` 的 `"pi": { "extensions": ["./dist/index.js"] }`。
   - **直接依赖 `@alexanderfortin/pi-usage-lib`**，不重复造轮子。

### 3.2 ❌ 不做

1. **不写 opencode 插件版本**（OpenCode TUI 用户走 `/usage` 命令或 `opencode-usage-monitor`）。
2. **不写 OpenAI/Claude/Copilot/Z.ai 用量** —— 那是 `pi-zai-usage` / `pi-claude-usage` / OpenCode #9545 的活。
3. **不替换 pi 的 footer** —— 用 `setStatus` 与其他扩展（pi-footer、powerline-footer）和平共存。
4. **不做 token 计数 / 成本估算** —— `pi-footer` 已经覆盖。
5. **不做历史 / 趋势图表** —— 留给 `opencode-token-tracker`。
6. **不强行模拟 opencode 控制台**（progress bar、账户邮箱等）—— 焦点保持极简（百分比 + 倒计时）。
7. **不在官方 API 合并前自己实现逆向抓取 dashboard** —— 风险大、契约不稳定、易被反爬。**等官方 PR**。

### 3.3 🧩 留给用户（可配置 / 自行决定）

| 项 | 建议默认 | 暴露方式 |
|---|---|---|
| 启用与否 | 跟随 opencode-go 模型激活自动启用 | 自动 |
| API 端点 URL | `https://opencode.ai/zen/go/v1/usage` | settings 覆盖 |
| 缓存 TTL | 5 分钟（保护 opencode DB） | settings 覆盖 |
| 颜色阈值 | 80% warning / 90% critical | `~/.pi/agent/usage-lib.json`（pi-usage-lib 已有机制） |
| 显示哪几个窗口 | 全部（5h + wk + mo） | 渲染逻辑常量化 |
| 失败时行为 | 显示错误码（`renderError` 默认） | 可提供 `renderError` 配置项 |
| 模型筛选 | `provider === "opencode-go"` | 写死在 `isCurrentProvider` |
| 与 pi-footer 集成 | 自动消费 setStatus | 用户安装 pi-footer 即可 |

### 3.4 推荐文件结构

```
pi-ocgo-usage/
├── docs/
│   └── RESEARCH.md          ← 本文件
├── src/
│   ├── index.ts             ← 入口（createUsageExtension 调用）
│   ├── api.ts               ← getGoUsage() + 响应类型
│   └── render.ts            ← renderGoStatus() / renderError
├── tests/
│   ├── api.test.ts          ← 用 fixtures 验证响应解析
│   └── render.test.ts       ← 验证渲染输出
├── AGENTS.md                ← 给后续 contributor / agent 看
├── README.md
├── package.json             ← name: pi-ocgo-usage, type: module
├── tsconfig.json
├── tsconfig.test.json
├── biome.json
├── bunfig.toml
├── .gitignore
├── .releaserc.js            ← 自动化发版
└── LICENSE                  ← MIT
```

### 3.5 复用 pi-usage-lib 后的核心代码量预估

| 文件 | 行数估计 | 内容 |
|---|---|---|
| `src/index.ts` | 10–20 | `createUsageExtension({ providerPrefix, statusKey, label, fetchUsage, renderStatus, renderError })` |
| `src/api.ts` | 60–100 | `getGoUsage(modelRegistry)` + 响应类型 + 错误处理 |
| `src/render.ts` | 30–50 | `renderGoStatus(data, theme)` + 颜色阈值 |
| `tests/` | 100–200 | 单元测试 + fixtures |
| **合计** | **~250–400 行** | 极小项目，1–2 天可出 v0.1 |

### 3.6 风险与未知

| 风险 | 影响 | 缓解 |
|---|---|---|
| **PR #16513 尚未合并 + 生产环境无 usage 端点（实测确认）** | **v0.1 无法调用任何端点，核心功能不能完成** | 必须等 PR 合并；当前阶段可先完成所有非网络代码（渲染、provider 匹配、缓存、UI 集成）+ mock 测试 |
| PR #16513 路径最终不是 `/zen/go/v1/usage` | 调用失败 | 端点 URL 可配置；README 写明默认契约来源 |
| PR 长期不合并（已 5 个月） | 整个项目不可用 | README 显著提示；提供「等官方 API」 vs 「抢鲜体验」两档；监控 PR 状态；订阅 PR 通知 |
| Pi 中 provider 名字不是 `opencode-go` | provider 匹配失败 | 启动时打印 `ctx.model?.provider`，归一化判定 |
| 用户在 sandbox 里（key 是 `proxy-managed` 哨兵） | 鉴权失败 | 复用 `pi-usage-lib` 的 3-way 沙箱策略 |
| 用户在 print/RPC/JSON 模式下 | `ctx.hasUI === false` | 跳过 `setStatus` 调用（pi-usage-lib 已处理） |
| 官方 API 限流 / DB 压力 | 自家扩展被波及 | 默认 5 分钟缓存；不放在 turn_start 触发 |
| Pi 扩展加载顺序冲突（其他扩展也 `setStatus("opencode-go-usage", ...)`） | 互相覆盖 | 用 unique key `opencode-go-usage-v1` 或加 random suffix |

---

## 4. 下一步建议

### 4.1 现实情况（2026-08-10 实测后）

- **Go usage API 端点不存在于生产环境**（所有变体 404）。
- **PR #16513 合并状态：未合并**（5 个月停滞）。
- **项目不能进入 v0.1 实质开发**，否则会写出一堆在 endpoint 不存在时永远返回 404 的代码。

### 4.2 可选路径

#### 选项 A：等官方 API（推荐）

1. **继续做调研 + 设计**，不写可运行代码。
2. **Watch PR #16513 + Issue #16017**：合并/关闭后立即行动。
3. **现在能做的准备**：
   - 写好 `docs/SPEC.md`（端点契约草案 + 渲染设计 + provider 匹配策略）。
   - 准备好 `src/api.ts` 的接口骨架（用 mock 数据先跑通渲染）。
   - 在 Pi 里跑一次临时扩展，验证 `ctx.model?.provider` 在配置 `opencode-go/<model>` 时是 `"opencode-go"`。
4. **优点**：零维护成本、不写易过期代码。
5. **缺点**：阻塞。

#### 选项 B：逆向 opencode dashboard（用户反馈的可行路径）

用户分享的关键信息：
- Dashboard URL：`https://opencode.ai/workspace/<workspace-id>/go`
- 鉴权：Cookie `auth=<Iron-session>` + `oc_locale=...`
- 后端：SolidStart `_server` RPC 端点

**逆向步骤**（已完成）：

1. ✅ 用户重新登录 opencode.ai（让泄露的 cookie 失效）。
2. ✅ 拉 console JS bundle 分析端点结构（`/api/*` + oRPC + `_server?id=...`）。
3. ✅ 逆向 opencode 仓库源码（[sst/opencode @ dev/packages/console](https://github.com/sst/opencode/tree/dev/packages/console)），找到：
   - 端点 URL：`GET /_server?id=lite.subscription.get&workspaceID=<wrk>`
   - Procedure 名：`lite.subscription.get`
   - 响应 schema：`{ mine, useBalance, region, rollingUsage, weeklyUsage, monthlyUsage }`
   - 完整计算函数：`Subscription.analyzeRollingUsage/Weekly/Monthly` 源码
4. ✅ API key 调 `_server?id=lite.subscription.get` → **HTTP 500**（端点存在，鉴权失败）
5. ✅ API key 调 `/workspace/<wrk>/go` → 302 → 登录页（证实 cookie-only）

**逆向结果**：

- ❌ **API key 不能调 `_server` 端点**（B1 不可行）。
- ❌ **必须用 cookie**（B2 必须实现）。
- ✅ **响应 schema 和计算逻辑已 100% 掌握**。
- ✅ **PR #16513 合并后可直接换端点，无须改解析**。

**子路径 B1：API key 可复用 _server 调用** —— ❌ 不可行（已验证）
- 实测：API key 调 `_server?id=lite.subscription.get` 返回 500，内部 `withActor()` 中途报错
- 原因：`_server` 端点中间件 `withActor()` 只从 Iron Session cookie 读 actor，不接受 Bearer token

**子路径 B2：必须用 cookie** —— ✅ 可行，但有警告
- 实现：用户在 `~/.pi/agent/pi-ocgo-usage.json` 配置 cookie（或设置环境变量 `OPENCODE_GO_COOKIE`）
- 扩展从配置读 cookie 调 `_server?id=lite.subscription.get&workspaceID=<wrk>`
- 响应解析用源码逆推出的 schema
- **优点**：可走通；今天就能实现
- **缺点**：
  - 用户每次重新登录后要更新 cookie（cookie 过期 = 功能失效）
  - **Iron Session cookie 默认有效期 1 年**（看到 `Expires=Tue, 10 Aug 2027` 响应头），所以不是月级别频繁轮换
  - **不应默认鼓励**，会让人误以为「pi 扩展和浏览器共享会话」是安全的
  - cookie 本质上是用户级完整会话凭据 —— 应受同等保护
  - 不适合自动公开发布

**子路径 B3：opencode CLI 本地凭据** —— ❌ 不可行（已验证）
- 实测：用户 `~/.local/share/opencode/auth.json` 中 `opencode-go` 项结构：
  ```json
  { "type": "api", "key": "<REDACTED>" }
  ```
- 是简单 API key，不是 OAuth token
- **不能**调 `_server` 端点（同 B1）

**ToS / 道德风险**：
- opencode.ai ToS 通常禁止未授权的自动化访问和绕过鉴权机制。
- `_server` 端点严格只接受会话 cookie；自动化调用 = 绕过鉴权机制。
- **如果公开发布这个扩展，要求用户填 cookie = 实质上鼓励用户分享完整会话**。
- **建议**：B2 路径**仅在个人使用 / opt-in 模式**下实现，不应作为默认 UX 包装成「pi-ocgo-usage 一键安装」。

**实现细节**（如果走 B2）：

```typescript
// src/config.ts —— 用户配置 cookie
interface PiGoUsageConfig {
  /** opencode workspace ID (wrk_xxx) */
  workspaceID: string
  /** Cookie value: auth=Fe26.2*...; oc_locale=zh */
  cookie: string
  /** Optional: override endpoint base (default: https://opencode.ai) */
  baseUrl?: string
  /** Optional: cache TTL in seconds (default: 300, min: 60) */
  cacheTTL?: number
}
```

读取路径优先级：
1. `OPENCODE_GO_COOKIE` 环境变量
2. `~/.pi/agent/pi-ocgo-usage.json` 文件
3. pi 启动时 `ctx.ui.input()` 询问（首次）

实际 fetch：

```typescript
const url = `${baseUrl}/_server?id=lite.subscription.get&workspaceID=${workspaceID}`
const res = await fetch(url, {
  headers: { Cookie: cookie, Accept: "application/json" },
})
// 响应:
// {
//   mine: boolean,
//   useBalance: boolean,
//   region: string,
//   rollingUsage:  { status: "ok"|"rate-limited", resetInSec: number, usagePercent: number },
//   weeklyUsage:   { status: "ok"|"rate-limited", resetInSec: number, usagePercent: number },
//   monthlyUsage:  { status: "ok"|"rate-limited", resetInSec: number, usagePercent: number },
// }
```

**最终建议**：

1. **首选**：等 PR #16513 合并（干净方案，可公开发布）
2. **次选**：B2 走 cookie 路径，但仅作为 **个人工具 / opt-in 实验**，不在 npm 公开发布
3. **不再追**：B1（API key 调 _server）已证不可能
4. **不再追**：B3（OAuth token）已证 auth.json 是 api key 不是 oauth

**决策树**：

```
用户在 opencode.ai/auth 撤销泄露的 key + cookie（立即）
        |
        v
PR #16513 合并了吗？  ──── 是 ───> 走 A 路径（干净）✅
        |
       否
        v
你愿意仅个人用 + 接受手动同步 cookie？  ──── 是 ───> 走 B2（opt-in）
        |
       否
        v
搁置项目 / 转向其他 pi 扩展
```

#### 选项 C：本地代理 / 抓包脚本

1. 用户在本地跑一个 `mitmproxy` / `charles` / 自定义脚本，拦截浏览器 → opencode.ai 的请求。
2. 提取 Go usage 的内部 API 端点和请求头。
3. 把抓到的端点移植到 extension。
4. 优缺点同 B，但更可控。

#### 选项 D：搁置项目

如果 PR 一直不合并，**这个项目在 2026 年内可能没有可发布版本**。考虑：
- 转向其他 pi 扩展（写一个「等你 install 后能直接用」的项目）。
- 写一个 Z.ai / Claude / OpenAI 用量扩展（这些 provider 有可用的 API）。

### 4.3 建议执行顺序

1. 用户立即去 [opencode.ai/auth](https://opencode.ai/auth) **撤销并重置这个 API key**（已暴露在聊天记录中）。
2. 决定走 A / B / C / D。
3. 如果选 A：本周完成 `docs/SPEC.md`、Pi provider 名字验证。
4. 如果选 B/C：用户抓包后给 agent 端点样板，立即开发。
5. 跟踪 PR #16513：设为 GitHub Watch，订阅邮件通知。

---

## 5. 引用清单

- Pi 扩展文档：`/home/shawn/.local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- Pi 扩展 examples：`/home/shawn/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/`
  - `status-line.ts`（footer setStatus 范式）
  - `model-status.ts`（model_select 事件）
- [opencode.ai/docs/go](https://opencode.ai/docs/go/) — 官方 Go 计划说明
- [anomalyco/opencode#16017](https://github.com/anomalyco/opencode/issues/16017) — Go usage API 需求 issue
- [anomalyco/opencode#18648](https://github.com/anomalyco/opencode/issues/18648) — 用户在 waybar 问如何获取 Go 用量
- [anomalyco/opencode#10448](https://github.com/anomalyco/opencode/issues/10448) — Zen balance API 需求 issue
- [anomalyco/opencode#9545](https://github.com/anomalyco/opencode/pull/9545) — 统一 `/usage` 命令（已合并，**不含 Go**）
- [anomalyco/opencode#16513](https://github.com/anomalyco/opencode/pull/16513) — **`/zen/go/v1/usage` 端点 PR（**OPEN**）** —— 本项目核心依赖
- [shaftoe/pi-zai-usage](https://github.com/shaftoe/pi-zai-usage) — 同类参考实现
- [shaftoe/pi-usage-lib](https://github.com/shaftoe/pi-usage-lib) — 共享库
- [toninho09/opencode-usage](https://github.com/toninho09/opencode-usage) — OpenCode 端 Z.ai 集成参考
- [Mark1708/opencode-usage-monitor](https://github.com/Mark1708/opencode-usage-monitor) — OpenCode sidebar 端 Z.AI/DeepSeek/OpenAI 集成
- [opgginc/opencode-bar](https://github.com/opgginc/opencode-bar) — 菜单栏 widget 案例

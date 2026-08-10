# pi-ocgo-usage — SPEC

> 目标：在 [pi coding agent](https://pi.dev/) 的 footer 展示 [OpenCode Go](https://opencode.ai/docs/go/) 订阅的账户使用情况。
> 本文档是 v0.1 的实现规范，与 [RESEARCH.md](./RESEARCH.md) 调研结论一致。

## 1. 项目信息

| 字段 | 值 |
|---|---|
| 名称 | `pi-ocgo-usage`（"OC Go" = OpenCode Go） |
| npm 包 | `pi-ocgo-usage`（无 scope，用户后续可改名加 scope） |
| 类型 | `module` (ESM) |
| 运行时 | [Bun](https://bun.sh) ≥ 1.1 |
| 入口 | `dist/index.js`（TypeScript 编译后） |
| pi 扩展入口 | `package.json` 的 `pi.extensions` 字段指向 `dist/index.js` |
| License | MIT |
| 主对标 | [pi-zai-usage](https://github.com/shaftoe/pi-zai-usage) |

## 2. 双路径策略

项目设计支持两条调用路径，**主路径 + 未来 fallback**：

| 路径 | 鉴权 | 端点 | 状态 | 何时启用 |
|---|---|---|---|---|
| **A. 主路径 (B2 cookie)** | Cookie `auth=<Iron-session>` | `GET /workspace/<wrk>/go`（SSR HTML 抓取） | ✅ 立即可用 | 默认 |
| **B. 未来 fallback (PR #16513)** | Bearer `<opencode-go-api-key>` | `GET /zen/go/v1/usage` | ⏳ 等 PR 合并 | PR 合并后自动启用 |

**路径选择逻辑**（`fetchUsage` 内）：
1. 读 `OPENCODE_GO_MODE` 环境变量：`"cookie"` / `"apikey"` / `"auto"`（默认 `auto`）
2. `auto` 模式：优先用 cookie（如果配置了）；cookie 失败（401/500/网络）回退到 apikey
3. `cookie` 模式：只用 cookie，失败显示错误
4. `apikey` 模式：只用 apikey（PR 合并前永远失败）

> **重要：v0.1 只实现 A 路径 + `auto` 模式的回退探测**。B 路径在 PR #16513 合并后再开启（A 路径同时保留为兜底，因为 cookie 是用户级会话，相对长期稳定）。

## 3. 配置

### 3.1 优先级

```
环境变量 > 配置文件 > 内置默认
```

### 3.2 环境变量

| 变量 | 必填？ | 默认 | 说明 |
|---|---|---|---|
| `OPENCODE_GO_COOKIE` | A 路径必填 | — | 完整 `Cookie:` 头值，如 `auth=Fe26.2*...; oc_locale=zh` |
| `OPENCODE_GO_WORKSPACE_ID` | A 路径必填 | — | workspace ID，如 `wrk_01KY13MZ9NF9G6MDYPGR225ZFC` |
| `OPENCODE_GO_BASE_URL` | 否 | `https://opencode.ai` | 端点 base |
| `OPENCODE_GO_CACHE_TTL` | 否 | `300` (5 分钟) | 缓存秒数，范围 [60, 3600] |
| `OPENCODE_GO_MODE` | 否 | `auto` | `auto` / `cookie` / `apikey` |
| `OPENCODE_GO_TIMEOUT_MS` | 否 | `10000` | HTTP 超时 |

### 3.3 配置文件（`~/.pi/agent/pi-ocgo-usage.json`）

```jsonc
{
  // 必填：A 路径
  "cookie": "auth=Fe26.2*...; oc_locale=zh",
  "workspaceID": "wrk_01KY13MZ9NF9G6MDYPGR225ZFC",

  // 可选
  "baseUrl": "https://opencode.ai",
  "cacheTTL": 300,
  "mode": "auto",
  "timeoutMs": 10000
}
```

### 3.4 缺失配置行为

- A 路径缺失 cookie/workspaceID：在 `session_start` 弹 `ctx.ui.input()` 让用户粘贴 cookie、输入 workspace ID；不阻塞 pi 启动
- A 路径 HTTP 错误：footer 显示 `<err:httpXXX>` 或 `<err:fetch>`（沿用 `pi-usage-lib` 模式）
- 任何路径都不可用：footer 不显示

## 4. Provider 探测

**触发条件**（任何一个满足就启用 footer）：
- `ctx.model?.provider === "opencode-go"`（主要）
- `ctx.model?.id?.startsWith("opencode-go/")`（兜底，因 Pi 内部 provider 命名可能不同）

**禁用条件**：
- 模型非 opencode-go provider
- `session_shutdown`

## 5. 响应 schema 与 adapter

### 5.1 内部归一化类型

```ts
type UsageWindowKind = "rolling" | "weekly" | "monthly"
type UsageStatus = "ok" | "rate-limited"

interface UsageWindow {
  kind: UsageWindowKind
  /** 0-100 整数百分比 */
  percent: number
  /** 距重置秒数 */
  resetInSec: number
  status: UsageStatus
}

interface NormalizedUsage {
  useBalance: boolean
  /** 三个窗口都可能缺失（账号无 Go 订阅 / 试用期外） */
  rolling?: UsageWindow
  weekly?: UsageWindow
  monthly?: UsageWindow
}
```

### 5.2 路径 A 响应（cookie / `/workspace/<wrk>/go` SSR HTML）

路径 A 不返回 JSON——它是 SolidStart 渲染的 HTML 页面，每个用量窗口渲染成一个
`<div data-slot="usage-item">…</div>` 块（块内可能有嵌套 div，解析时按下一个
usage-item 起点切块）：

```html
<div data-slot="usage-item">
  <span data-slot="usage-label">Rolling Usage</span>
  <span data-slot="usage-value"><!--$-->23<!--/-->%</span>
  <span data-slot="reset-time"><!--$-->Resets in<!--/-->2 hours 29 minutes<!--/--></span>
</div>
```

Adapter 规则（`api.ts` `fromSSRHTML` + `parseDurationToSec`）：
- `label` ← `data-slot="usage-label"` 的文本（`Rolling Usage` / `Weekly Usage` / `Monthly Usage`）
- `percent` ← `data-slot="usage-value"` 中的整数百分比
- `resetsIn` ← `data-slot="reset-time"` 中的英文时长短语（如 `2 hours 29 minutes`），由 `parseDurationToSec` 粗估为秒
- `useBalance` ← 页面文本是否包含 `useBalance`
- 页面无 usage-item 块（如未登录被 302 到登录页）→ 空结果，不报错

### 5.3 路径 B 响应（PR #16513 草案 / `/zen/go/v1/usage`）

```jsonc
{
  "useBalance": false,
  "rollingUsage": { "usage": 1234, "limit": 1200, "window": 18000000, "resetsAt": "2026-08-10T18:30:00.000Z" },
  "weeklyUsage":  { "usage": 5000, "limit": 3000, "window": 604800000, "resetsAt": "2026-08-16T00:00:00.000Z" },
  "monthlyUsage": { "usage": 2000, "limit": 6000, "window": 2592000000, "resetsAt": "2026-09-01T00:00:00.000Z", "timeSubscribed": "..." }
}
```

Adapter 规则（`api.ts` `fromApikeyResponse`）：
- `useBalance` ← `data.useBalance`
- 对每个 window：
  - `percent` ← `Math.floor(Math.min(100, (usage / limit) * 100))`（**注意单位**：`usage` / `limit` 是 micro-cents 内部单位，但比值是无量纲的，所以 OK）
  - `resetInSec` ← `Math.max(0, Math.floor((Date.parse(resetsAt) - Date.now()) / 1000))`
  - `status` ← `usage >= limit ? "rate-limited" : "ok"`
  - `kind` ← 固定（"rolling" / "weekly" / "monthly"）

### 5.4 解析容错

- 任一 window 缺失 → 该窗口不显示（不报错）
- 字段类型不对 → 该字段 fallback（percent=0, resetInSec=0, status="ok"）
- 整个响应解析失败 → 抛 `UsageError("badjson" | "apishape")`

## 6. 渲染

**目标输出**（3 个窗口全部正常时）：

```
OC.go: 5h 23% (3h 25m) · wk 30% (4d 6h) · mo 12% (12d 4h)
```

**省略规则**：
- 任一窗口缺失 → 省略该段（`5h 23% (3h 25m) · mo 12% (12d 4h)`）
- 仅一个窗口 → 简化为 `OC.go: 5h 23% (3h 25m)`，不加 `·`
- `updatedAt` 存在 → 加后缀 `· update HH:MM (UTC±H)`（最近一次成功拉取时间，本地时区；`useBalance` 仍解析但不再渲染）

**时间格式**（`formatDuration`）：
- `< 60s` → `45s`
- `< 60m` → `23m`
- `< 24h` → `5h 23m`
- 否则 → `4d 6h`
- 来源：参考 `pi-usage-lib/datetime.formatTimeRemainingFromEpochMs` 的更紧凑实现

**颜色阈值**（沿用 `pi-usage-lib` 默认）：
- `< 80%` → `theme.fg("muted", "...")`
- `80% – 90%` → `theme.fg("warning", "...")`
- `>= 90%` → `theme.fg("error", "...")`
- `rate-limited` → 强制 `error`

**百分比格式**：
- 整数（`Math.floor`）→ `"23%"`
- 一位小数（保留兼容）→ `"23.4%"`（仅当 `pi-usage-lib` 默认使用，v0.1 用整数足够）

## 7. 缓存与刷新

**TTL**：默认 300 秒（5 分钟），可配置 60–3600。

**刷新触发**：
- `session_start` —— 启动时（如果当前 provider 匹配）
- `model_select` —— 切换到 opencode-go provider 时；切走时清空 footer
- `turn_end` —— 每个 turn 结束（如果当前 provider 匹配）
- `session_shutdown` —— 清空 footer

**主动刷新命令**（v0.2+，可选）：
- `/ocgo-usage refresh` —— 绕过 cache 强制刷新

## 8. 错误显示

沿用 `pi-usage-lib` 默认 `renderError`：

```
OC.go: <err:http401>   ← cookie 过期 / 鉴权失败
OC.go: <err:http500>   ← 服务端错误
OC.go: <err:fetch>     ← 网络错误
OC.go: <err:badjson>   ← 响应解析失败
OC.go: <err:noconfig>  ← cookie/workspaceID 未配置（自定义）
```

可在 `~/.pi/agent/pi-ocgo-usage.json` 里通过 `"renderError": "hide"` 隐藏错误（footer 完全不显示），默认 `"show"`。

## 9. 文件结构

> 仓库目录、npm 包名、GitHub 仓库名三者统一为 `pi-ocgo-usage`。

```
pi-ocgo-usage/
├── docs/
│   ├── RESEARCH.md           ← 调研报告（已完成）
│   └── SPEC.md               ← 本文件
├── src/
│   ├── index.ts              ← 入口（注册事件 + 调用 createUsageExtension）
│   ├── config.ts             ← 配置加载（env + file）
│   ├── api.ts                ← fetch + 响应解析 + adapter
│   ├── render.ts             ← 渲染 + 颜色 + 时间格式
│   ├── provider.ts           ← provider 探测
│   └── types.ts              ← 类型定义
├── tests/
│   ├── config.test.ts
│   ├── api.test.ts
│   ├── render.test.ts
│   ├── provider.test.ts
│   └── fixtures/
│       ├── cookie-usage-ok.json
│       ├── apikey-usage-ok.json
│       └── apikey-usage-ratelimited.json
├── AGENTS.md                 ← 给后续 contributor / agent 看
├── README.md                 ← 用户文档
├── CHANGELOG.md              ← 自动生成（semantic-release）
├── LICENSE                   ← MIT
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── biome.json
├── bunfig.toml
├── .gitignore
├── .releaserc.js
└── .github/
    └── workflows/
        ├── pi.yml            ← pi AI agent 集成（可选）
        ├── test-and-coverage.yml
        └── release.yml
```

## 10. 关键实现细节

### 10.1 fetch 包装

```ts
async function safeFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new UsageError("timeout", "timeout")
    throw new UsageError(String(e), "fetch")
  } finally {
    clearTimeout(timer)
  }
}
```

### 10.2 双路径选择

```ts
async function fetchUsage(registry: ModelRegistry): Promise<NormalizedUsage> {
  const cfg = loadConfig()
  if (!cfg) throw new UsageError("Missing config (cookie or workspaceID)", "noconfig")

  const mode = cfg.mode === "auto" ? "cookie" : cfg.mode  // v0.1 简化
  if (mode === "cookie" || mode === "auto") {
    if (cfg.cookie && cfg.workspaceID) {
      try {
        return await fetchViaCookie(cfg)
      } catch (e) {
        if (cfg.mode === "cookie") throw e  // 强制 cookie 模式不降级
        if (mode === "auto") {
          // 尝试 apikey 路径（PR 合并后）
          const apikey = await safeGetApikey(registry)
          if (apikey) return await fetchViaApikey(cfg, apikey)
        }
        throw e  // 都没法，回传 cookie 错误
      }
    }
  }
  if (mode === "apikey") {
    const apikey = await safeGetApikey(registry)
    if (!apikey) throw new UsageError("No API key", "noconfig")
    return await fetchViaApikey(cfg, apikey)
  }
  throw new UsageError("No usable config", "noconfig")
}
```

### 10.3 库依赖

**直接依赖**：
- `@alexanderfortin/pi-usage-lib`（v0.2.x）—— 复用 `createUsageExtension` 工厂 + 缓存 + 事件 + 颜色阈值
- `temporal-polyfill`（间接通过 pi-usage-lib）

**不依赖**（自写以保持简单）：
- HTTP fetch 包装（cookie 鉴权 + 超时控制 + 错误码）
- 时间格式化（`pi-usage-lib/datetime` 的 format 太啰嗦，我们用更紧凑的 `5h 23m`）
- 配置加载（`node:fs` + `node:os` + JSON.parse）

### 10.4 首次配置引导

在 `session_start` 中：
1. 检查配置是否完整
2. 不完整则通过 `ctx.ui.input("OpenCode Go cookie:", "auth=Fe26.2*...")` 询问
3. `ctx.ui.input("Workspace ID:", "wrk_...")` 询问
4. 写入 `~/.pi/agent/pi-ocgo-usage.json`（chmod 600）
5. **不持久化**到环境变量（环境变量由用户自己 export）
6. **不持久化**到 session 状态（cookie 不应进入 LLM context）

## 11. 安全考虑

- **cookie 是完整用户会话** —— README 顶部红色警示「这是用户级完整会话凭据，泄露等同于账户失窃」
- 配置文件 `chmod 600`
- 不打印 cookie 任何字段到 log / notify
- 不通过 `pi.events` emit 含 cookie 的 payload
- 不通过 `pi.appendEntry` 持久化 cookie 到 session

## 12. 版本计划

| 版本 | 范围 | 发布条件 |
|---|---|---|
| **v0.1.0** | A 路径（cookie）+ 完整渲染 + 缓存 + 配置 | 内部测试通过 |
| v0.1.x | 修 bug + 用户反馈 | 持续 |
| v0.2.0 | B 路径（apikey fallback）自动启用 | PR #16513 合并 + 实测通过 |
| v0.3.0 | 自定义 `renderStatus` 钩子 | 社区需求 |
| v1.0.0 | 1+ 个用户稳定使用 1 个月 | 时机 |

## 13. 参考实现

- 项目结构 & 工具链：[pi-zai-usage](https://github.com/shaftoe/pi-zai-usage)
- 共享库：[pi-usage-lib](https://github.com/shaftoe/pi-usage-lib)（`createUsageExtension`）
- Provider 范式：[examples/extensions/model-status.ts](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/model-status.ts)
- 状态栏范式：[examples/extensions/status-line.ts](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/status-line.ts)
- 渲染参考（Z.ai 配色）：[pi-zai-usage/src/index.ts](https://github.com/shaftoe/pi-zai-usage/blob/main/src/index.ts)
- 端点逆推：[anomalyco/opencode @ dev/packages/console/app/src/routes/workspace/[id]/go/lite-section.tsx](https://github.com/sst/opencode/blob/dev/packages/console/app/src/routes/workspace/%5Bid%5D/go/lite-section.tsx)
- 计算函数源码：[anomalyco/opencode @ dev/packages/console/core/src/subscription.ts](https://github.com/sst/opencode/blob/dev/packages/console/core/src/subscription.ts)

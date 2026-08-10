# pi-ocgo-usage

[![npm](https://img.shields.io/npm/v/pi-ocgo-usage)](https://www.npmjs.com/package/pi-ocgo-usage)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A [Pi coding agent](https://pi.dev/) extension that displays [OpenCode Go](https://opencode.ai/docs/go/) subscription usage in the footer when using an `opencode-go/*` model.

> **⚠️ This extension requires an OpenCode Go session cookie to function.**
> The cookie is a **full user session** (not an API key) and grants access to your entire OpenCode account.
> Treat it with the same care as your password. See [Configuration](#configuration) below for how to obtain and store it.

## Features

- **Auto Footer Display** — Automatically shows usage in the footer when using any `opencode-go/*` model
- **Three Windows** — Rolling (5h), weekly, and monthly usage percentages with reset countdowns
- **Color Thresholds** — `muted` / `warning` (≥80%) / `error` (≥90% or rate-limited)
- **Smart Caching** — 5-minute cache TTL (configurable 60–3600s) to respect opencode.ai backend load
- **Graceful Degradation** — On HTTP error, footer shows `<err:code>`; on missing config, footer is silently empty
- **Future-proof** — Built-in support for the upcoming official API ([PR #16513](https://github.com/anomalyco/opencode/pull/16513)) as a fallback

## Install

### From GitHub (recommended for testing)

```bash
pi install https://github.com/v587d/pi-ocgo-usage.git
```

This clones the repo (which ships a pre-built `dist/`) and registers the extension in your `~/.pi/agent/settings.json`.

### From npm (after first release)

```bash
pi install npm:pi-ocgo-usage
```

### From a local checkout (development)

```bash
git clone https://github.com/v587d/pi-ocgo-usage.git
cd pi-ocgo-usage
bun install
bun run build
pi install ./
```

> Note: `pi install` uses `--ignore-scripts`, so `prepare` and `postinstall` hooks won't run. The repo ships a pre-built `dist/` for GitHub installs; for local development, run `bun run build` after install.

## Configuration

### Required: provide your OpenCode Go session cookie + workspace ID

1. **Open `https://opencode.ai/workspace/<your-workspace-id>/go` in a browser**
   (sign in if prompted). The URL is your workspace ID — copy the part starting with `wrk_`.

2. **Open DevTools → Application → Cookies → `https://opencode.ai`**
   Copy the **full value** of the `auth` cookie. It looks like `Fe26.2*<base64>*<sig>*<exp>*<hmac>`.

3. **Set environment variables** (preferred for personal use):

   ```bash
   export OPENCODE_GO_COOKIE="auth=Fe26.2*...; oc_locale=zh"
   export OPENCODE_GO_WORKSPACE_ID="wrk_01XXXXXXXXXXXXXXXXXXXXXXXX"
   ```

   Or write to `~/.pi/agent/pi-ocgo-usage.json`:

   ```jsonc
   {
     "cookie": "auth=Fe26.2*...; oc_locale=zh",
     "workspaceID": "wrk_01XXXXXXXXXXXXXXXXXXXXXXXX"
   }
   ```

   ```bash
   chmod 600 ~/.pi/agent/pi-ocgo-usage.json
   ```

### Optional overrides

| Env var | Default | Description |
|---|---|---|
| `OPENCODE_GO_BASE_URL` | `https://opencode.ai` | API base URL |
| `OPENCODE_GO_CACHE_TTL` | `300` | Cache seconds, 60–3600 |
| `OPENCODE_GO_MODE` | `auto` | `auto` / `cookie` / `apikey` |
| `OPENCODE_GO_TIMEOUT_MS` | `10000` | HTTP timeout |

> ⚠️ **Cookie expiration:** the `auth` cookie is signed by Cloudflare Iron Session and is valid for **1 year** from issue. When it expires, the extension shows `<err:http500>` (server returns 500 when no actor is found). Re-login to opencode.ai and update the cookie.

## Usage

When using any `opencode-go/*` model, the footer shows:

```
OC.go: 5h 23% (3h 25m) · wk 30% (4d 6h) · mo 12% (12d 4h)
```

- Each window: `<label> <percent>% (<time remaining>)`
- Color: muted → warning (≥80%) → error (≥90% or rate-limited)
- If `useBalance` is enabled: appended as `· useBalance`
- If any window is missing (e.g., new account): that segment is omitted

Footer is **cleared** when switching to a non-OpenCode-Go model or on session shutdown.

## How It Works

The extension reverse-engineers the opencode.ai console's `_server` SolidStart RPC endpoint, which is what the dashboard itself uses to display Go usage. The endpoint:

```
GET /_server?id=lite.subscription.get&workspaceID=<wrk>
Cookie: auth=Fe26.2*...; oc_locale=zh
```

returns:

```json
{
  "mine": true,
  "useBalance": false,
  "region": "us",
  "rollingUsage":  { "status": "ok", "resetInSec": 12345,    "usagePercent": 23 },
  "weeklyUsage":   { "status": "ok", "resetInSec": 678901,   "usagePercent": 30 },
  "monthlyUsage":  { "status": "ok", "resetInSec": 1111111,  "usagePercent": 12 }
}
```

This schema is the **same** as the official `GET /zen/go/v1/usage` endpoint proposed in [anomalyco/opencode#16513](https://github.com/anomalyco/opencode/pull/16513). When that PR ships, the extension will automatically fall back to it (Bearer auth via `ctx.modelRegistry.getApiKeyForProvider("opencode-go")`), so no client-side changes are required.

See [docs/RESEARCH.md](./docs/RESEARCH.md) for full reverse-engineering details and [docs/SPEC.md](./docs/SPEC.md) for the implementation contract.

## Security

- **The `auth` cookie is a full OpenCode user session.** Anyone with it can access every workspace, subscription, and billing detail in your account. Treat it like a password:
  - Never share it in chat / issues / screenshots
  - Never commit `~/.pi/agent/pi-ocgo-usage.json` to git
  - The extension sets `chmod 600` on the config file automatically
  - If you accidentally leak the cookie, sign out of opencode.ai immediately (this invalidates it)

- The extension **never**:
  - Logs the cookie value
  - Persists it to session entries
  - Emits it via `pi.events`
  - Includes it in error messages shown to the user

## Development

```bash
bun install
bun run dev        # watch mode
bun run test       # run unit tests
bun run check      # typecheck + lint
bun run build      # tsc → dist/
```

## License

MIT — see [LICENSE](./LICENSE).

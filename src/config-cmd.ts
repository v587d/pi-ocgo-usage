/**
 * Config command helpers for /oc-go-config
 *
 * Owns the user-facing /oc-go-config slash command. Subcommands:
 *   (none)    show current status (cookie/workspace/mode/ttl)
 *   set       prompt for cookie + workspace_id, persist with chmod 600
 *   clear     confirm + remove config file
 *   test      one-shot fetch via the active path; reports success/error
 *
 * The cookie is never echoed in any message — only its length or a
 * fingerprint is shown.
 */

import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fetchUsage, UsageError } from "./api"
import { configFilePath, loadConfig } from "./config"
// normalizeCookie is re-exported by index.ts for testability; we use loadConfig
// here to apply normalization transparently.
import { renderUsage } from "./render"

const USAGE_HELP = [
  "`/oc-go-config` — configure OpenCode Go usage extension",
  "",
  "Subcommands:",
  "  (none)  Show current configuration (masked)",
  "  set     Prompt for cookie + workspace_id, persist with chmod 600",
  "  clear   Delete the config file (requires confirmation)",
  "  test    One-shot fetch using the active config; reports success/error",
  "",
  "Env vars (override file):",
  "  OPENCODE_GO_COOKIE         full Cookie header value (auth=...; oc_locale=...)",
  "  OPENCODE_GO_WORKSPACE_ID   workspace id (wrk_...)",
  "  OPENCODE_GO_BASE_URL       default https://opencode.ai",
  "  OPENCODE_GO_CACHE_TTL      60-3600, default 300",
  "  OPENCODE_GO_MODE           auto | cookie | apikey",
  "  OPENCODE_GO_TIMEOUT_MS     default 10000",
].join("\n")

/**
 * Minimal command-context shape. Matches the slice of
 * `ExtensionCommandContext` that `runOcgoConfig` actually uses, so tests
 * can supply a partial mock without casting to the full context.
 */
export interface OcgoCommandContext {
  ui: {
    input: (title: string, prefilled: string) => Promise<string | undefined>
    confirm: (title: string, message: string) => Promise<boolean>
    notify: (msg: string, level: "info" | "warning" | "error") => void
    theme: unknown
  }
  modelRegistry: { getApiKeyForProvider: (id: string) => Promise<string | undefined> }
}

interface CommandResult {
  cancel?: boolean
  clearStatus?: boolean
}

function fingerprint(value: string | undefined): string {
  if (!value) return "(unset)"
  if (value.length <= 12) return `${value.length} chars`
  return `${value.length} chars, starts "${value.slice(0, 6)}…"`
}

function summarize(): string {
  const cfg = loadConfig()
  const file = configFilePath()
  const exists = existsSync(file)
  return [
    `config file: ${file} ${exists ? "" : "(not created)"}`,
    `cookie:        ${fingerprint(cfg.cookie)}`,
    `workspace_id:  ${cfg.workspaceID ?? "(unset)"}`,
    `base_url:      ${cfg.baseUrl}`,
    `cache_ttl:     ${cfg.cacheTTL}s`,
    `mode:          ${cfg.mode}`,
    `timeout_ms:    ${cfg.timeoutMs}`,
  ].join("\n")
}

function writeConfig(cookie: string, workspaceID: string): void {
  const path = configFilePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ cookie, workspaceID }, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  })
  // Belt-and-suspenders: chmod even when umask interferes
  chmodSync(path, 0o600)
}

function clearConfig(): boolean {
  const path = configFilePath()
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

/**
 * Entry point registered with `pi.registerCommand("oc-go-config", ...)`.
 * `args` is the subcommand (whitespace-trimmed); ctx is the command context.
 */
export async function runOcgoConfig(args: string, ctx: OcgoCommandContext): Promise<CommandResult> {
  const sub = args.trim().split(/\s+/)[0]?.toLowerCase() ?? ""

  // Help / status (default)
  if (sub === "" || sub === "status" || sub === "help") {
    ctx.ui.notify(summarize(), "info")
    ctx.ui.notify(USAGE_HELP, "info")
    return {}
  }

  if (sub === "set") {
    const workspaceID = await ctx.ui.input(
      "OpenCode Go workspace ID (wrk_…)",
      loadConfig().workspaceID ?? "",
    )
    if (!workspaceID) {
      ctx.ui.notify("Cancelled: workspace ID is required.", "warning")
      return {}
    }
    const cookie = await ctx.ui.input(
      "OpenCode Go session cookie (Cookie header value, e.g. auth=Fe26.2*…; oc_locale=zh)",
      loadConfig().cookie ?? "",
    )
    if (!cookie) {
      ctx.ui.notify("Cancelled: cookie is required.", "warning")
      return {}
    }
    const confirmed = await ctx.ui.confirm(
      "Persist cookie to disk?",
      `The cookie is a full OpenCode user session (1-year TTL). It will be written to ${configFilePath()} with mode 0600. Continue?`,
    )
    if (!confirmed) {
      ctx.ui.notify("Cancelled; not writing config.", "info")
      return {}
    }
    try {
      // Re-load to apply normalization (auto-prefix "auth=" if missing)
      const normalized = loadConfig().cookie ?? cookie
      writeConfig(normalized, workspaceID)
      ctx.ui.notify(
        `Saved: ${configFilePath()}\n  cookie: ${fingerprint(normalized)} (${normalized.startsWith("auth=") ? "with auth= prefix" : "normalized"})`,
        "info",
      )
    } catch (e) {
      ctx.ui.notify(`Failed to save: ${e instanceof Error ? e.message : String(e)}`, "error")
    }
    return { clearStatus: true }
  }

  if (sub === "clear") {
    const path = configFilePath()
    if (!existsSync(path)) {
      ctx.ui.notify(`Nothing to clear (no file at ${path}).`, "info")
      return {}
    }
    const ok = await ctx.ui.confirm(
      "Delete config file?",
      `This will remove ${path}. You will need to reconfigure.`,
    )
    if (!ok) return {}
    const removed = clearConfig()
    ctx.ui.notify(removed ? `Removed ${path}` : "File not found.", removed ? "info" : "warning")
    return { clearStatus: true }
  }

  if (sub === "test") {
    ctx.ui.notify("Running one-shot fetch with current config…", "info")
    try {
      const data = await fetchUsage(ctx.modelRegistry)
      // Try to render so the user sees what the footer would show
      const rendered = renderUsage(data, ctx.ui.theme as Parameters<typeof renderUsage>[1])
      if (rendered) {
        ctx.ui.notify(`OK: ${rendered}`, "info")
      } else {
        ctx.ui.notify("OK (no windows to display).", "info")
      }
    } catch (e) {
      const code = e instanceof UsageError ? e.code : "fetch"
      const msg = e instanceof Error ? e.message : String(e)
      // Diagnostic: show full message (no truncation) and common-cause hints.
      // The message never contains the cookie (sanitizeUrl strips query/host).
      const hints = diagnosticHints(code)
      ctx.ui.notify(`Failed: <err:${code}>\n  ${msg}\n${hints}`, "error")
    }
    return { clearStatus: true }
  }

  ctx.ui.notify(`Unknown subcommand: ${sub}\n\n${USAGE_HELP}`, "warning")
  return {}
}

function diagnosticHints(code: string): string {
  switch (code) {
    case "http500":
      return [
        "MOST LIKELY: the opencode.ai backend errored while serving the usage page",
        "(GET /workspace/<wrk>/go). The old /_server JSON endpoint always answered",
        "500 for cookie auth and is no longer used by this extension.",
        "",
        "Other causes:",
        "  - workspaceID has no active Go subscription",
        "  - an invalid/expired cookie usually redirects to the login page (302)",
        "    instead of returning 500 — re-login only helps if you see a 302",
        "  - the opencode.ai backend is having a transient error",
        "",
        "Tip: open https://opencode.ai/workspace/<wrk>/go in a logged-in browser and",
        "check that the usage blocks render; if they do, re-run this test.",
      ].join("\n")
    case "http401":
      return [
        "Common causes of http401:",
        "  - cookie is malformed (missing 'auth=' prefix, missing 'oc_locale=...', etc.)",
        "  - cookie is expired or has been signed-out",
        "Try: copy the cookie fresh from DevTools after re-login.",
      ].join("\n")
    case "noconfig":
      return [
        "No usable config. Set OPENCODE_GO_COOKIE + OPENCODE_GO_WORKSPACE_ID",
        "(env vars or ~/.pi/agent/pi-ocgo-usage.json), or use /oc-go-config set.",
      ].join("\n")
    case "timeout":
      return [
        "Request timed out. The opencode.ai backend may be slow; the next turn will retry.",
        "If persistent, check your network or increase OPENCODE_GO_TIMEOUT_MS.",
      ].join("\n")
    case "fetch":
      return "Network error reaching opencode.ai. Check connectivity."
    default:
      return ""
  }
}

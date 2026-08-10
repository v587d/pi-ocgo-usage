/**
 * pi-ocgo-usage — entry point
 *
 * Wires up the cookie + (future) apikey usage fetchers into a pi extension
 * via `createUsageExtension` from `@alexanderfortin/pi-usage-lib`.
 *
 * Lifecycle:
 *  - `session_start`    : if model is opencode-go, show footer (may show <err:code>)
 *  - `model_select`     : show on switch-to-opencode-go, clear on switch-away
 *  - `turn_end`         : refresh on each turn (subject to cache TTL)
 *  - `session_shutdown` : clear footer
 *
 * Provider matching lives in `./provider.ts`; config in `./config.ts`;
 * HTTP/parsing in `./api.ts`; rendering in `./render.ts`.
 */

import { createUsageExtension, type Theme } from "@alexanderfortin/pi-usage-lib"
import { fetchUsage } from "./api"
import { renderError, renderUsage } from "./render"
import type { NormalizedUsage } from "./types"

/** Stable public type alias for the normalized usage payload. */
export type UsageData = NormalizedUsage

// ============================================================================
// Public re-exports (for downstream consumers and tests)
// ============================================================================

export {
  fetchUsage,
  fetchViaApikey,
  fetchViaCookie,
  fromApikeyResponse,
  fromCookieResponse,
  UsageError,
} from "./api"
export { configFilePath, loadConfig } from "./config"
export { isOpencodeGoProvider, PROVIDER_PREFIX } from "./provider"
export { formatDuration, LABEL, renderError, renderUsage } from "./render"
export type {
  FetchMode,
  NormalizedUsage,
  OCGoConfig,
  UsageStatus,
  UsageWindow,
  UsageWindowKind,
} from "./types"
export type { Theme }

// ============================================================================
// Extension factory
// ============================================================================

const extension = createUsageExtension<UsageData>({
  providerPrefix: "opencode-go",
  statusKey: "opencode-go-usage",
  label: "OC.go",
  // 5-minute default cache (loadConfig() does not affect this directly —
  // pi-usage-lib's `cooldownMs` is a static factory option, not a runtime value)
  cooldownMs: 5 * 60 * 1000,
  fetchUsage: (modelRegistry) => fetchUsage(modelRegistry),
  renderStatus: (data, theme) => renderUsage(data, theme) ?? "",
  renderError: (error, theme) => renderError(error, theme),
})

export default extension

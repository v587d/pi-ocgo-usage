/**
 * pi-ocgo-usage — entry point
 *
 * Wires up the cookie + (future) apikey usage fetchers into a pi extension
 * via `createUsageExtension` from `@alexanderfortin/pi-usage-lib`, and
 * registers the `/oc-go-config` slash command for user-driven setup.
 *
 * Lifecycle:
 *  - `session_start`    : if model is opencode-go, show footer (may show <err:code>)
 *  - `model_select`     : show on switch-to-opencode-go, clear on switch-away
 *  - `turn_end`         : refresh on each turn (subject to cache TTL)
 *  - `session_shutdown` : clear footer
 *
 * Provider matching lives in `./provider.ts`; config in `./config.ts`;
 * HTTP/parsing in `./api.ts`; rendering in `./render.ts`;
 * slash command in `./config-cmd.ts`.
 */
import { type Theme } from "@alexanderfortin/pi-usage-lib";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { NormalizedUsage } from "./types";
/** Stable public type alias for the normalized usage payload. */
export type UsageData = NormalizedUsage;
export { fetchUsage, fetchViaApikey, fetchViaCookie, fromApikeyResponse, fromSSRHTML, parseDurationToSec, UsageError, } from "./api";
export { configFilePath, loadConfig } from "./config";
export { runOcgoConfig } from "./config-cmd";
export { isOpencodeGoProvider, PROVIDER_PREFIX } from "./provider";
export { formatDuration, LABEL, renderError, renderUsage } from "./render";
export type { FetchMode, NormalizedUsage, OCGoConfig, UsageStatus, UsageWindow, UsageWindowKind, } from "./types";
export type { Theme };
/**
 * Final extension: wraps the base usage extension and additionally registers
 * the `/oc-go-config` slash command for user-driven configuration.
 */
declare const extension: (pi: ExtensionAPI) => void;
export default extension;
//# sourceMappingURL=index.d.ts.map
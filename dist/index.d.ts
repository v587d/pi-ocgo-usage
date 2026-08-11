/**
 * pi-ocgo-usage — entry point
 *
 * Wires the usage fetcher into a pi extension and registers the
 * `/oc-go-config` slash command for user-driven setup.
 *
 * Lifecycle (all handlers fire-and-forget — they never block message flow):
 *  - `session_start`    : if model is opencode-go, refresh footer in background
 *  - `model_select`     : refresh on switch-to-opencode-go, clear on switch-away
 *  - `turn_end`         : refresh on each turn (subject to config TTL)
 *  - `session_shutdown` : clear footer and discard in-flight results
 *
 * The non-blocking cache lives in `./usage-cache.ts` (self-implemented
 * instead of `pi-usage-lib`'s `createUsageExtension`, whose handlers await
 * the network fetch inline and can delay the message pipeline by up to
 * `timeoutMs` per cold fetch). Provider matching lives in `./provider.ts`;
 * config in `./config.ts`; HTTP/parsing in `./api.ts`; rendering in
 * `./render.ts`; slash command in `./config-cmd.ts`.
 */
import type { Theme } from "@alexanderfortin/pi-usage-lib";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { NormalizedUsage } from "./types";
/** Stable public type alias for the normalized usage payload. */
export type UsageData = NormalizedUsage;
export { fetchUsage, fetchViaApikey, fetchViaCookie, fromApikeyResponse, fromSSRHTML, parseDurationToSec, UsageError, } from "./api";
export { configFilePath, loadConfig } from "./config";
export { runOcgoConfig } from "./config-cmd";
export { isOpencodeGoModel, isOpencodeGoProvider, PROVIDER_PREFIX } from "./provider";
export { formatDuration, LABEL, renderError, renderUsage } from "./render";
export type { FetchMode, NormalizedUsage, OCGoConfig, UsageStatus, UsageWindow, UsageWindowKind, } from "./types";
export { UsageCache } from "./usage-cache";
export type { Theme };
/**
 * Final extension: registers fire-and-forget usage refresh handlers plus the
 * `/oc-go-config` slash command for user-driven configuration.
 *
 * Every handler returns synchronously — the background refresh (and any
 * network fetch) never blocks pi's event pipeline, so messages are
 * unaffected regardless of cache state, failure, or timeout.
 */
declare const extension: (pi: ExtensionAPI) => void;
export default extension;
//# sourceMappingURL=index.d.ts.map
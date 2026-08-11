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
import { fetchUsage } from "./api";
import { runOcgoConfig } from "./config-cmd";
import { isOpencodeGoModel, isOpencodeGoProvider } from "./provider";
import { renderError, renderUsage } from "./render";
import { UsageCache } from "./usage-cache";
// ============================================================================
// Public re-exports (for downstream consumers and tests)
// ============================================================================
export { fetchUsage, fetchViaApikey, fetchViaCookie, fromApikeyResponse, fromSSRHTML, parseDurationToSec, UsageError, } from "./api";
export { configFilePath, loadConfig } from "./config";
export { runOcgoConfig } from "./config-cmd";
export { isOpencodeGoModel, isOpencodeGoProvider, PROVIDER_PREFIX } from "./provider";
export { formatDuration, LABEL, renderError, renderUsage } from "./render";
export { UsageCache } from "./usage-cache";
// ============================================================================
// Extension factory
// ============================================================================
const STATUS_KEY = "opencode-go-usage";
/**
 * Final extension: registers fire-and-forget usage refresh handlers plus the
 * `/oc-go-config` slash command for user-driven configuration.
 *
 * Every handler returns synchronously — the background refresh (and any
 * network fetch) never blocks pi's event pipeline, so messages are
 * unaffected regardless of cache state, failure, or timeout.
 */
const extension = (pi) => {
    const cache = new UsageCache(STATUS_KEY, (registry) => fetchUsage(registry), (data, theme) => renderUsage(data, theme) ?? "", (error, theme) => renderError(error, theme));
    pi.on("session_start", (_event, ctx) => {
        if (isOpencodeGoProvider(ctx))
            cache.refresh(ctx);
    });
    pi.on("model_select", (event, ctx) => {
        if (isOpencodeGoModel(event.model))
            cache.refresh(ctx);
        else
            cache.clear(ctx);
    });
    pi.on("turn_end", (_event, ctx) => {
        if (isOpencodeGoProvider(ctx))
            cache.refresh(ctx);
    });
    pi.on("session_shutdown", (_event, ctx) => {
        cache.clear(ctx);
    });
    pi.registerCommand("oc-go-config", {
        description: "Configure OpenCode Go usage extension (cookie + workspace_id)",
        handler: async (args, ctx) => {
            await runOcgoConfig(args, ctx);
        },
    });
};
export default extension;
//# sourceMappingURL=index.js.map
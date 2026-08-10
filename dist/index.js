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
import { createUsageExtension } from "@alexanderfortin/pi-usage-lib";
import { fetchUsage } from "./api";
import { runOcgoConfig } from "./config-cmd";
import { renderError, renderUsage } from "./render";
// ============================================================================
// Public re-exports (for downstream consumers and tests)
// ============================================================================
export { fetchUsage, fetchViaApikey, fetchViaCookie, fromApikeyResponse, fromCookieResponse, UsageError, } from "./api";
export { configFilePath, loadConfig } from "./config";
export { runOcgoConfig } from "./config-cmd";
export { isOpencodeGoProvider, PROVIDER_PREFIX } from "./provider";
export { formatDuration, LABEL, renderError, renderUsage } from "./render";
// ============================================================================
// Extension factory
// ============================================================================
const baseExtension = createUsageExtension({
    providerPrefix: "opencode-go",
    statusKey: "opencode-go-usage",
    label: "OC.go",
    // 5-minute default cache (loadConfig() does not affect this directly —
    // pi-usage-lib's `cooldownMs` is a static factory option, not a runtime value)
    cooldownMs: 5 * 60 * 1000,
    fetchUsage: (modelRegistry) => fetchUsage(modelRegistry),
    renderStatus: (data, theme) => renderUsage(data, theme) ?? "",
    renderError: (error, theme) => renderError(error, theme),
});
/**
 * Final extension: wraps the base usage extension and additionally registers
 * the `/oc-go-config` slash command for user-driven configuration.
 */
const extension = (pi) => {
    baseExtension(pi);
    pi.registerCommand("oc-go-config", {
        description: "Configure OpenCode Go usage extension (cookie + workspace_id)",
        handler: async (args, ctx) => {
            await runOcgoConfig(args, ctx);
        },
    });
};
export default extension;
//# sourceMappingURL=index.js.map
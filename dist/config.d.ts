/**
 * Configuration loader for pi-ocgo-usage
 *
 * Priority: env vars > file (~/.pi/agent/pi-ocgo-usage.json) > built-in defaults
 *
 * The cookie is NEVER logged. If config file is missing or unparseable, we
 * silently fall back to env vars + defaults — the user will see a clean
 * error in the footer if neither source provides a usable value.
 */
import type { OCGoConfig } from "./types";
/** Resolved location of the config file */
export declare function configFilePath(): string;
/**
 * Load and merge config from file + env vars.
 * Returns a fully resolved OCGoConfig; never throws.
 */
export declare function loadConfig(): OCGoConfig;
/**
 * Normalize a user-provided cookie string into a valid `Cookie:` header value.
 *
 * Accepts three forms:
 *  1. Full header: "auth=Fe26.2*...; oc_locale=zh"   (passthrough)
 *  2. Single value: "Fe26.2*..."                    (auto-prefix "auth=")
 *  3. Two-segment:  "Fe26.2*...; oc_locale=zh"       (auto-prefix "auth=",
 *                                                       keep oc_locale)
 *
 * Strips leading/trailing whitespace, collapses internal whitespace, and
 * defaults `oc_locale=en` when only the auth value is present.
 */
export declare function normalizeCookie(input: string | undefined): string | undefined;
//# sourceMappingURL=config.d.ts.map
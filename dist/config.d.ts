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
//# sourceMappingURL=config.d.ts.map
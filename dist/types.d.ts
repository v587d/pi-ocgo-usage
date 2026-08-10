/**
 * Shared types for pi-ocgo-usage
 *
 * Normalized internal types are the contract between the API adapter layer
 * and the rendering layer. The two HTTP paths (cookie / apikey) both adapt
 * to `NormalizedUsage` so the renderer doesn't care which path was used.
 */
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
/** A normalized usage window (rolling/weekly/monthly) */
export type UsageWindowKind = "rolling" | "weekly" | "monthly";
/** Status of a usage window relative to its limit */
export type UsageStatus = "ok" | "rate-limited";
export interface UsageWindow {
    readonly kind: UsageWindowKind;
    /** Integer percentage 0-100 */
    readonly percent: number;
    /** Seconds until window resets (>= 0) */
    readonly resetInSec: number;
    readonly status: UsageStatus;
}
export interface NormalizedUsage {
    /** "Use balance" fallback flag (超额后走 Zen 余额). Parsed but not rendered. */
    readonly useBalance: boolean;
    /** Epoch ms of the last successful fetch (stamped by fetchUsage). */
    readonly updatedAt?: number;
    readonly rolling?: UsageWindow;
    readonly weekly?: UsageWindow;
    readonly monthly?: UsageWindow;
}
/** Mode for which path(s) to try when fetching usage */
export type FetchMode = "auto" | "cookie" | "apikey";
/** Resolved runtime config (env > file > defaults) */
export interface OCGoConfig {
    readonly cookie: string | undefined;
    readonly workspaceID: string | undefined;
    readonly baseUrl: string;
    readonly cacheTTL: number;
    readonly mode: FetchMode;
    readonly timeoutMs: number;
}
/** Re-export ModelRegistry for convenience in api.ts */
export type { ModelRegistry };
//# sourceMappingURL=types.d.ts.map
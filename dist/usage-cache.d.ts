/**
 * Fire-and-forget usage cache for pi-ocgo-usage.
 *
 * Replaces pi-usage-lib's UsageCache wiring. The lib's event handlers
 * `await` the network fetch inline, which blocks pi's event pipeline
 * (turn_end / session_start / model_select) until the request settles —
 * up to `timeoutMs` (default 10s) per cold fetch, and on EVERY turn when
 * the fetch keeps failing (no failure cooldown in the lib).
 *
 * This cache never blocks message flow:
 *  - `refresh()` returns immediately; the fetch runs in the background and
 *    only applies its result to the footer when it completes.
 *  - The TTL comes from the real config (`cacheTTL`, clamped 60–3600s by
 *    config.ts), so the configured knob actually takes effect.
 *  - A failed fetch enters a cooldown (default 60s) instead of retrying on
 *    every turn.
 *  - Results that arrive after `clear()` (session shutdown / model switch
 *    away) are discarded, and a stale ctx can never throw.
 */
import type { Theme } from "@alexanderfortin/pi-usage-lib";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { NormalizedUsage } from "./types";
type FetchUsage = (registry: ExtensionContext["modelRegistry"]) => Promise<NormalizedUsage>;
export declare class UsageCache {
    private readonly statusKey;
    private readonly fetchUsage;
    private readonly renderStatus;
    private readonly renderError;
    private readonly failureCooldownMs;
    private lastData;
    private lastFetchMs;
    private failureUntilMs;
    private fetching;
    private active;
    constructor(statusKey: string, fetchUsage: FetchUsage, renderStatus: (data: NormalizedUsage, theme: Theme) => string, renderError: (error: unknown, theme: Theme) => string, failureCooldownMs?: number);
    /** Cache TTL from live config (seconds -> ms). */
    protected get ttlMs(): number;
    /**
     * Fire-and-forget refresh. Kicks off a background fetch when the cache is
     * cold (or the failure cooldown has expired) and returns immediately.
     * Never throws.
     */
    refresh(ctx: ExtensionContext): void;
    /**
     * Clear the footer and mark the cache inactive so any in-flight result is
     * discarded. Called on session shutdown and when switching away from an
     * opencode-go model.
     */
    clear(ctx: ExtensionContext): void;
    private refreshAsync;
    /** Apply a rendered footer, discarding it if the cache went inactive. */
    private apply;
    /** setStatus that tolerates a ctx invalidated by session teardown. */
    private setStatusSafe;
}
export {};
//# sourceMappingURL=usage-cache.d.ts.map
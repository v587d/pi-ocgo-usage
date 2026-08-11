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
import { Temporal } from "temporal-polyfill";
import { loadConfig } from "./config";
/** After a failed fetch, skip further fetches for this long. */
const DEFAULT_FAILURE_COOLDOWN_MS = 60_000;
export class UsageCache {
    statusKey;
    fetchUsage;
    renderStatus;
    renderError;
    failureCooldownMs;
    lastData = null;
    lastFetchMs = 0;
    failureUntilMs = 0;
    fetching = false;
    active = false;
    constructor(statusKey, fetchUsage, renderStatus, renderError, failureCooldownMs = DEFAULT_FAILURE_COOLDOWN_MS) {
        this.statusKey = statusKey;
        this.fetchUsage = fetchUsage;
        this.renderStatus = renderStatus;
        this.renderError = renderError;
        this.failureCooldownMs = failureCooldownMs;
    }
    /** Cache TTL from live config (seconds -> ms). */
    get ttlMs() {
        return loadConfig().cacheTTL * 1000;
    }
    /**
     * Fire-and-forget refresh. Kicks off a background fetch when the cache is
     * cold (or the failure cooldown has expired) and returns immediately.
     * Never throws.
     */
    refresh(ctx) {
        this.active = true;
        void this.refreshAsync(ctx);
    }
    /**
     * Clear the footer and mark the cache inactive so any in-flight result is
     * discarded. Called on session shutdown and when switching away from an
     * opencode-go model.
     */
    clear(ctx) {
        this.active = false;
        this.setStatusSafe(ctx, undefined);
    }
    async refreshAsync(ctx) {
        const now = Temporal.Now.instant().epochMilliseconds;
        try {
            // Fresh cache -> just re-render what we have (no network).
            if (this.lastData && now - this.lastFetchMs < this.ttlMs) {
                this.apply(ctx, this.renderStatus(this.lastData, ctx.ui.theme));
                return;
            }
            // Failure cooldown -> skip silently (footer keeps showing the error).
            if (now < this.failureUntilMs)
                return;
            // One in-flight fetch is enough; it renders for every caller.
            if (this.fetching)
                return;
            this.fetching = true;
            try {
                const data = await this.fetchUsage(ctx.modelRegistry);
                if (!this.active)
                    return; // session gone / model switched away mid-fetch
                this.lastData = data;
                this.lastFetchMs = Temporal.Now.instant().epochMilliseconds;
                this.failureUntilMs = 0;
                this.apply(ctx, this.renderStatus(data, ctx.ui.theme));
            }
            finally {
                this.fetching = false;
            }
        }
        catch (error) {
            if (!this.active)
                return;
            this.failureUntilMs = Temporal.Now.instant().epochMilliseconds + this.failureCooldownMs;
            this.apply(ctx, this.renderError(error, ctx.ui.theme));
        }
    }
    /** Apply a rendered footer, discarding it if the cache went inactive. */
    apply(ctx, text) {
        if (!this.active)
            return;
        this.setStatusSafe(ctx, text);
    }
    /** setStatus that tolerates a ctx invalidated by session teardown. */
    setStatusSafe(ctx, text) {
        try {
            ctx.ui.setStatus(this.statusKey, text);
        }
        catch {
            // pi invalidates ctx after session shutdown/replace; ignore.
        }
    }
}
//# sourceMappingURL=usage-cache.js.map
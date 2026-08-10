/**
 * HTTP fetch + response adapters for pi-ocgo-usage
 *
 * Two paths:
 *  1. Cookie path (B2, main): GET /workspace/<wrk>/go HTML SSR scrape.
 *     The dashboard renders usage values inline in `data-slot="usage-item"`
 *     blocks. This is the only cookie-authenticated way to read usage today.
 *
 *  2. Apikey path (B, future fallback): the proposed official API from
 *     [anomalyco/opencode#16513]. Endpoint:
 *       GET /zen/go/v1/usage
 *       Authorization: Bearer <opencode-go-api-key>
 *     Auto-enabled when the PR ships; until then, this path always 404s.
 *
 * Both paths adapt to the internal `NormalizedUsage` shape so the renderer
 * is path-agnostic.
 */
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { FetchMode, NormalizedUsage, OCGoConfig } from "./types";
/** Error thrown by HTTP / parsing layer; carries a short code for footer */
export declare class UsageError extends Error {
    readonly code: string;
    readonly name = "UsageError";
    constructor(message: string, code: string);
}
export declare function fetchViaCookie(cfg: OCGoConfig): Promise<NormalizedUsage>;
/**
 * Parse the opencode console SSR HTML page and extract the three usage
 * windows. Reset times are emitted as English phrases inside
 * `data-slot="reset-time"` (e.g. "Resets in 2 hours 29 minutes"). We parse
 * them into a coarse `resetInSec` estimate; precise second-level resets are
 * not needed for the footer display.
 */
export declare function fromSSRHTML(html: string): NormalizedUsage;
/**
 * Parse a human duration phrase into seconds. Examples:
 *   "2 hours 29 minutes" → 8940
 *   "45 minutes"          → 2700
 *   "5 days"              → 432000
 *   "30 seconds"          → 30
 *
 * Returns 0 on unrecognized input.
 */
export declare function parseDurationToSec(phrase: string): number;
interface ApikeyResponse {
    useBalance?: unknown;
    rollingUsage?: {
        usage: unknown;
        limit: unknown;
        window: unknown;
        resetsAt: unknown;
    } | null;
    weeklyUsage?: {
        usage: unknown;
        limit: unknown;
        window: unknown;
        resetsAt: unknown;
    } | null;
    monthlyUsage?: {
        usage: unknown;
        limit: unknown;
        window: unknown;
        resetsAt: unknown;
        timeSubscribed?: unknown;
    } | null;
}
export declare function fetchViaApikey(cfg: OCGoConfig, apiKey: string): Promise<NormalizedUsage>;
export declare function fromApikeyResponse(data: ApikeyResponse): NormalizedUsage;
/**
 * Fetch usage by trying the configured paths in order.
 *
 * Path selection by `mode`:
 *   - "cookie": try cookie only
 *   - "apikey": try apikey only
 *   - "auto":   v0.1 = cookie only (PR #16513 not yet merged)
 *               v0.2 = apikey first, then cookie fallback (after PR merges)
 */
export declare function fetchUsage(registry: Pick<ModelRegistry, "getApiKeyForProvider">): Promise<NormalizedUsage>;
export type { FetchMode };
//# sourceMappingURL=api.d.ts.map
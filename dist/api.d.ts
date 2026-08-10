/**
 * HTTP fetch + response adapters for pi-ocgo-usage
 *
 * Two paths:
 *  1. Cookie path (B2, main): reverse-engineered from opencode console's
 *     SolidStart server function. Endpoint:
 *       GET /_server?id=lite.subscription.get&workspaceID=<wrk>
 *       Cookie: auth=<Iron-session>; oc_locale=...
 *
 *  2. Apikey path (B, future fallback): the proposed official API from
 *     [anomalyco/opencode#16513]. Endpoint:
 *       GET /zen/go/v1/usage
 *       Authorization: Bearer <opencode-go-api-key>
 *
 * Both adapt to the internal `NormalizedUsage` shape so the renderer is
 * path-agnostic.
 */
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { FetchMode, NormalizedUsage, OCGoConfig } from "./types";
/** Error thrown by HTTP / parsing layer; carries a short code for footer */
export declare class UsageError extends Error {
    readonly code: string;
    readonly name = "UsageError";
    constructor(message: string, code: string);
}
interface CookieResponse {
    mine?: unknown;
    useBalance?: unknown;
    region?: unknown;
    rollingUsage?: {
        status: unknown;
        resetInSec: unknown;
        usagePercent: unknown;
    } | null;
    weeklyUsage?: {
        status: unknown;
        resetInSec: unknown;
        usagePercent: unknown;
    } | null;
    monthlyUsage?: {
        status: unknown;
        resetInSec: unknown;
        usagePercent: unknown;
    } | null;
}
export declare function fetchViaCookie(cfg: OCGoConfig): Promise<NormalizedUsage>;
export declare function fromCookieResponse(data: CookieResponse): NormalizedUsage;
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
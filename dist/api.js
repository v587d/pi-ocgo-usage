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
import { loadConfig } from "./config";
// ============================================================================
// Errors
// ============================================================================
/** Error thrown by HTTP / parsing layer; carries a short code for footer */
export class UsageError extends Error {
    code;
    name = "UsageError";
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
async function safeFetch(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: init.method ?? "GET",
            headers: init.headers,
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new UsageError(`HTTP ${res.status} for ${sanitizeUrl(url)}`, `http${res.status}`);
        }
        try {
            return (await res.json());
        }
        catch {
            throw new UsageError(`Bad JSON from ${sanitizeUrl(url)}`, "badjson");
        }
    }
    catch (e) {
        if (e instanceof UsageError)
            throw e;
        if (e instanceof Error && e.name === "AbortError") {
            throw new UsageError(`Request timed out after ${timeoutMs}ms`, "timeout");
        }
        throw new UsageError(String(e instanceof Error ? e.message : e), "fetch");
    }
    finally {
        clearTimeout(timer);
    }
}
/** Strip any query param that might contain secrets for error messages */
function sanitizeUrl(url) {
    try {
        const u = new URL(url);
        // _server IDs and workspace IDs are not secret, but strip anyway
        return `${u.protocol}//${u.host}${u.pathname}`;
    }
    catch {
        return url;
    }
}
export async function fetchViaCookie(cfg) {
    if (!cfg.cookie || !cfg.workspaceID) {
        throw new UsageError("Missing cookie or workspaceID for cookie path", "noconfig");
    }
    const url = `${cfg.baseUrl}/_server?id=lite.subscription.get&workspaceID=${encodeURIComponent(cfg.workspaceID)}`;
    const data = (await safeFetch(url, { headers: { Cookie: cfg.cookie, Accept: "application/json" } }, cfg.timeoutMs));
    return fromCookieResponse(data);
}
export function fromCookieResponse(data) {
    return {
        useBalance: data.useBalance === true,
        ...mapIfPresent(data.rollingUsage, "rolling", (w) => makeCookieWindow("rolling", w)),
        ...mapIfPresent(data.weeklyUsage, "weekly", (w) => makeCookieWindow("weekly", w)),
        ...mapIfPresent(data.monthlyUsage, "monthly", (w) => makeCookieWindow("monthly", w)),
    };
}
function makeCookieWindow(kind, raw) {
    return {
        kind,
        percent: clampPercent(asNumber(raw.usagePercent)),
        resetInSec: clampReset(asNumber(raw.resetInSec)),
        status: raw.status === "rate-limited" ? "rate-limited" : "ok",
    };
}
export async function fetchViaApikey(cfg, apiKey) {
    const url = `${cfg.baseUrl}/zen/go/v1/usage`;
    const data = (await safeFetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }, cfg.timeoutMs));
    return fromApikeyResponse(data);
}
export function fromApikeyResponse(data) {
    return {
        useBalance: data.useBalance === true,
        ...mapIfPresent(data.rollingUsage, "rolling", (w) => makeApikeyWindow("rolling", w)),
        ...mapIfPresent(data.weeklyUsage, "weekly", (w) => makeApikeyWindow("weekly", w)),
        ...mapIfPresent(data.monthlyUsage, "monthly", (w) => makeApikeyWindow("monthly", w)),
    };
}
function makeApikeyWindow(kind, raw) {
    const usage = asNumber(raw.usage) ?? 0;
    const limit = asNumber(raw.limit) ?? 0;
    // Note: `usage` and `limit` are in micro-cents internally, but the ratio is
    // dimensionless so we can compute percentage directly.
    const pct = limit > 0 ? Math.min(100, Math.floor((usage / limit) * 100)) : 0;
    const resetMs = parseIsoToMs(asString(raw.resetsAt)) - Date.now();
    const resetInSec = Number.isFinite(resetMs) ? Math.max(0, Math.floor(resetMs / 1000)) : 0;
    return {
        kind,
        percent: pct,
        resetInSec,
        status: usage >= limit ? "rate-limited" : "ok",
    };
}
function parseIsoToMs(iso) {
    if (!iso)
        return Number.NaN;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? Number.NaN : ms;
}
// ============================================================================
// Orchestrator
// ============================================================================
/**
 * Fetch usage by trying the configured paths in order.
 *
 * Path selection by `mode`:
 *   - "cookie": try cookie only
 *   - "apikey": try apikey only
 *   - "auto":   v0.1 = cookie only (PR #16513 not yet merged)
 *               v0.2 = apikey first, then cookie fallback (after PR merges)
 */
export async function fetchUsage(registry) {
    const cfg = loadConfig();
    const paths = buildPathList(cfg, registry);
    if (paths.length === 0) {
        throw new UsageError("No usable config (set OPENCODE_GO_COOKIE + OPENCODE_GO_WORKSPACE_ID, or log in via /connect for opencode-go)", "noconfig");
    }
    // In v0.1, only one path is enabled at a time per mode; for safety, try each
    // in order and return the first success, propagating the LAST error if all
    // fail. This means "auto" mode today never tries apikey (PR not merged).
    let lastError;
    for (const path of paths) {
        try {
            return await path.fn();
        }
        catch (e) {
            lastError = e;
        }
    }
    throw lastError instanceof Error ? lastError : new UsageError(String(lastError), "fetch");
}
function buildPathList(cfg, registry) {
    const paths = [];
    if (cfg.mode === "cookie") {
        pushCookiePath(paths, cfg);
    }
    else if (cfg.mode === "apikey") {
        pushApikeyPath(paths, cfg, registry);
    }
    else {
        // mode === "auto"
        // v0.1: cookie only. When PR #16513 merges, change to [apikey, cookie].
        pushCookiePath(paths, cfg);
        // pushApikeyPath(paths, cfg, registry)  // <-- uncomment after PR merges
    }
    return paths;
}
function pushCookiePath(paths, cfg) {
    if (cfg.cookie && cfg.workspaceID) {
        paths.push({ fn: () => fetchViaCookie(cfg) });
    }
}
function pushApikeyPath(paths, cfg, registry) {
    paths.push({
        fn: async () => {
            const apiKey = await safeGetApikey(registry);
            if (!apiKey) {
                throw new UsageError("No API key available for opencode-go provider", "noconfig");
            }
            return fetchViaApikey(cfg, apiKey);
        },
    });
}
async function safeGetApikey(registry) {
    try {
        const key = await registry.getApiKeyForProvider("opencode-go");
        if (typeof key === "string" && key.length > 0 && key !== "proxy-managed") {
            return key;
        }
        return null;
    }
    catch {
        return null;
    }
}
// ============================================================================
// Internal helpers
// ============================================================================
function mapIfPresent(value, key, mapper) {
    if (value === undefined || value === null)
        return {};
    return { [key]: mapper(value) };
}
function asNumber(v) {
    if (typeof v === "number" && Number.isFinite(v))
        return v;
    if (typeof v === "string") {
        const n = Number(v);
        if (Number.isFinite(n))
            return n;
    }
    return undefined;
}
function asString(v) {
    return typeof v === "string" && v.length > 0 ? v : undefined;
}
function clampPercent(n) {
    if (n === undefined)
        return 0;
    return Math.max(0, Math.min(100, Math.floor(n)));
}
function clampReset(n) {
    if (n === undefined)
        return 0;
    return Math.max(0, Math.floor(n));
}
//# sourceMappingURL=api.js.map
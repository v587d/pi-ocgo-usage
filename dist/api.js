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
/** JSON fetch with structured errors (used by the apikey path). */
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
/** Text fetch with structured errors (used by the cookie SSR path). */
async function safeFetchText(url, init, timeoutMs) {
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
        return await res.text();
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
/** Strip query params from a URL for safe error messages. */
function sanitizeUrl(url) {
    try {
        const u = new URL(url);
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
    const url = `${cfg.baseUrl}/workspace/${encodeURIComponent(cfg.workspaceID)}/go`;
    const html = await safeFetchText(url, { headers: { Cookie: cfg.cookie, Accept: "text/html" } }, cfg.timeoutMs);
    return fromSSRHTML(html);
}
/**
 * Parse the opencode console SSR HTML page and extract the three usage
 * windows. Reset times are emitted as English phrases inside
 * `data-slot="reset-time"` (e.g. "Resets in 2 hours 29 minutes"). We parse
 * them into a coarse `resetInSec` estimate; precise second-level resets are
 * not needed for the footer display.
 */
export function fromSSRHTML(html) {
    // Each usage-item is a `<div data-slot="usage-item">...</div>` block, but
    // the markup inside may itself contain nested divs (usage-header,
    // progress bar, ...). Instead of trying to find the block's closing tag
    // with a regex, we slice between consecutive item start tags — that keeps
    // the whole block (including any nested divs) in one piece.
    const itemStartRe = /<div[^>]*data-slot="usage-item"/g;
    const starts = [];
    let startMatch = itemStartRe.exec(html);
    while (startMatch !== null) {
        starts.push(startMatch.index);
        startMatch = itemStartRe.exec(html);
    }
    const items = [];
    for (let i = 0; i < starts.length; i++) {
        const block = html.slice(starts[i], starts[i + 1] ?? html.length);
        const labelMatch = block.match(/data-slot="usage-label"[^>]*>([^<]+)</);
        const valueMatch = block.match(/data-slot="usage-value"[\s\S]*?<!--\$-->\s*(\d+)\s*<!--\/-->/);
        const resetMatch = block.match(/data-slot="reset-time"[\s\S]*?Resets in(?:<!--\/-->\s*)?([\s\S]*?)(?:<!--\/-->|<\/span>)/);
        if (!labelMatch || !valueMatch)
            continue;
        const label = labelMatch[1]?.trim() ?? "";
        const percent = Number.parseInt(valueMatch[1] ?? "0", 10);
        const resetsIn = resetMatch ? stripHtmlComments(resetMatch[1] ?? "").trim() : "";
        items.push({ label, percent, resetsIn });
    }
    const result = {
        useBalance: html.includes("useBalance"),
    };
    for (const item of items) {
        const kind = labelToKind(item.label);
        if (!kind)
            continue;
        result[kind] = {
            kind,
            percent: clampPercent(item.percent),
            resetInSec: parseDurationToSec(item.resetsIn),
            status: item.percent >= 100 ? "rate-limited" : "ok",
        };
    }
    return result;
}
function labelToKind(label) {
    const lower = label.toLowerCase();
    if (lower.startsWith("rolling"))
        return "rolling";
    if (lower.startsWith("weekly"))
        return "weekly";
    if (lower.startsWith("monthly"))
        return "monthly";
    return undefined;
}
/** Strip SolidStart HTML comments `<!-- ... -->` from a string. */
function stripHtmlComments(s) {
    return s.replace(/<!--[\s\S]*?-->/g, "").trim();
}
/**
 * Parse a human duration phrase into seconds. Examples:
 *   "2 hours 29 minutes" → 8940
 *   "45 minutes"          → 2700
 *   "5 days"              → 432000
 *   "30 seconds"          → 30
 *
 * Returns 0 on unrecognized input.
 */
export function parseDurationToSec(phrase) {
    if (!phrase)
        return 0;
    const p = phrase.trim().replace(/\s+/g, " ").toLowerCase();
    if (!p)
        return 0;
    const re = /(\d+)\s*(second|minute|hour|day|week|month|year)s?/g;
    let total = 0;
    let matched = false;
    let m = re.exec(p);
    while (m !== null) {
        const n = Number.parseInt(m[1] ?? "0", 10);
        const unit = m[2] ?? "";
        matched = true;
        switch (unit) {
            case "second":
                total += n;
                break;
            case "minute":
                total += n * 60;
                break;
            case "hour":
                total += n * 3600;
                break;
            case "day":
                total += n * 86400;
                break;
            case "week":
                total += n * 604800;
                break;
            case "month":
                total += n * 2592000; // 30 days; coarse but adequate for display
                break;
            case "year":
                total += n * 31536000;
                break;
        }
        m = re.exec(p);
    }
    return matched ? total : 0;
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
//# sourceMappingURL=api.js.map
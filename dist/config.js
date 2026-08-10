/**
 * Configuration loader for pi-ocgo-usage
 *
 * Priority: env vars > file (~/.pi/agent/pi-ocgo-usage.json) > built-in defaults
 *
 * The cookie is NEVER logged. If config file is missing or unparseable, we
 * silently fall back to env vars + defaults — the user will see a clean
 * error in the footer if neither source provides a usable value.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const ENV_COOKIE = "OPENCODE_GO_COOKIE";
const ENV_WORKSPACE_ID = "OPENCODE_GO_WORKSPACE_ID";
const ENV_BASE_URL = "OPENCODE_GO_BASE_URL";
const ENV_CACHE_TTL = "OPENCODE_GO_CACHE_TTL";
const ENV_MODE = "OPENCODE_GO_MODE";
const ENV_TIMEOUT_MS = "OPENCODE_GO_TIMEOUT_MS";
const DEFAULT_BASE_URL = "https://opencode.ai";
const DEFAULT_CACHE_TTL = 300;
const DEFAULT_MODE = "auto";
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_CACHE_TTL = 60;
const MAX_CACHE_TTL = 3600;
/** Resolved location of the config file */
export function configFilePath() {
    return join(homedir(), ".pi", "agent", "pi-ocgo-usage.json");
}
/**
 * Load and merge config from file + env vars.
 * Returns a fully resolved OCGoConfig; never throws.
 */
export function loadConfig() {
    const fileConfig = readFileConfig();
    // Cookie: prefer env, fall back to file
    const cookie = pickString(process.env[ENV_COOKIE], asString(fileConfig?.cookie));
    // Workspace ID: prefer env, fall back to file
    const workspaceID = pickString(process.env[ENV_WORKSPACE_ID], asString(fileConfig?.workspaceID));
    // baseUrl: prefer env, fall back to file, fall back to default
    const baseUrl = pickString(process.env[ENV_BASE_URL], asString(fileConfig?.baseUrl)) || DEFAULT_BASE_URL;
    // cacheTTL: clamp into [60, 3600]
    const rawTTL = pickNumber(process.env[ENV_CACHE_TTL], asNumber(fileConfig?.cacheTTL), DEFAULT_CACHE_TTL);
    const cacheTTL = clamp(rawTTL, MIN_CACHE_TTL, MAX_CACHE_TTL);
    // mode: must be one of FetchMode values
    const mode = parseMode(process.env[ENV_MODE]) ?? parseMode(asString(fileConfig?.mode)) ?? DEFAULT_MODE;
    // timeoutMs: > 0
    const timeoutMs = Math.max(0, pickNumber(process.env[ENV_TIMEOUT_MS], asNumber(fileConfig?.timeoutMs), DEFAULT_TIMEOUT_MS));
    return {
        cookie,
        workspaceID,
        baseUrl,
        cacheTTL,
        mode,
        timeoutMs,
    };
}
function readFileConfig() {
    const path = configFilePath();
    if (!existsSync(path))
        return null;
    try {
        const raw = readFileSync(path, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            return parsed;
        }
        return null;
    }
    catch {
        return null;
    }
}
// --- helpers ---
function pickString(envVal, fileVal) {
    if (envVal && envVal.length > 0)
        return envVal;
    if (fileVal && fileVal.length > 0)
        return fileVal;
    return undefined;
}
function pickNumber(envVal, fileVal, fallback) {
    const fromEnv = envVal ? Number.parseInt(envVal, 10) : NaN;
    if (Number.isFinite(fromEnv))
        return fromEnv;
    if (fileVal !== undefined && Number.isFinite(fileVal))
        return fileVal;
    return fallback;
}
function asString(v) {
    return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asNumber(v) {
    if (typeof v === "number" && Number.isFinite(v))
        return v;
    if (typeof v === "string") {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n))
            return n;
    }
    return undefined;
}
function parseMode(v) {
    if (v === "auto" || v === "cookie" || v === "apikey")
        return v;
    return undefined;
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
//# sourceMappingURL=config.js.map
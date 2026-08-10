/**
 * Rendering: NormalizedUsage -> themed footer string
 *
 * Default label: "OC.go"  (OpenCode Go)
 * Default output: "OC.go: 5h 23% (3h 25m) · wk 30% (4d 6h) · mo 12% (12d 4h)"
 *
 * Color thresholds (aligned with pi-usage-lib defaults):
 *   <  80%             -> accent
 *   >= 80% and < 90%   -> warning
 *   >= 90% OR rate-limited -> error
 */
import { colorForPercentage } from "@alexanderfortin/pi-usage-lib";
import { Temporal } from "temporal-polyfill";
/** Top-level label shown before the colon in the footer. */
export const LABEL = "OC.go";
/** Window label shown before the percentage. */
const WINDOW_LABELS = {
    rolling: "5h",
    weekly: "wk",
    monthly: "mo",
};
/**
 * Render normalized usage to a themed footer string.
 *
 * Returns `undefined` if no windows are present (caller should clear footer).
 */
export function renderUsage(data, theme) {
    const parts = [];
    if (data.rolling)
        parts.push(renderWindow(data.rolling, theme));
    if (data.weekly)
        parts.push(renderWindow(data.weekly, theme));
    if (data.monthly)
        parts.push(renderWindow(data.monthly, theme));
    if (parts.length === 0)
        return undefined;
    const head = theme.fg("muted", `${LABEL}:`);
    const segments = parts.join(` ${theme.fg("dim", "·")} `);
    const tail = data.updatedAt !== undefined
        ? ` ${theme.fg("dim", "·")} ${theme.fg("muted", formatUpdatedAt(data.updatedAt))}`
        : "";
    return head + segments + tail;
}
/**
 * Format a fetch timestamp (epoch ms) as "update HH:MM (UTC+8)" in the local
 * timezone, using Temporal only (no Date API). The UTC offset label is the
 * system's current offset (e.g. "+08:00" -> "UTC+8").
 */
function formatUpdatedAt(updatedAt) {
    const timeZone = Temporal.Now.timeZoneId();
    const zdt = Temporal.Instant.fromEpochMilliseconds(updatedAt).toZonedDateTimeISO(timeZone);
    const hh = String(zdt.hour).padStart(2, "0");
    const mm = String(zdt.minute).padStart(2, "0");
    const offset = Temporal.Now.zonedDateTimeISO(timeZone).offset;
    return `update ${hh}:${mm} (${utcOffsetLabel(offset ?? "UTC")})`;
}
/** "+08:00" -> "UTC+8", "-05:30" -> "UTC-5:30", fallback: raw offset. */
function utcOffsetLabel(offset) {
    const m = /^([+-])(\d{2})(?::(\d{2}))?$/.exec(offset);
    if (!m)
        return offset;
    const sign = m[1];
    const hours = m[2] !== undefined ? Number.parseInt(m[2], 10) : 0;
    const minutes = m[3] ? Number.parseInt(m[3], 10) : 0;
    return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${minutes}`;
}
function renderWindow(w, theme) {
    const labelText = WINDOW_LABELS[w.kind];
    const pctText = `${w.percent}%`;
    const colorize = pickColorFn(w, theme);
    const timeText = formatDuration(w.resetInSec);
    const tail = ` ${theme.fg("dim", `(${timeText})`)}`;
    return `${theme.fg("muted", labelText)} ${colorize(pctText)}${tail}`;
}
/**
 * Pick the colorizer for the percentage value. Forces error color when
 * the window is rate-limited, otherwise defers to pi-usage-lib thresholds.
 */
function pickColorFn(w, theme) {
    if (w.status === "rate-limited") {
        return (s) => theme.fg("error", s);
    }
    return colorForPercentage(w.percent, theme);
}
// ============================================================================
// Compact duration formatter
// ============================================================================
/**
 * Format seconds into a compact human-readable duration:
 *   < 60s     -> "45s"
 *   < 60m     -> "23m"
 *   < 24h     -> "5h 23m"
 *   >= 24h    -> "4d 6h"
 *
 * Returns "0s" for non-positive input.
 */
export function formatDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0)
        return "0s";
    const total = Math.floor(sec);
    if (total < 60)
        return `${total}s`;
    const minutes = Math.floor(total / 60);
    if (minutes < 60)
        return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        const m = minutes % 60;
        return m === 0 ? `${hours}h` : `${hours}h ${m}m`;
    }
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    return h === 0 ? `${days}d` : `${days}d ${h}h`;
}
// ============================================================================
// Default error renderer (mirrors pi-usage-lib default style)
// ============================================================================
/**
 * Default error renderer: "OC.go:<err:code>"
 * Returns `undefined` if the caller should clear the footer entirely.
 */
export function renderError(error, theme) {
    const code = extractErrorCode(error);
    return `${theme.fg("muted", `${LABEL}:`)}${theme.fg("error", `<err:${code}>`)}`;
}
function extractErrorCode(error) {
    if (error instanceof Error) {
        const maybe = error.code;
        if (typeof maybe === "string" && maybe.length > 0)
            return maybe;
    }
    return "fetch";
}
//# sourceMappingURL=render.js.map
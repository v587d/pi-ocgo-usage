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
import { type Theme } from "@alexanderfortin/pi-usage-lib";
import type { NormalizedUsage } from "./types";
/** Top-level label shown before the colon in the footer. */
export declare const LABEL = "OC.go";
/**
 * Render normalized usage to a themed footer string.
 *
 * Returns `undefined` if no windows are present (caller should clear footer).
 */
export declare function renderUsage(data: NormalizedUsage, theme: Theme): string | undefined;
/**
 * Format seconds into a compact human-readable duration:
 *   < 60s     -> "45s"
 *   < 60m     -> "23m"
 *   < 24h     -> "5h 23m"
 *   >= 24h    -> "4d 6h"
 *
 * Returns "0s" for non-positive input.
 */
export declare function formatDuration(sec: number): string;
/**
 * Default error renderer: "OC.go:<err:code>"
 * Returns `undefined` if the caller should clear the footer entirely.
 */
export declare function renderError(error: unknown, theme: Theme): string;
//# sourceMappingURL=render.d.ts.map
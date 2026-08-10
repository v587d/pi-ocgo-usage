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

import { colorForPercentage, type Theme } from "@alexanderfortin/pi-usage-lib"
import { Temporal } from "temporal-polyfill"
import type { NormalizedUsage, UsageWindow, UsageWindowKind } from "./types"

/** Top-level label shown before the colon in the footer. */
export const LABEL = "OC.go"

/** Window label shown before the percentage. */
const WINDOW_LABELS: Record<UsageWindowKind, string> = {
  rolling: "5h",
  weekly: "wk",
  monthly: "mo",
}

/**
 * Render normalized usage to a themed footer string.
 *
 * Returns `undefined` if no windows are present (caller should clear footer).
 */
export function renderUsage(data: NormalizedUsage, theme: Theme): string | undefined {
  const parts: string[] = []

  if (data.rolling) parts.push(renderWindow(data.rolling, theme))
  if (data.weekly) parts.push(renderWindow(data.weekly, theme))
  if (data.monthly) parts.push(renderWindow(data.monthly, theme))

  if (parts.length === 0) return undefined

  const head = theme.fg("muted", `${LABEL}:`)
  const segments = parts.join(` ${theme.fg("dim", "·")} `)
  const tail =
    data.updatedAt !== undefined
      ? ` ${theme.fg("dim", "·")} ${theme.fg("muted", formatUpdatedAt(data.updatedAt))}`
      : ""

  return head + segments + tail
}

/**
 * Format a fetch timestamp (epoch ms) as "HH:MM" in the local timezone,
 * using Temporal only (no Date API).
 */
function formatUpdatedAt(updatedAt: number): string {
  const timeZone = Temporal.Now.timeZoneId()
  const zdt = Temporal.Instant.fromEpochMilliseconds(updatedAt).toZonedDateTimeISO(timeZone)
  const hh = String(zdt.hour).padStart(2, "0")
  const mm = String(zdt.minute).padStart(2, "0")
  return `${hh}:${mm}`
}

function renderWindow(w: UsageWindow, theme: Theme): string {
  const labelText = WINDOW_LABELS[w.kind]
  const pctText = `${w.percent}%`
  const colorize = pickColorFn(w, theme)
  const timeText = formatDuration(w.resetInSec)
  const tail = ` ${theme.fg("dim", `(${timeText})`)}`

  return `${theme.fg("muted", labelText)} ${colorize(pctText)}${tail}`
}

/**
 * Pick the colorizer for the percentage value. Forces error color when
 * the window is rate-limited, otherwise defers to pi-usage-lib thresholds.
 */
function pickColorFn(w: UsageWindow, theme: Theme): (text: string) => string {
  if (w.status === "rate-limited") {
    return (s: string) => theme.fg("error", s)
  }
  return colorForPercentage(w.percent, theme)
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
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0s"
  const total = Math.floor(sec)

  if (total < 60) return `${total}s`

  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const m = minutes % 60
    return m === 0 ? `${hours}h` : `${hours}h ${m}m`
  }

  const days = Math.floor(hours / 24)
  const h = hours % 24
  return h === 0 ? `${days}d` : `${days}d ${h}h`
}

// ============================================================================
// Default error renderer (mirrors pi-usage-lib default style)
// ============================================================================

/**
 * Default error renderer: "OC.go:<err:code>"
 * Returns `undefined` if the caller should clear the footer entirely.
 */
export function renderError(error: unknown, theme: Theme): string {
  const code = extractErrorCode(error)
  return `${theme.fg("muted", `${LABEL}:`)}${theme.fg("error", `<err:${code}>`)}`
}

function extractErrorCode(error: unknown): string {
  if (error instanceof Error) {
    const maybe = (error as { code?: unknown }).code
    if (typeof maybe === "string" && maybe.length > 0) return maybe
  }
  return "fetch"
}

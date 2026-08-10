/**
 * Tests for src/render.ts
 *
 * Render uses theme.fg() as a passthrough in our test theme, so we can
 * assert exact output strings.
 */

import { describe, expect, test } from "bun:test"
import type { Theme } from "@alexanderfortin/pi-usage-lib"
import { Temporal } from "temporal-polyfill"
import { formatDuration, LABEL, renderError, renderUsage } from "../src/render"
import type { NormalizedUsage } from "../src/types"

// Simple test theme: wraps text with [color:text] markers so we can assert
// which colors were applied where.
function makeTestTheme(): Theme {
  return {
    fg: (color: string, text: string) => `[${color}:${text}]`,
    bold: (text: string) => `[bold:${text}]`,
  } as unknown as Theme
}

const window23 = { kind: "rolling" as const, percent: 23, resetInSec: 12345, status: "ok" as const }
const window30 = { kind: "weekly" as const, percent: 30, resetInSec: 604800, status: "ok" as const }
const window12 = {
  kind: "monthly" as const,
  percent: 12,
  resetInSec: 2592000,
  status: "ok" as const,
}

describe("formatDuration", () => {
  test("returns 0s for non-positive or invalid", () => {
    expect(formatDuration(0)).toBe("0s")
    expect(formatDuration(-1)).toBe("0s")
    expect(formatDuration(Number.NaN)).toBe("0s")
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0s")
  })

  test("formats sub-minute as seconds", () => {
    expect(formatDuration(1)).toBe("1s")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(59)).toBe("59s")
  })

  test("formats sub-hour as minutes", () => {
    expect(formatDuration(60)).toBe("1m")
    expect(formatDuration(125)).toBe("2m") // 2m5s -> 2m
    expect(formatDuration(3599)).toBe("59m")
  })

  test("formats sub-day as hours and minutes", () => {
    expect(formatDuration(3600)).toBe("1h")
    expect(formatDuration(3600 + 60)).toBe("1h 1m")
    expect(formatDuration(5 * 3600 + 25 * 60)).toBe("5h 25m")
    expect(formatDuration(23 * 3600 + 59 * 60)).toBe("23h 59m")
  })

  test("formats multi-day as days and hours", () => {
    expect(formatDuration(24 * 3600)).toBe("1d")
    expect(formatDuration(24 * 3600 + 6 * 3600)).toBe("1d 6h")
    expect(formatDuration(4 * 24 * 3600 + 6 * 3600)).toBe("4d 6h")
  })
})

describe("renderUsage", () => {
  test("renders all three windows in order rolling, weekly, monthly", () => {
    const data: NormalizedUsage = {
      useBalance: false,
      rolling: window23,
      weekly: window30,
      monthly: window12,
    }
    const out = renderUsage(data, makeTestTheme())
    expect(out).toBeDefined()
    // Expect "OC.go:" + 5h/wk/mo + % + (time)
    expect(out).toContain(`[muted:${LABEL}:]`)
    expect(out).toContain("[muted:5h]")
    expect(out).toContain("[muted:wk]")
    expect(out).toContain("[muted:mo]")
    // Dim dot separators
    expect(out).toContain("[dim:·]")
    // Dim parens around time
    expect(out).toContain(`[dim:(${formatDuration(12345)})]`)
  })

  test("omits windows that are not present", () => {
    const data: NormalizedUsage = { useBalance: false, rolling: window23 }
    const out = renderUsage(data, makeTestTheme())
    expect(out).toBeDefined()
    expect(out).toContain("[muted:5h]")
    expect(out).not.toContain("[muted:wk]")
    expect(out).not.toContain("[muted:mo]")
  })

  test("returns undefined when no windows", () => {
    const data: NormalizedUsage = { useBalance: false }
    expect(renderUsage(data, makeTestTheme())).toBeUndefined()
  })

  test("appends update time when updatedAt is present", () => {
    const data: NormalizedUsage = {
      useBalance: false,
      updatedAt: Temporal.Now.instant().epochMilliseconds,
      rolling: window23,
    }
    const out = renderUsage(data, makeTestTheme())
    expect(out).toMatch(/\[muted:\d{2}:\d{2}\]$/)
  })

  test("does not append update time when updatedAt is missing", () => {
    const data: NormalizedUsage = { useBalance: false, rolling: window23 }
    const out = renderUsage(data, makeTestTheme())
    expect(out).not.toMatch(/\d{2}:\d{2}$/)
  })
})

describe("renderError", () => {
  test("uses error code from UsageError", () => {
    const err = Object.assign(new Error("HTTP 401"), { code: "http401" })
    const out = renderError(err, makeTestTheme())
    expect(out).toBe(`[muted:${LABEL}:][error:<err:http401>]`)
  })

  test("falls back to 'fetch' for unknown errors", () => {
    expect(renderError(new Error("boom"), makeTestTheme())).toBe(
      `[muted:${LABEL}:][error:<err:fetch>]`,
    )
    expect(renderError("string error", makeTestTheme())).toBe(
      `[muted:${LABEL}:][error:<err:fetch>]`,
    )
    expect(renderError(null, makeTestTheme())).toBe(`[muted:${LABEL}:][error:<err:fetch>]`)
  })
})

/**
 * Tests for cookie normalization in src/config.ts
 *
 * Covers the three user-paste forms:
 *   1. Full header: "auth=Fe26.2*...; oc_locale=zh"  (passthrough)
 *   2. Single value: "Fe26.2*..."                    (auto-prefix "auth=")
 *   3. Two-segment:  "Fe26.2*...; oc_locale=zh"       (auto-prefix "auth=")
 */

import { describe, expect, test } from "bun:test"
import { normalizeCookie } from "../src/config"

describe("normalizeCookie", () => {
  test("returns undefined for empty / whitespace-only input", () => {
    expect(normalizeCookie(undefined)).toBeUndefined()
    expect(normalizeCookie("")).toBeUndefined()
    expect(normalizeCookie("   ")).toBeUndefined()
    expect(normalizeCookie("\t\n")).toBeUndefined()
  })

  test("passes through a full Cookie header unchanged", () => {
    const full = "auth=Fe26.2*abc; oc_locale=zh"
    expect(normalizeCookie(full)).toBe(full)
  })

  test("adds missing oc_locale to a full header", () => {
    expect(normalizeCookie("auth=Fe26.2*abc")).toBe("auth=Fe26.2*abc; oc_locale=en")
  })

  test("auto-prefixes 'auth=' when only the value is given", () => {
    expect(normalizeCookie("Fe26.2*abc")).toBe("auth=Fe26.2*abc; oc_locale=en")
  })

  test("auto-prefixes 'auth=' but keeps the user's oc_locale when present", () => {
    expect(normalizeCookie("Fe26.2*abc; oc_locale=zh")).toBe("auth=Fe26.2*abc; oc_locale=zh")
  })

  test("trims leading/trailing and collapses internal whitespace", () => {
    expect(normalizeCookie("  auth=Fe26.2*abc ;  oc_locale=zh  ")).toBe(
      "auth=Fe26.2*abc; oc_locale=zh",
    )
  })

  test("handles segments with extra semicolons gracefully", () => {
    // Some browsers / extensions append extra cookie attributes; we keep
    // only the auth and oc_locale parts.
    expect(normalizeCookie("Fe26.2*abc; oc_locale=zh; foo=bar")).toBe(
      "auth=Fe26.2*abc; oc_locale=zh",
    )
  })

  test("does not double-prefix if user already added 'auth=' before the value", () => {
    // If user pastes "auth=Fe26.2*abc" (no cookie name prefix in DevTools)
    // it is already in the correct form; we just add oc_locale.
    expect(normalizeCookie("auth=Fe26.2*abc")).toBe("auth=Fe26.2*abc; oc_locale=en")
  })
})

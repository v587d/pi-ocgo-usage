/**
 * Smoke tests for src/index.ts
 *
 * Verifies:
 *  - default export is a function (pi extension factory)
 *  - public re-exports are present and well-typed
 */

import { describe, expect, test } from "bun:test"
import defaultExport, {
  configFilePath,
  formatDuration,
  fromApikeyResponse,
  fromCookieResponse,
  isOpencodeGoProvider,
  LABEL,
  loadConfig,
  PROVIDER_PREFIX,
  renderError,
  renderUsage,
  UsageError,
} from "../src/index"

describe("entry point", () => {
  test("default export is a function (pi extension factory)", () => {
    expect(typeof defaultExport).toBe("function")
  })

  test("exports all expected public APIs", () => {
    expect(typeof renderUsage).toBe("function")
    expect(typeof renderError).toBe("function")
    expect(typeof formatDuration).toBe("function")
    expect(typeof isOpencodeGoProvider).toBe("function")
    expect(typeof fromCookieResponse).toBe("function")
    expect(typeof fromApikeyResponse).toBe("function")
    expect(typeof loadConfig).toBe("function")
    expect(typeof configFilePath).toBe("function")
    expect(UsageError).toBeDefined()
    expect(LABEL).toBe("OC.go")
    expect(PROVIDER_PREFIX).toBe("opencode-go")
  })
})

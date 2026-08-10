/**
 * Tests for src/api.ts
 *
 * - `fromCookieResponse` and `fromApikeyResponse` are pure functions and
 *   fully covered here.
 * - HTTP-fetching functions are tested with a mocked `fetch` global.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fromApikeyResponse, fromCookieResponse, UsageError } from "../src/api"
import type { OCGoConfig } from "../src/types"
import apikeyUsageEmpty from "./fixtures/apikey-usage-empty.json"
import apikeyUsageOk from "./fixtures/apikey-usage-ok.json"
import apikeyUsageRateLimited from "./fixtures/apikey-usage-rate-limited.json"
import cookieUsageMalformed from "./fixtures/cookie-usage-malformed.json"
import cookieUsageOk from "./fixtures/cookie-usage-ok.json"
import cookieUsagePartial from "./fixtures/cookie-usage-partial.json"
import cookieUsageRateLimited from "./fixtures/cookie-usage-rate-limited.json"

const baseConfig: OCGoConfig = {
  cookie: "auth=test-cookie; oc_locale=zh",
  workspaceID: "wrk_TEST",
  baseUrl: "https://example.test",
  cacheTTL: 300,
  mode: "auto",
  timeoutMs: 5000,
}

// ============================================================================
// Cookie response adapter
// ============================================================================

describe("fromCookieResponse", () => {
  test("normalizes all three windows from a healthy response", () => {
    const out = fromCookieResponse(cookieUsageOk)
    expect(out.useBalance).toBe(false)
    expect(out.rolling).toEqual({
      kind: "rolling",
      percent: 23,
      resetInSec: 12345,
      status: "ok",
    })
    expect(out.weekly).toEqual({
      kind: "weekly",
      percent: 30,
      resetInSec: 604800,
      status: "ok",
    })
    expect(out.monthly).toEqual({
      kind: "monthly",
      percent: 12,
      resetInSec: 2592000,
      status: "ok",
    })
  })

  test("maps rate-limited status correctly", () => {
    const out = fromCookieResponse(cookieUsageRateLimited)
    expect(out.rolling?.status).toBe("rate-limited")
    expect(out.rolling?.percent).toBe(100)
    expect(out.useBalance).toBe(true)
  })

  test("omits missing windows (e.g. new account without weekly)", () => {
    const out = fromCookieResponse(cookieUsagePartial)
    expect(out.rolling).toBeDefined()
    expect(out.weekly).toBeUndefined()
    expect(out.monthly).toBeUndefined()
  })

  test("clamps percent into [0, 100] and parses non-numeric gracefully", () => {
    const out = fromCookieResponse(cookieUsageMalformed)
    // rolling: percent 23.7 -> floor 23; resetInSec NaN -> 0
    expect(out.rolling?.percent).toBe(23)
    expect(out.rolling?.resetInSec).toBe(0)
    // weekly: null -> undefined
    expect(out.weekly).toBeUndefined()
    // monthly: percent 200 -> clamped 100; status "unknown-status" -> "ok"
    expect(out.monthly?.percent).toBe(100)
    expect(out.monthly?.status).toBe("ok")
  })
})

// ============================================================================
// Apikey response adapter (PR #16513 shape)
// ============================================================================

describe("fromApikeyResponse", () => {
  test("computes percent from usage/limit and resetInSec from resetsAt", () => {
    const out = fromApikeyResponse(apikeyUsageOk)
    expect(out.useBalance).toBe(false)
    expect(out.rolling).toBeDefined()
    expect(out.rolling?.percent).toBe(23) // 2800/12000 = 0.233 -> 23
    expect(out.rolling?.status).toBe("ok")
    expect(out.weekly?.percent).toBe(30) // 9000/30000 = 0.3 -> 30
    expect(out.monthly?.percent).toBe(12) // 7200/60000 = 0.12 -> 12
    // resetInSec is computed from resetsAt - now; with 2099 fixtures it is positive
    expect(out.rolling?.resetInSec).toBeGreaterThan(0)
    expect(out.weekly?.resetInSec).toBeGreaterThan(0)
    expect(out.monthly?.resetInSec).toBeGreaterThan(0)
  })

  test("marks rate-limited when usage >= limit", () => {
    const out = fromApikeyResponse(apikeyUsageRateLimited)
    expect(out.rolling?.status).toBe("rate-limited")
    expect(out.rolling?.percent).toBe(100)
    // weekly: 15000/30000 = 50%
    expect(out.weekly?.status).toBe("ok")
    expect(out.weekly?.percent).toBe(50)
    expect(out.useBalance).toBe(true)
  })

  test("returns empty usage for empty object", () => {
    const out = fromApikeyResponse(apikeyUsageEmpty)
    expect(out.useBalance).toBe(false)
    expect(out.rolling).toBeUndefined()
    expect(out.weekly).toBeUndefined()
    expect(out.monthly).toBeUndefined()
  })

  test("clamps percent to 100 when usage > limit", () => {
    const out = fromApikeyResponse({
      rollingUsage: {
        usage: 999_999,
        limit: 100,
        window: 18_000_000,
        resetsAt: "2099-01-01T00:00:00.000Z",
      },
    })
    expect(out.rolling?.percent).toBe(100)
  })

  test("handles limit=0 (returns percent=0 instead of NaN)", () => {
    const out = fromApikeyResponse({
      rollingUsage: {
        usage: 100,
        limit: 0,
        window: 18_000_000,
        resetsAt: "2099-01-01T00:00:00.000Z",
      },
    })
    expect(out.rolling?.percent).toBe(0)
    expect(out.rolling?.status).toBe("rate-limited") // usage >= 0 == limit
  })
})

// ============================================================================
// HTTP fetch — mocked
// ============================================================================

describe("UsageError", () => {
  test("carries a code", () => {
    const e = new UsageError("boom", "http500")
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe("http500")
    expect(e.message).toBe("boom")
    expect(e.name).toBe("UsageError")
  })
})

describe("fetchViaCookie (mocked fetch)", () => {
  const originalFetch = globalThis.fetch
  let lastUrl: string | undefined
  let lastInit: RequestInit | undefined

  beforeEach(() => {
    lastUrl = undefined
    lastInit = undefined
    globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
      lastUrl = String(url)
      lastInit = init
      return new Response(JSON.stringify(cookieUsageOk), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("hits the expected endpoint with Cookie header", async () => {
    const { fetchViaCookie } = await import("../src/api")
    const data = await fetchViaCookie(baseConfig)
    expect(data.rolling?.percent).toBe(23)
    expect(lastUrl).toBe(
      "https://example.test/_server?id=lite.subscription.get&workspaceID=wrk_TEST",
    )
    expect(lastInit?.headers).toMatchObject({
      Cookie: "auth=test-cookie; oc_locale=zh",
      Accept: "application/json",
    })
  })

  test("throws noconfig when cookie missing", async () => {
    const { fetchViaCookie } = await import("../src/api")
    expect(fetchViaCookie({ ...baseConfig, cookie: undefined })).rejects.toMatchObject({
      code: "noconfig",
    })
  })

  test("throws http401 on 4xx", async () => {
    globalThis.fetch = mock(
      async () => new Response("nope", { status: 401 }),
    ) as unknown as typeof fetch
    const { fetchViaCookie } = await import("../src/api")
    expect(fetchViaCookie(baseConfig)).rejects.toMatchObject({ code: "http401" })
  })

  test("throws badjson on non-JSON success", async () => {
    globalThis.fetch = mock(
      async () => new Response("<html>not json</html>", { status: 200 }),
    ) as unknown as typeof fetch
    const { fetchViaCookie } = await import("../src/api")
    expect(fetchViaCookie(baseConfig)).rejects.toMatchObject({ code: "badjson" })
  })

  test("throws fetch on network error", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    const { fetchViaCookie } = await import("../src/api")
    expect(fetchViaCookie(baseConfig)).rejects.toMatchObject({ code: "fetch" })
  })

  test("throws timeout on abort", async () => {
    globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
      // Honor abort by rejecting with AbortError
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted")
          err.name = "AbortError"
          reject(err)
        })
      })
    }) as unknown as typeof fetch
    const { fetchViaCookie } = await import("../src/api")
    // Use a small timeout to keep tests fast
    expect(fetchViaCookie({ ...baseConfig, timeoutMs: 10 })).rejects.toMatchObject({
      code: "timeout",
    })
  })
})

describe("fetchViaApikey (mocked fetch)", () => {
  const originalFetch = globalThis.fetch
  let lastUrl: string | undefined
  let lastInit: RequestInit | undefined

  beforeEach(() => {
    lastUrl = undefined
    lastInit = undefined
    globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
      lastUrl = String(url)
      lastInit = init
      return new Response(JSON.stringify(apikeyUsageOk), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("hits the expected endpoint with Authorization header", async () => {
    const { fetchViaApikey } = await import("../src/api")
    const data = await fetchViaApikey(baseConfig, "sk-test")
    expect(data.rolling?.percent).toBe(23)
    expect(lastUrl).toBe("https://example.test/zen/go/v1/usage")
    expect(lastInit?.headers).toMatchObject({
      Authorization: "Bearer sk-test",
      Accept: "application/json",
    })
  })

  test("throws http404 on 4xx", async () => {
    globalThis.fetch = mock(
      async () => new Response("nope", { status: 404 }),
    ) as unknown as typeof fetch
    const { fetchViaApikey } = await import("../src/api")
    expect(fetchViaApikey(baseConfig, "sk-test")).rejects.toMatchObject({ code: "http404" })
  })
})

// ============================================================================
// Orchestrator: fetchUsage with various modes
// ============================================================================

describe("fetchUsage orchestrator", () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }
  const ENV_VARS = [
    "OPENCODE_GO_COOKIE",
    "OPENCODE_GO_WORKSPACE_ID",
    "OPENCODE_GO_BASE_URL",
    "OPENCODE_GO_CACHE_TTL",
    "OPENCODE_GO_MODE",
    "OPENCODE_GO_TIMEOUT_MS",
  ]
  function clearEnv() {
    for (const v of ENV_VARS) delete process.env[v]
  }
  function restoreEnv() {
    for (const v of ENV_VARS) {
      if (originalEnv[v] !== undefined) process.env[v] = originalEnv[v]
      else delete process.env[v]
    }
  }

  beforeEach(() => {
    clearEnv()
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(cookieUsageOk), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    restoreEnv()
  })

  test("throws noconfig when nothing is configured", async () => {
    const { fetchUsage } = await import("../src/api")
    const registry = {
      getApiKeyForProvider: mock(async (): Promise<string | undefined> => undefined),
    }
    expect(fetchUsage(registry)).rejects.toMatchObject({ code: "noconfig" })
  })

  test("auto mode with cookie set: uses cookie path", async () => {
    process.env.OPENCODE_GO_COOKIE = "auth=test"
    process.env.OPENCODE_GO_WORKSPACE_ID = "wrk_X"
    const { fetchUsage } = await import("../src/api")
    const registry = {
      getApiKeyForProvider: mock(async (): Promise<string | undefined> => "sk-should-not-be-used"),
    }
    const data = await fetchUsage(registry)
    expect(data.rolling?.percent).toBe(23)
    // The registry.getApiKeyForProvider should not have been called
    expect(registry.getApiKeyForProvider).not.toHaveBeenCalled()
  })

  test("cookie mode propagates cookie error", async () => {
    process.env.OPENCODE_GO_COOKIE = "auth=test"
    process.env.OPENCODE_GO_WORKSPACE_ID = "wrk_X"
    process.env.OPENCODE_GO_MODE = "cookie"
    globalThis.fetch = mock(
      async () => new Response("nope", { status: 500 }),
    ) as unknown as typeof fetch
    const { fetchUsage } = await import("../src/api")
    const registry = {
      getApiKeyForProvider: mock(async (): Promise<string | undefined> => undefined),
    }
    expect(fetchUsage(registry)).rejects.toMatchObject({ code: "http500" })
  })

  test("apikey mode calls getApiKeyForProvider and hits apikey endpoint", async () => {
    process.env.OPENCODE_GO_MODE = "apikey"
    // Return the apikey-shaped fixture so the adapter can parse it
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(apikeyUsageOk), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch
    const { fetchUsage } = await import("../src/api")
    const registry = {
      getApiKeyForProvider: mock(async (): Promise<string | undefined> => "sk-fake"),
    }
    const data = await fetchUsage(registry)
    expect(data.rolling?.percent).toBe(23)
    expect(registry.getApiKeyForProvider).toHaveBeenCalledWith("opencode-go")
  })

  test("apikey mode throws noconfig when no key available", async () => {
    process.env.OPENCODE_GO_MODE = "apikey"
    const { fetchUsage } = await import("../src/api")
    const registry = {
      getApiKeyForProvider: mock(async (): Promise<string | undefined> => undefined),
    }
    expect(fetchUsage(registry)).rejects.toMatchObject({ code: "noconfig" })
  })

  test("apikey mode rejects proxy-managed sentinel", async () => {
    process.env.OPENCODE_GO_MODE = "apikey"
    const { fetchUsage } = await import("../src/api")
    const registry = {
      getApiKeyForProvider: mock(async (): Promise<string | undefined> => "proxy-managed"),
    }
    expect(fetchUsage(registry)).rejects.toMatchObject({ code: "noconfig" })
  })

  test("apikey mode rejects empty key", async () => {
    process.env.OPENCODE_GO_MODE = "apikey"
    const { fetchUsage } = await import("../src/api")
    const registry = {
      getApiKeyForProvider: mock(async (): Promise<string | undefined> => ""),
    }
    expect(fetchUsage(registry)).rejects.toMatchObject({ code: "noconfig" })
  })

  test("safeGetApikey swallows registry exceptions", async () => {
    process.env.OPENCODE_GO_MODE = "apikey"
    const { fetchUsage } = await import("../src/api")
    const registry = {
      getApiKeyForProvider: mock(async (): Promise<string | undefined> => {
        throw new Error("registry down")
      }),
    }
    expect(fetchUsage(registry)).rejects.toMatchObject({ code: "noconfig" })
  })
})

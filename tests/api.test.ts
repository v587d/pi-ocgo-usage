/**
 * Tests for src/api.ts
 *
 * - `fromSSRHTML` (cookie path) and `fromApikeyResponse` are pure functions and
 *   fully covered here.
 * - HTTP-fetching functions are tested with a mocked `fetch` global.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { OCGoConfig } from "../src/types"
import apikeyUsageEmpty from "./fixtures/apikey-usage-empty.json"
import apikeyUsageOk from "./fixtures/apikey-usage-ok.json"
import apikeyUsageRateLimited from "./fixtures/apikey-usage-rate-limited.json"

// The fetchUsage orchestrator tests call loadConfig() internally, which reads
// the real config file at ~/.pi/agent/pi-ocgo-usage.json via homedir(). Point
// homedir() at an empty temp dir so tests never see the user's real config
// (same pattern as tests/config.test.ts). This must happen before the first
// import of ../src/api, hence the top-level await below.
const fakeHome = mkdtempSync(join(tmpdir(), "pi-ocgo-usage-test-"))
mock.module("node:os", () => {
  const real = require("node:os") as typeof import("node:os")
  return { ...real, homedir: () => fakeHome }
})
const { fromApikeyResponse, fromSSRHTML, parseDurationToSec, UsageError } = await import(
  "../src/api"
)

const baseConfig: OCGoConfig = {
  cookie: "auth=test-cookie; oc_locale=zh",
  workspaceID: "wrk_TEST",
  baseUrl: "https://example.test",
  cacheTTL: 300,
  mode: "auto",
  timeoutMs: 5000,
}

// ============================================================================
// Cookie SSR HTML adapter
// ============================================================================

describe("fromSSRHTML", () => {
  test("extracts all three usage windows from a realistic page", () => {
    const html = `
      <html><body>
        <div data-slot="usage-item">
          <div data-slot="usage-header"><span data-slot="usage-label">Rolling Usage</span>
          <span data-slot="usage-value"><!--$-->68<!--/-->%</span></div>
          <div data-slot="progress"><div style="width:68%"></div></div>
          <span data-slot="reset-time"><!--$-->Resets in<!--/--> <!--$-->2 hours 29 minutes<!--/--></span>
        </div></div>
        <div data-slot="usage-item">
          <div data-slot="usage-header"><span data-slot="usage-label">Weekly Usage</span>
          <span data-slot="usage-value"><!--$-->27<!--/-->%</span></div>
          <span data-slot="reset-time"><!--$-->Resets in<!--/--> <!--$-->6 days 21 hours<!--/--></span>
        </div></div>
        <div data-slot="usage-item">
          <div data-slot="usage-header"><span data-slot="usage-label">Monthly Usage</span>
          <span data-slot="usage-value"><!--$-->5<!--/-->%</span></div>
          <span data-slot="reset-time"><!--$-->Resets in<!--/--> <!--$-->25 days<!--/--></span>
        </div></div>
      </body></html>
    `
    const out = fromSSRHTML(html)
    expect(out.rolling?.percent).toBe(68)
    expect(out.weekly?.percent).toBe(27)
    expect(out.monthly?.percent).toBe(5)
    expect(out.rolling?.resetInSec).toBe(2 * 3600 + 29 * 60)
    expect(out.weekly?.resetInSec).toBe(6 * 86400 + 21 * 3600)
    expect(out.monthly?.resetInSec).toBe(25 * 86400)
    expect(out.rolling?.status).toBe("ok")
  })

  test("marks rate-limited when percent >= 100", () => {
    const html = `
      <div data-slot="usage-item">
        <div data-slot="usage-label">Rolling Usage</div>
        <span data-slot="usage-value"><!--$-->100<!--/-->%</span>
        <span data-slot="reset-time"><!--$-->Resets in<!--/-->1 hour<!--/--></span>
      </div></div>
    `
    const out = fromSSRHTML(html)
    expect(out.rolling?.status).toBe("rate-limited")
    expect(out.rolling?.percent).toBe(100)
  })

  test("omits windows that are not present", () => {
    const html = `
      <div data-slot="usage-item">
        <div data-slot="usage-label">Rolling Usage</div>
        <span data-slot="usage-value"><!--$-->15<!--/-->%</span>
        <span data-slot="reset-time">Resets in 1 hour</span>
      </div></div>
    `
    const out = fromSSRHTML(html)
    expect(out.rolling).toBeDefined()
    expect(out.weekly).toBeUndefined()
    expect(out.monthly).toBeUndefined()
  })

  test("returns empty usage for HTML with no usage blocks", () => {
    const out = fromSSRHTML("<html><body>no usage here</body></html>")
    expect(out.rolling).toBeUndefined()
    expect(out.weekly).toBeUndefined()
    expect(out.monthly).toBeUndefined()
    expect(out.useBalance).toBe(false)
  })

  test("detects useBalance from page content", () => {
    const html = `
      <div>useBalance</div>
      <div data-slot="usage-item">
        <div data-slot="usage-label">Rolling Usage</div>
        <span data-slot="usage-value"><!--$-->10<!--/-->%</span>
      </div></div>
    `
    expect(fromSSRHTML(html).useBalance).toBe(true)
  })
})

describe("parseDurationToSec", () => {
  test("handles common English phrases", () => {
    expect(parseDurationToSec("2 hours 29 minutes")).toBe(2 * 3600 + 29 * 60)
    expect(parseDurationToSec("45 minutes")).toBe(45 * 60)
    expect(parseDurationToSec("5 days")).toBe(5 * 86400)
    expect(parseDurationToSec("1 hour")).toBe(3600)
    expect(parseDurationToSec("30 seconds")).toBe(30)
    expect(parseDurationToSec("2 weeks")).toBe(2 * 604800)
  })

  test("returns 0 on empty / unparseable input", () => {
    expect(parseDurationToSec("")).toBe(0)
    expect(parseDurationToSec("nothing")).toBe(0)
  })

  test("is tolerant of extra whitespace", () => {
    expect(parseDurationToSec("  3  days  ")).toBe(3 * 86400)
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

describe("fetchViaCookie (mocked fetch, SSR HTML scrape)", () => {
  const originalFetch = globalThis.fetch
  let lastUrl: string | undefined
  let lastInit: RequestInit | undefined

  const SSR_HTML = `
    <div data-slot="usage-item">
      <span data-slot="usage-label">Rolling Usage</span>
      <span data-slot="usage-value"><!--$-->23<!--/-->%</span>
      <span data-slot="reset-time"><!--$-->Resets in<!--/-->2 hours<!--/--></span>
    </div></div>
    <div data-slot="usage-item">
      <span data-slot="usage-label">Weekly Usage</span>
      <span data-slot="usage-value"><!--$-->30<!--/-->%</span>
      <span data-slot="reset-time"><!--$-->Resets in<!--/-->3 days<!--/--></span>
    </div></div>
  `

  beforeEach(() => {
    lastUrl = undefined
    lastInit = undefined
    globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
      lastUrl = String(url)
      lastInit = init
      return new Response(SSR_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("hits /workspace/<wrk>/go with Cookie header", async () => {
    const { fetchViaCookie } = await import("../src/api")
    const data = await fetchViaCookie(baseConfig)
    expect(data.rolling?.percent).toBe(23)
    expect(data.weekly?.percent).toBe(30)
    expect(lastUrl).toBe("https://example.test/workspace/wrk_TEST/go")
    expect(lastInit?.headers).toMatchObject({
      Cookie: "auth=test-cookie; oc_locale=zh",
      Accept: "text/html",
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

  test("throws fetch on network error", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    const { fetchViaCookie } = await import("../src/api")
    expect(fetchViaCookie(baseConfig)).rejects.toMatchObject({ code: "fetch" })
  })

  test("throws timeout on abort", async () => {
    globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted")
          err.name = "AbortError"
          reject(err)
        })
      })
    }) as unknown as typeof fetch
    const { fetchViaCookie } = await import("../src/api")
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
        new Response(
          `<div data-slot="usage-item">
             <span data-slot="usage-label">Rolling Usage</span>
             <span data-slot="usage-value"><!--$-->23<!--/-->%</span>
             <span data-slot="reset-time"><!--$-->Resets in<!--/-->2 hours<!--/--></span>
           </div></div>`,
          { status: 200, headers: { "Content-Type": "text/html" } },
        ),
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

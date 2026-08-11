/**
 * Tests for src/usage-cache.ts — the fire-and-forget cache.
 *
 * Proves the core requirement: event handlers never block message flow.
 * Every refresh returns synchronously; the network fetch (if any) runs in
 * the background and only touches the footer when it settles.
 *
 * TTL control is exercised via a subclass overriding the protected `ttlMs`
 * getter (no module mocking — bun shares one process across test files, so
 * mock.module would leak into config.test.ts / api.test.ts).
 */

import { describe, expect, test } from "bun:test"
import type { ExtensionContext } from "@earendil-works/pi-coding-agent"
import defaultExport from "../src/index"
import type { NormalizedUsage } from "../src/types"
import { UsageCache } from "../src/usage-cache"

const KEY = "opencode-go-usage"

const USAGE: NormalizedUsage = {
  useBalance: false,
  rolling: { kind: "rolling", percent: 42, resetInSec: 300, status: "ok" },
}

// --- helpers ---

const theme = { fg: (_c: string, t: string) => t } as unknown as never

function makeCtx(): { ctx: ExtensionContext; statuses: Map<string, string | undefined> } {
  const statuses = new Map<string, string | undefined>()
  const ctx = {
    ui: {
      theme,
      setStatus: (key: string, text: string | undefined) => {
        statuses.set(key, text)
      },
    },
    modelRegistry: { getApiKeyForProvider: async () => undefined },
  } as unknown as ExtensionContext
  return { ctx, statuses }
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Subclass with a controllable TTL for tests. */
class TtlCache extends UsageCache {
  constructor(
    fetchFn: () => Promise<NormalizedUsage>,
    ttlSeconds: number,
    failureCooldownMs = 60_000,
  ) {
    super(
      KEY,
      fetchFn,
      () => "RENDERED",
      () => "ERROR",
      failureCooldownMs,
    )
    this.ttlSeconds = ttlSeconds
  }

  private ttlSeconds: number

  protected override get ttlMs(): number {
    return this.ttlSeconds * 1000
  }
}

/** Subclass that exposes the protected ttlMs for the config-wiring test. */
class ExposedCache extends UsageCache {
  constructor() {
    super(
      KEY,
      async () => USAGE,
      () => "",
      () => "",
    )
  }

  get ttl(): number {
    return this.ttlMs
  }
}

/** Let pending microtasks / timers settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe("UsageCache", () => {
  test("refresh returns immediately; footer applies only when the fetch settles (fire-and-forget)", async () => {
    const gate = deferred<NormalizedUsage>()
    let calls = 0
    const cache = new TtlCache(() => {
      calls++
      return gate.promise
    }, 300)
    const { ctx, statuses } = makeCtx()

    cache.refresh(ctx) // synchronous — the handler returns before the fetch
    await flush()
    expect(calls).toBe(1)
    expect(statuses.get(KEY)).toBeUndefined() // fetch still in flight, nothing rendered

    gate.resolve(USAGE)
    await flush()
    expect(statuses.get(KEY)).toBe("RENDERED")
    expect(calls).toBe(1)
  })

  test("concurrent refreshes share a single in-flight fetch", async () => {
    const gate = deferred<NormalizedUsage>()
    let calls = 0
    const cache = new TtlCache(() => {
      calls++
      return gate.promise
    }, 300)
    const { ctx } = makeCtx()

    cache.refresh(ctx)
    await flush()
    cache.refresh(ctx) // second refresh while the first fetch is still in flight
    await flush()
    expect(calls).toBe(1)

    gate.resolve(USAGE)
    await flush()
  })

  test("fresh cache re-renders without a second fetch (TTL respected)", async () => {
    let calls = 0
    const cache = new TtlCache(async () => {
      calls++
      return USAGE
    }, 300)
    const { ctx, statuses } = makeCtx()

    cache.refresh(ctx)
    await flush()
    expect(calls).toBe(1)

    cache.refresh(ctx) // within TTL -> re-render, no network
    await flush()
    expect(calls).toBe(1)
    expect(statuses.get(KEY)).toBe("RENDERED")
  })

  test("expired TTL triggers a new fetch", async () => {
    let calls = 0
    const cache = new TtlCache(async () => {
      calls++
      return USAGE
    }, 0) // stale immediately
    const { ctx } = makeCtx()

    cache.refresh(ctx)
    await flush()
    cache.refresh(ctx)
    await flush()
    expect(calls).toBe(2)
  })

  test("failed fetch enters a cooldown instead of retrying on every refresh", async () => {
    let calls = 0
    const cache = new TtlCache(
      async () => {
        calls++
        throw new Error("boom")
      },
      300,
      100,
    )
    const { ctx, statuses } = makeCtx()

    cache.refresh(ctx)
    await flush()
    expect(calls).toBe(1)
    expect(statuses.get(KEY)).toBe("ERROR")

    cache.refresh(ctx) // inside cooldown -> skipped
    await flush()
    expect(calls).toBe(1)

    await new Promise((r) => setTimeout(r, 120)) // cooldown expires
    cache.refresh(ctx)
    await flush()
    expect(calls).toBe(2)
  })

  test("clear() clears the footer", async () => {
    const cache = new TtlCache(async () => USAGE, 300)
    const { ctx, statuses } = makeCtx()

    cache.refresh(ctx)
    await flush()
    expect(statuses.get(KEY)).toBe("RENDERED")

    cache.clear(ctx)
    expect(statuses.get(KEY)).toBeUndefined()
  })

  test("clear() discards in-flight results (session shutdown / switch away)", async () => {
    const gate = deferred<NormalizedUsage>()
    const cache = new TtlCache(() => gate.promise, 300)
    const { ctx, statuses } = makeCtx()

    cache.refresh(ctx)
    await flush()
    cache.clear(ctx)
    gate.resolve(USAGE) // late result must be discarded
    await flush()
    expect(statuses.get(KEY)).toBeUndefined()
  })

  test("a stale ctx whose setStatus throws never crashes refresh", async () => {
    const cache = new TtlCache(async () => USAGE, 300)
    const ctx = {
      ui: {
        theme,
        setStatus: () => {
          throw new Error("ctx invalidated")
        },
      },
      modelRegistry: { getApiKeyForProvider: async () => undefined },
    } as unknown as ExtensionContext

    expect(() => cache.refresh(ctx)).not.toThrow()
    await flush()
  })

  test("default TTL follows the cacheTTL config (bug fix: no more dead knob)", () => {
    const envKey = "OPENCODE_GO_CACHE_TTL"
    const previous = process.env[envKey]
    try {
      process.env[envKey] = "120"
      expect(new ExposedCache().ttl).toBe(120_000)
      delete process.env[envKey]
      expect(new ExposedCache().ttl).toBe(300_000)
    } finally {
      if (previous === undefined) delete process.env[envKey]
      else process.env[envKey] = previous
    }
  })
})

describe("extension event wiring (non-blocking)", () => {
  function makePi(): {
    handlers: Map<string, (event: unknown, ctx: unknown) => unknown>
  } {
    const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>()
    const pi = {
      on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => {
        handlers.set(event, handler)
      },
      registerCommand: () => {},
    }
    ;(defaultExport as unknown as (pi: unknown) => void)(pi)
    return { handlers }
  }

  function requireHandler(
    handlers: Map<string, (event: unknown, ctx: unknown) => unknown>,
    event: string,
  ): (event: unknown, ctx: unknown) => unknown {
    const handler = handlers.get(event)
    if (!handler) throw new Error(`missing handler: ${event}`)
    return handler
  }

  test("all four lifecycle handlers are registered", () => {
    const { handlers } = makePi()
    expect(handlers.has("session_start")).toBe(true)
    expect(handlers.has("model_select")).toBe(true)
    expect(handlers.has("turn_end")).toBe(true)
    expect(handlers.has("session_shutdown")).toBe(true)
  })

  test("handlers return synchronously for non-matching models (no fetch, no await)", () => {
    const { handlers } = makePi()
    const awayCtx = {
      model: { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude" },
      ui: { theme, setStatus: () => {} },
    }

    // All return undefined (not a Promise): pi's `await handler(...)` resolves
    // instantly, so message delivery is never gated on this extension.
    expect(requireHandler(handlers, "session_start")({}, awayCtx)).toBeUndefined()
    expect(requireHandler(handlers, "turn_end")({}, awayCtx)).toBeUndefined()
    expect(
      requireHandler(handlers, "model_select")({ model: awayCtx.model }, awayCtx),
    ).toBeUndefined()
    expect(requireHandler(handlers, "session_shutdown")({}, awayCtx)).toBeUndefined()
  })

  test("switching away from opencode-go clears the footer synchronously", () => {
    const { handlers } = makePi()
    const statuses = new Map<string, string | undefined>()
    const awayCtx = {
      model: { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude" },
      ui: {
        theme,
        setStatus: (key: string, text: string | undefined) => {
          statuses.set(key, text)
        },
      },
    }

    requireHandler(handlers, "model_select")({ model: awayCtx.model }, awayCtx)
    expect(statuses.get(KEY)).toBeUndefined()
  })
})

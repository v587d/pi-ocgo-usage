/**
 * Tests for src/config.ts
 *
 * We exercise loadConfig by manipulating environment variables and a
 * temporary config file. The real config file at
 * `~/.pi/agent/pi-ocgo-usage.json` is NOT touched.
 *
 * Note: on Linux, `homedir()` from node:os does not honor $HOME (it uses
 * getuid() + /etc/passwd). To mock the home directory we use bun:test's
 * `mock.module` to swap node:os with a fake that returns our temp dir.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ENV_VARS = [
  "OPENCODE_GO_COOKIE",
  "OPENCODE_GO_WORKSPACE_ID",
  "OPENCODE_GO_BASE_URL",
  "OPENCODE_GO_CACHE_TTL",
  "OPENCODE_GO_MODE",
  "OPENCODE_GO_TIMEOUT_MS",
]

function clearEnv(): void {
  for (const v of ENV_VARS) delete process.env[v]
}

// Helper: load src/config.ts with a fake `homedir()` returning `fakeHome`.
async function loadConfigWithFakeHome<T>(fakeHome: string, fn: () => T): Promise<T> {
  mock.module("node:os", () => {
    const real = require("node:os") as typeof import("node:os")
    return { ...real, homedir: () => fakeHome }
  })
  try {
    return fn()
  } finally {
    mock.restore()
  }
}

describe("loadConfig (env only)", () => {
  beforeEach(() => clearEnv())
  afterEach(() => clearEnv())

  test("returns built-in defaults when nothing is set", async () => {
    await loadConfigWithFakeHome("/nonexistent/path/that/does/not/exist", () => {
      const cfg = loadConfig()
      expect(cfg.baseUrl).toBe("https://opencode.ai")
      expect(cfg.cacheTTL).toBe(300)
      expect(cfg.mode).toBe("auto")
      expect(cfg.timeoutMs).toBe(10_000)
      expect(cfg.cookie).toBeUndefined()
      expect(cfg.workspaceID).toBeUndefined()
    })
  })

  test("reads from env vars", () => {
    process.env.OPENCODE_GO_COOKIE = "auth=env-cookie"
    process.env.OPENCODE_GO_WORKSPACE_ID = "wrk_ENV"
    process.env.OPENCODE_GO_BASE_URL = "https://env.test"
    process.env.OPENCODE_GO_CACHE_TTL = "600"
    process.env.OPENCODE_GO_MODE = "cookie"
    process.env.OPENCODE_GO_TIMEOUT_MS = "15000"

    const cfg = loadConfig()
    expect(cfg.cookie).toBe("auth=env-cookie")
    expect(cfg.workspaceID).toBe("wrk_ENV")
    expect(cfg.baseUrl).toBe("https://env.test")
    expect(cfg.cacheTTL).toBe(600)
    expect(cfg.mode).toBe("cookie")
    expect(cfg.timeoutMs).toBe(15_000)
  })

  test("clamps cacheTTL to [60, 3600]", () => {
    process.env.OPENCODE_GO_CACHE_TTL = "10"
    expect(loadConfig().cacheTTL).toBe(60)

    process.env.OPENCODE_GO_CACHE_TTL = "99999"
    expect(loadConfig().cacheTTL).toBe(3600)
  })

  test("ignores invalid mode", () => {
    process.env.OPENCODE_GO_MODE = "garbage"
    expect(loadConfig().mode).toBe("auto")
  })

  test("falls back to defaults for invalid numbers", () => {
    process.env.OPENCODE_GO_CACHE_TTL = "not-a-number"
    process.env.OPENCODE_GO_TIMEOUT_MS = "also-not"
    const cfg = loadConfig()
    expect(cfg.cacheTTL).toBe(300)
    expect(cfg.timeoutMs).toBe(10_000)
  })
})

describe("loadConfig (file)", () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

  test("env wins over file when both set", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "ocgo-"))
    try {
      mkdirSync(join(tmp, ".pi", "agent"), { recursive: true })
      writeFileSync(
        join(tmp, ".pi", "agent", "pi-ocgo-usage.json"),
        JSON.stringify({
          cookie: "auth=file-cookie",
          workspaceID: "wrk_FILE",
          cacheTTL: 120,
        }),
        "utf8",
      )

      await loadConfigWithFakeHome(tmp, () => {
        // File values apply when no env
        clearEnv()
        let cfg = loadConfig()
        expect(cfg.cookie).toBe("auth=file-cookie")
        expect(cfg.workspaceID).toBe("wrk_FILE")
        expect(cfg.cacheTTL).toBe(120)

        // Env wins when set
        process.env.OPENCODE_GO_COOKIE = "auth=env-cookie"
        cfg = loadConfig()
        expect(cfg.cookie).toBe("auth=env-cookie")
        // workspaceID is still from file since not overridden
        expect(cfg.workspaceID).toBe("wrk_FILE")
      })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  test("silently ignores malformed file", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "ocgo-"))
    try {
      mkdirSync(join(tmp, ".pi", "agent"), { recursive: true })
      writeFileSync(join(tmp, ".pi", "agent", "pi-ocgo-usage.json"), "{ not valid json", "utf8")

      await loadConfigWithFakeHome(tmp, () => {
        const cfg = loadConfig()
        expect(cfg.cookie).toBeUndefined()
        expect(cfg.baseUrl).toBe("https://opencode.ai")
      })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// Imports after tests so beforeEach/afterEach work; loadConfig is sync.
import { loadConfig } from "../src/config"

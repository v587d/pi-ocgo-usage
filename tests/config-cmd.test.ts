/**
 * Tests for src/config-cmd.ts
 *
 * Uses bun:test's `mock.module` to swap node:os.homedir() with a per-test
 * temp dir, so config reads/writes never touch the real user's home.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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

function clearEnv() {
  for (const v of ENV_VARS) delete process.env[v]
}

function withTempHome<T>(fn: () => T | Promise<T>): Promise<T> {
  const tmp = mkdtempSync(join(tmpdir(), "ocgo-cfg-"))
  mock.module("node:os", () => {
    const real = require("node:os") as typeof import("node:os")
    return { ...real, homedir: () => tmp }
  })
  return Promise.resolve(fn()).finally(() => {
    mock.restore()
    rmSync(tmp, { recursive: true, force: true })
  })
}

interface UiSpy {
  inputs: Array<{ title: string; prefilled: string }>
  confirms: Array<{ title: string; message: string }>
  notifications: Array<{ msg: string; level: string }>
}

function makeCtx(
  overrides: Partial<{
    input: (title: string, prefilled: string) => Promise<string | undefined>
    confirm: (title: string, message: string) => Promise<boolean>
    notify: (msg: string, level: string) => void
    modelRegistry: { getApiKeyForProvider: (id: string) => Promise<string | undefined> }
    theme: unknown
  }> = {},
): { ctx: unknown; spy: UiSpy } {
  const spy: UiSpy = { inputs: [], confirms: [], notifications: [] }
  const ctx = {
    ui: {
      input:
        overrides.input ??
        (async (title: string, prefilled: string) => {
          spy.inputs.push({ title, prefilled })
          return undefined
        }),
      confirm:
        overrides.confirm ??
        (async (title: string, message: string) => {
          spy.confirms.push({ title, message })
          return false
        }),
      notify:
        overrides.notify ??
        ((msg: string, level: string) => {
          spy.notifications.push({ msg, level })
        }),
      theme: overrides.theme ?? { fg: (c: string, t: string) => `[${c}:${t}]` },
    },
    modelRegistry: overrides.modelRegistry ?? {
      getApiKeyForProvider: async (_id: string) => undefined,
    },
  }
  return { ctx: ctx as unknown, spy }
}

beforeEach(clearEnv)
afterEach(clearEnv)

describe("runOcgoConfig: default (no subcommand)", () => {
  test("emits summary + help notifications", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { ctx, spy } = makeCtx()
      await runOcgoConfig("", ctx as never)
      const joined = spy.notifications.map((n) => n.msg).join("\n")
      expect(joined).toContain("config file:")
      expect(joined).toContain("cookie:")
      expect(joined).toContain("workspace_id:")
      expect(joined).toContain("OPENCODE_GO_COOKIE")
    })
  })
})

describe("runOcgoConfig: status / help", () => {
  test("'status' shows the same as default", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { ctx, spy } = makeCtx()
      await runOcgoConfig("status", ctx as never)
      expect(spy.notifications.length).toBeGreaterThanOrEqual(2)
    })
  })
  test("'help' shows help", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { ctx, spy } = makeCtx()
      await runOcgoConfig("help", ctx as never)
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("Subcommands:")
    })
  })
})

describe("runOcgoConfig: set", () => {
  test("prompts for workspace_id + cookie, writes file on confirm", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { configFilePath } = await import("../src/config")
      const path = configFilePath()
      const { ctx, spy } = makeCtx({
        input: async (title, _prefilled) => {
          spy.inputs.push({ title, prefilled: _prefilled })
          if (title.includes("workspace")) return "wrk_TEST"
          return "auth=fake; oc_locale=zh"
        },
        confirm: async (title, message) => {
          spy.confirms.push({ title, message })
          return true
        },
      })
      await runOcgoConfig("set", ctx as never)
      expect(spy.inputs.length).toBe(2)
      expect(spy.confirms.length).toBe(1)
      expect(existsSync(path)).toBe(true)
      const data = JSON.parse(readFileSync(path, "utf8"))
      expect(data.workspaceID).toBe("wrk_TEST")
      expect(data.cookie).toBe("auth=fake; oc_locale=zh")
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("Saved:")
    })
  })

  test("cancels if user confirms no", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { configFilePath } = await import("../src/config")
      const path = configFilePath()
      const { ctx, spy } = makeCtx({
        input: async () => "value",
        confirm: async () => false,
      })
      await runOcgoConfig("set", ctx as never)
      expect(existsSync(path)).toBe(false)
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("Cancelled")
    })
  })

  test("cancels if workspace_id is empty", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { ctx, spy } = makeCtx({
        input: async (title) => (title.includes("workspace") ? "" : "auth=fake"),
      })
      await runOcgoConfig("set", ctx as never)
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("workspace ID is required")
    })
  })

  test("cancels if cookie is empty", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { ctx, spy } = makeCtx({
        input: async (title) => (title.includes("workspace") ? "wrk_X" : ""),
      })
      await runOcgoConfig("set", ctx as never)
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("cookie is required")
    })
  })
})

describe("runOcgoConfig: clear", () => {
  test("deletes the file on confirm", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { configFilePath } = await import("../src/config")
      const path = configFilePath()
      mkdirSync(join(path, ".."), { recursive: true })
      writeFileSync(path, '{"cookie":"x","workspaceID":"y"}', "utf8")
      expect(existsSync(path)).toBe(true)

      const { ctx, spy } = makeCtx({ confirm: async () => true })
      await runOcgoConfig("clear", ctx as never)
      expect(existsSync(path)).toBe(false)
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("Removed")
    })
  })

  test("notifies when no file exists", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { ctx, spy } = makeCtx()
      await runOcgoConfig("clear", ctx as never)
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("Nothing to clear")
    })
  })

  test("respects cancel", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { configFilePath } = await import("../src/config")
      const path = configFilePath()
      mkdirSync(join(path, ".."), { recursive: true })
      writeFileSync(path, '{"cookie":"x","workspaceID":"y"}', "utf8")

      const { ctx } = makeCtx({ confirm: async () => false })
      await runOcgoConfig("clear", ctx as never)
      expect(existsSync(path)).toBe(true)
    })
  })
})

describe("runOcgoConfig: test", () => {
  test("reports success with rendered output when fetch succeeds", async () => {
    await withTempHome(async () => {
      process.env.OPENCODE_GO_COOKIE = "auth=fake"
      process.env.OPENCODE_GO_WORKSPACE_ID = "wrk_TEST"
      const { runOcgoConfig } = await import("../src/config-cmd")
      const originalFetch = globalThis.fetch
      globalThis.fetch = mock(
        async () =>
          new Response(
            `<div data-slot="usage-item">
               <span data-slot="usage-label">Rolling Usage</span>
               <span data-slot="usage-value"><!--$-->10<!--/-->%</span>
               <span data-slot="reset-time"><!--$-->Resets in<!--/-->5 hours<!--/--></span>
             </div></div>`,
            { status: 200, headers: { "Content-Type": "text/html" } },
          ),
      ) as unknown as typeof fetch
      try {
        const { ctx, spy } = makeCtx()
        await runOcgoConfig("test", ctx as never)
        const joined = spy.notifications.map((n) => n.msg).join("\n")
        expect(joined).toMatch(/OK:.*5h.*10%/)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  test("reports failure when fetch errors", async () => {
    await withTempHome(async () => {
      process.env.OPENCODE_GO_COOKIE = "auth=fake"
      process.env.OPENCODE_GO_WORKSPACE_ID = "wrk_TEST"
      const { runOcgoConfig } = await import("../src/config-cmd")
      const originalFetch = globalThis.fetch
      globalThis.fetch = mock(
        async () => new Response("nope", { status: 401 }),
      ) as unknown as typeof fetch
      try {
        const { ctx, spy } = makeCtx()
        await runOcgoConfig("test", ctx as never)
        expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("<err:http401>")
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  test("reports noconfig when no config set", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { ctx, spy } = makeCtx()
      await runOcgoConfig("test", ctx as never)
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("<err:noconfig>")
    })
  })
})

describe("runOcgoConfig: unknown subcommand", () => {
  test("shows help", async () => {
    await withTempHome(async () => {
      const { runOcgoConfig } = await import("../src/config-cmd")
      const { ctx, spy } = makeCtx()
      await runOcgoConfig("wat", ctx as never)
      expect(spy.notifications.map((n) => n.msg).join("\n")).toContain("Unknown subcommand")
    })
  })
})

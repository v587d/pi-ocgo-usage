/**
 * Tests for src/provider.ts
 */

import { describe, expect, test } from "bun:test"
import type { ExtensionContext } from "@earendil-works/pi-coding-agent"
import { isOpencodeGoModel, isOpencodeGoProvider, PROVIDER_PREFIX } from "../src/provider"

function makeContext(model: ExtensionContext["model"]): ExtensionContext {
  // Build a minimal ExtensionContext. Only `model` is read by isOpencodeGoProvider.
  return { model } as unknown as ExtensionContext
}

describe("isOpencodeGoProvider", () => {
  test("matches when provider === 'opencode-go'", () => {
    expect(
      isOpencodeGoProvider(
        makeContext({
          provider: "opencode-go",
          id: "kimi-k3",
          name: "Kimi K3",
        } as unknown as ExtensionContext["model"]),
      ),
    ).toBe(true)
  })

  test("matches when model id has opencode-go/ prefix", () => {
    expect(
      isOpencodeGoProvider(
        makeContext({
          provider: "some-other",
          id: "opencode-go/kimi-k3",
          name: "Kimi K3",
        } as unknown as ExtensionContext["model"]),
      ),
    ).toBe(true)
  })

  test("returns false for unrelated models", () => {
    expect(
      isOpencodeGoProvider(
        makeContext({
          provider: "anthropic",
          id: "claude-sonnet-4-5",
          name: "Claude",
        } as unknown as ExtensionContext["model"]),
      ),
    ).toBe(false)
  })

  test("returns false when model is undefined", () => {
    expect(isOpencodeGoProvider(makeContext(undefined))).toBe(false)
  })

  test("returns false when model id is just 'opencode-go' without slash", () => {
    // We only treat the namespaced form (opencode-go/xxx) as a fallback match;
    // a bare "opencode-go" model id is ambiguous and should not match by id alone.
    expect(
      isOpencodeGoProvider(
        makeContext({
          provider: "anthropic",
          id: PROVIDER_PREFIX,
          name: "ambiguous",
        } as unknown as ExtensionContext["model"]),
      ),
    ).toBe(false)
  })
})

describe("isOpencodeGoModel", () => {
  test("matches when provider === 'opencode-go'", () => {
    expect(
      isOpencodeGoModel({
        provider: "opencode-go",
        id: "kimi-k3",
        name: "Kimi K3",
      } as unknown as ExtensionContext["model"]),
    ).toBe(true)
  })

  test("matches when model id has opencode-go/ prefix", () => {
    expect(
      isOpencodeGoModel({
        provider: "some-other",
        id: "opencode-go/kimi-k3",
        name: "Kimi K3",
      } as unknown as ExtensionContext["model"]),
    ).toBe(true)
  })

  test("returns false for unrelated models and undefined", () => {
    expect(
      isOpencodeGoModel({
        provider: "anthropic",
        id: "claude-sonnet-4-5",
        name: "Claude",
      } as unknown as ExtensionContext["model"]),
    ).toBe(false)
    expect(isOpencodeGoModel(undefined)).toBe(false)
  })
})

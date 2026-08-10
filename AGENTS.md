# Development Guidelines for AI Agents

This file contains important rules and guidelines for AI agents working on this project. Follow these strictly to prevent regressions.

## Code Quality and Testing Requirements

### Rule: Always Run Tests and Checks Before Completing Changes

Before considering any change complete, **you MUST** run both of the following commands:

```bash
bun run test
bun run check
```

- `bun run test`: Runs all unit tests to ensure functionality is not broken
- `bun run check`: Runs both `bun run typecheck` (TypeScript type checking) and `bun run lint` (Biome)

**Both commands must pass with zero failures and zero errors before a change can be considered complete.**

If either fails:
1. Fix all reported issues
2. Re-run both commands to verify the fixes
3. Only then consider the change complete

This prevents regressions and ensures code quality standards are maintained.

## Date/Time Handling

### Rule: Use Temporal ONLY — No Date API

**DO NOT use:** `Date.now()`, `new Date()`, `Date.parse()`, or any native `Date` API.

**ALWAYS use:** `temporal-polyfill` (`Temporal` namespace) — consistent with `pi-usage-lib`.

Exception: `Date.parse(<ISO-string>)` is acceptable for parsing `resetsAt` ISO strings returned by the PR #16513 fallback path. The result is immediately converted to seconds-since-epoch for arithmetic.

## Security Rules

### Rule: Never log or persist the cookie

The OpenCode Go cookie is a **full user session** (Iron Session / Cloudflare). Treat it with the same care as a password:

- Never print it to `console.log`, `ctx.ui.notify`, or any log
- Never include it in error messages
- Never persist it to session entries via `pi.appendEntry`
- Never emit it via `pi.events`
- Never write it to `dist/`, `coverage/`, or any committed file
- The config file (`~/.pi/agent/pi-ocgo-usage.json`) must be `chmod 600`; never commit it

### Rule: No global mutation of `process.env`

Config is loaded once per session via `loadConfig()`. Do not cache or mutate env vars in module scope.

## Project Structure

- `src/api.ts` — HTTP fetch + response adapters (cookie + apikey paths)
- `src/config.ts` — config loading (env + file)
- `src/render.ts` — themed footer rendering
- `src/provider.ts` — model provider matching
- `src/types.ts` — shared types
- `src/index.ts` — entry point, wires `createUsageExtension`
- `docs/RESEARCH.md` — research notes (do not edit without strong reason)
- `docs/SPEC.md` — implementation spec (single source of truth for behavior)

## Provider Naming

The official product is **OpenCode Go** (sometimes written `opencode-go`, model prefix `opencode-go/`). The Pi internal provider ID is `opencode-go` (verified during v0.1 development; see `docs/RESEARCH.md` § 2.4).

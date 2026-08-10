# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `pi-ocgo-usage` — a Pi coding agent extension that displays [OpenCode Go](https://opencode.ai/docs/go/) subscription usage in the footer when using an `opencode-go/*` model.
- **Cookie path (B2)**: reverse-engineered the `GET /_server?id=lite.subscription.get&workspaceID=<wrk>` endpoint from [anomalyco/opencode](https://github.com/sst/opencode/blob/dev/packages/console/app/src/routes/workspace/%5Bid%5D/go/lite-section.tsx) to display rolling/weekly/monthly usage with reset countdowns.
- **Apikey path stub (B/PR #16513)**: built-in adapter for the upcoming official `GET /zen/go/v1/usage` endpoint. Auto-activates once the PR is merged (see [anomalyco/opencode#16513](https://github.com/anomalyco/opencode/pull/16513)).
- 5-minute cache (configurable 60–3600s) to respect opencode.ai backend load.
- Color thresholds: `muted` / `warning` (≥80%) / `error` (≥90% or rate-limited), customizable via `~/.pi/agent/pi-usage-lib.json` (shared with `pi-usage-lib`).
- Graceful error display: `<err:code>` in footer on HTTP/network/parse failures; silent no-op when config is missing.
- Tested against fixtures modeled on the actual `Subscription.analyzeRollingUsage / analyzeWeeklyUsage / analyzeMonthlyUsage` output (see [anomalyco/opencode `core/src/subscription.ts`](https://github.com/sst/opencode/blob/dev/packages/console/core/src/subscription.ts)).

## [1.0.0] - 2026-08-10

### Added

- add /oc-go-config slash command
- **config**: auto-normalize pasted cookie value
- **oc-go-config test**: emphasize cookie re-login for http500
- initial release of pi-ocgo-usage
- **oc-go-config test**: show full error + diagnostic hints
- **api**: switch cookie path to SSR HTML scrape of /workspace/<wrk>/go

### Changed

- add GitHub install path to README
- rewrite README for SSR path, slash commands, PR #16513 tracking
- sync SPEC + RESEARCH with the SSR cookie path

# Nonrevy Autonomous Development Task Queue

_Last updated: 2026-07-06 05:02 UTC_

This file is the operating guide for autonomous development agents working on Nonrevy. It defines the next task queue, safety boundaries, validation gates, and priorities for moving the beta toward trustworthy private-beta readiness.

## Core operating principle

Itinerary integrity is sacred. Nonrevy may show less information when certainty is low, but it must never fabricate legs, substitute hubs for origins, hide generated legs, display stale rows as live availability, or overstate provider/weather/reliability certainty.

## Parallel-agent ownership

Parallel development now uses `docs/MULTI_AGENT_WORKFLOW.md` as the branch and merge protocol, with integration coordination defined in `docs/INTEGRATION_MANAGER.md`.

- `main` is stable production.
- `agent-dev` is the integration branch.
- Data Agent works from `agent/data` and owns provider integrations, weather, historical reliability, commercial availability, airport intelligence, caching, and diagnostics.
- Frontend Agent works from `agent/frontend` and owns `app/plan` UI, itinerary cards, mobile layout, accessibility, confidence display, and user-facing warnings.
- QA Agent works from `agent/qa` and owns regression tests, route matrix tests, API fallback tests, UI smoke tests, and merge validation.
- Docs Agent works from `agent/docs` and owns roadmap, `docs/NEXT_TASKS.md`, `docs/AGENT_REPORT.md`, known limitations, and release notes.
- Release Agent works from `agent/release` and owns changelog, beta checklist, merge readiness, and deployment checklist.
- Product/UX Agent works from `agent/product-ux` and owns mobile itinerary card readability, design system tokens, confidence badge clarity, onboarding copy, beta user feedback flow, localization/i18n readiness, accessibility checks, user-facing warning language, and premium Nonrevy visual direction.
- Shared files require integration review before merge into `agent-dev`.
- Merge candidates require validation before landing on `agent-dev`, with QA validating `agent-dev` after merge.

Initial parallel assignments:

- Data Agent next: Historical Reliability aggregation service.
- Frontend Agent next: Improve intelligence sections on itinerary cards without changing API shape.
- QA Agent next: Add route matrix smoke tests.
- Docs Agent next: Maintain beta readiness and known limitations.
- Release Agent next: Prepare private beta deployment checklist.
- Product/UX Agent next: Design system token audit, mobile itinerary card polish, i18n foundation, onboarding/beta intro screen, feedback/report issue button, confidence wording review, and empty/fallback state polish.

## Product/UX Agent task queue

Product/UX Agent tasks are docs/UI polish tracks only unless a future sprint explicitly assigns app changes. Product/UX work must not touch provider integrations, itinerary generation, or scoring, and must preserve legal wording around standby availability.

- Design system token audit.
- Mobile itinerary card polish.
- i18n foundation.
- Onboarding/beta intro screen.
- Feedback/report issue button.
- Confidence wording review.
- Empty/fallback state polish.

## Priority task queue

### P0 — Trust and correctness

1. Completed 2026-07-04: Added display-integrity normalization and regression coverage so itinerary cards/details render the full generated leg path when route text and legs diverge.
2. Completed 2026-07-04: Added shared API/UI route-framework labeling guardrails so framework results are marked as planning guidance, not live availability.
3. Completed 2026-07-04: Added shared live-availability guardrails so cached, stored, historical, testing, demo, and no-current-live rows cannot label themselves as current live availability.
4. Completed 2026-07-04: Added unknown-signal neutrality assertions and removed recovery penalties for unknown weather/delay/stranded risk.
5. Completed 2026-07-04: Added targeted endpoint-integrity regression coverage for routes that previously exposed integrity risk:
   - `BOS → SBP`
   - `LAX → OGG`
   - `SBP → NRT`

Remaining P0 work:

- Blocked 2026-07-04: Add browser-level card/details screenshot coverage for rendered itinerary integrity when the local UI harness is available. The repo currently has no browser test harness or Playwright dependency; use the display-integrity unit coverage until a UI harness is added.

### P1 — Beta readiness

1. Completed 2026-07-04: Added private-beta smoke coverage for itinerary prompt parsing, planning fallback non-live labels, watchlist matching, and alert/activity feed rendering.
2. Completed 2026-07-04: Added shared provider failure messaging for unavailable, rate-limited, partial, and stale provider states with credential redaction.
3. Completed 2026-07-04: Added beta runbook preflight checks for environment configuration, provider credentials, Supabase persistence, provider-result storage, alert safety, and Personal Testing Mode.
4. Completed 2026-07-04: Audited user-facing certainty labels for live, stored, cached, route-framework, demo/testing, placeholder, advisory, unknown, and no-current-live states.
5. Completed 2026-07-04: Added edge-case coverage for max-leg clamping, malformed airport input, strict carrier-filter evidence, max-leg itinerary building, and empty provider response summaries.
6. Completed 2026-07-06: Added insufficient-origin provider coverage diagnostics so searches do not fail when the requested origin has limited provider data; the UI now explains the coverage gap and recommends nearest supported alternate origins without fabricating flights or claiming standby availability.
7. Completed 2026-07-06: Added API-level `/api/itinerary/search` fallback regression tests for insufficient origin coverage, provider rate-limit fallback, empty-provider fallback, no fabricated itineraries, and no standby availability claims.
8. Completed 2026-07-06: Added a compact planner origin-coverage UI smoke test that renders deterministic insufficient-origin fallback guidance, verifies nearby supported airport recommendations, confirms no fabricated itineraries are returned, and checks advisory-only wording.

### P2 — Data and provider depth

1. Completed 2026-07-04: Added a provider-agnostic schedule adapter so normalized provider schedules convert into downstream flight rows without leaking provider-native response shapes.
2. Completed 2026-07-04: Added structured provider diagnostics for freshness, partial coverage, rate limits, and fallbacks in debug metadata and developer UI.
3. Completed 2026-07-04: Prepared weather intelligence source-readiness contracts for real sources while preserving the optional/advisory no-live-call contract:
   - NOAA
   - National Weather Service
   - AviationWeather.gov / METAR / TAF
   - Tomorrow.io
   - OpenWeather
   - FlightAware weather alerts
   - Completed 2026-07-04 sprint: Added an opt-in AviationWeather.gov METAR adapter with timeout, fail-closed diagnostics, conservative station mapping, advisory-only parsing, and no automatic itinerary/search/API behavior changes.
   - Completed 2026-07-04 sprint: Added server-side weather cache and feature flag infrastructure (`NONREV_ROUTE_LIVE_WEATHER_ENABLED`, cache freshness/stale policy) without connecting live METAR/weather providers or itinerary generation.
   - Completed 2026-07-04 sprint: Added server-only AviationWeather.gov METAR cache population behind `NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED`, with no client requests, no itinerary wiring, and neutral fallback when unavailable.
   - Completed 2026-07-04 sprint: Added server-side weather refresh/preload orchestration behind `NONREV_SERVER_WEATHER_REFRESH_ENABLED`, preserving advisory-only/neutral semantics and client-runtime provider blocking.
   - Completed 2026-07-04 sprint: Added an API-internal/server-action weather prefetch integration point behind `NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED`, layered on existing refresh/population flags with no itinerary or scoring changes.
   - Completed 2026-07-04 sprint: Connected fresh cached weather into the server itinerary intelligence pipeline as advisory-only labels behind `NONREV_ROUTE_LIVE_WEATHER_ENABLED`, with stale/missing/disabled cache reads neutral and no provider calls during ranking.
   - Completed 2026-07-04 sprint: Wired AviationWeather.gov METAR cache refresh into a server-only weather refresh scheduler behind `NONREV_SERVER_WEATHER_REFRESH_SCHEDULER_ENABLED`, preserving TTL skips, feature gates, graceful provider failure, advisory-only labels, and neutral unknown weather.
   - Completed 2026-07-06 sprint: Added consolidated weather integration readiness guardrails for route cache reads, cache population, server refresh, internal prefetch, and scheduler flags; readiness remains advisory-only, scoring-neutral, and client-live-call blocked.
4. Completed 2026-07-04: Improved airport and route coverage datasets with reviewed airport scaffolds for route coverage groups and small-airport hub maps, plus regression coverage.
5. Completed 2026-07-04: Added provider result provenance persistence fields for request-scope grouping, result fingerprinting, and provenance schema versioning, with legacy table fallback for safe beta debugging.
6. Completed 2026-07-06: Added feature-flagged historical reliability provider readiness contracts for FAA BTS, FlightAware historical, Cirium, AviationStack, and Internal analytics. All sources remain advisory-only with live calls disabled until explicitly enabled and implemented.
7. Completed 2026-07-06: Added feature-flagged airport intelligence provider readiness contracts for OurAirports, FAA airport facilities, FlightAware airport endpoints, and Mapbox airport context while preserving the existing local static scaffold and disabling live calls by default.
8. Completed 2026-07-06: Tightened the commercial seat availability abstraction with feature-flagged provider readiness for Duffel, Amadeus/GDS, Sabre, and manual/community proxy sources; all remain proxy-only and disabled by default.
9. Completed 2026-07-06: Added a feature-flagged standby confidence guardrail engine that requires trusted structured load data, caps advisory scores, and never returns confirmed clearance or standby availability.
10. Completed 2026-07-06: Added feature-flagged Recovery Engine v2 readiness contracts for future live schedule, hotel, ground transport, alternate-airport, and weather/disruption inputs without changing current recovery scoring or enabling booking/provider calls.
11. Completed 2026-07-06: Added feature-flagged hotel provider readiness contracts for Booking.com, Expedia/Rapid, Google Hotels context, and manual hotel notes; all are advisory/read-only and cannot book rooms or guarantee availability.
12. Completed 2026-07-06: Added feature-flagged ground transportation provider readiness contracts for rideshare, rental car, public transit, and manual pickup notes; all are advisory/read-only and cannot book or guarantee vehicle availability.
13. Completed 2026-07-06: Added a bounded, mutation-safe cache for repeated `airportCodesFromRoute` parsing across planner/intelligence/weather paths, with regression coverage preserving extraction behavior.
14. Completed 2026-07-06: Centralized API route-framework warning copy on shared certainty labels and added regression coverage for badge de-duplication, no live-availability claims, and no standby-clearance claims.
15. Completed 2026-07-06: Restored route-framework label regression coverage for non-framework scheduled itineraries and source-label consistency after the certainty-label test extraction.
16. Completed 2026-07-06: Began the Historical Reliability Engine with a feature-flagged provider interface, null provider, registry/factory, and future provider configuration; no live providers, UI wiring, scoring changes, or planner behavior changes were added.
17. Completed 2026-07-06: Added the airport intelligence provider framework with feature-flagged interfaces, null provider, registry/factory, future provider configuration guardrails, and result fields for congestion, connection/customs/terminal risk, alternate airports, recovery score, confidence, provider name, and update time; no live providers, UI wiring, scoring changes, or planner behavior changes were added.
18. Completed 2026-07-06: Added the commercial sellable seat availability provider framework with feature-flagged interfaces, `NullSellableSeatAvailabilityProvider`, registry/factory, future provider configuration guardrails, and result fields for carrier, flight number, origin, destination, departure date, cabin/fare-class availability, observed price, price trend, sellable status, confidence, provider name, and update time; no live providers, scraping, UI wiring, itinerary generation changes, or scoring changes were added.
19. Completed 2026-07-06: Added the feature-flagged `HistoricalReliabilityService` aggregation layer for historical reliability provider interfaces. It aggregates on-time percentage, cancellation percentage, average departure delay, average arrival delay, confidence, data freshness, and provider status while failing closed for disabled flags, null providers, unavailable providers, timeouts, errors, and partial provider data. No live providers, UI wiring, itinerary scoring changes, or planner behavior changes were added.

### P3 — Product polish

1. Completed 2026-07-04: Simplified itinerary-card intelligence summaries into compact visible trust-signal chips while preserving required advisory labels and route details.
2. Completed 2026-07-04: Kept confidence, recovery, reliability, weather, community, and sellable-seat proxy signals concise/scannable, with verbose rationale moved behind “Why / trust details.”
3. Completed 2026-07-04: Improved production-safe empty-state copy for first-time beta users so no-live-row outcomes explain trust filtering, complete route frameworks, recovery guidance, and conservative next actions.
4. Completed 2026-07-04: Clarified saved-comparison affordances so they preserve exact displayed route paths, leg counts, and source labels instead of obscuring route integrity.
5. Completed 2026-07-04: Added keyboard-accessible itinerary-card expansion and visible focus styling while preserving the existing responsive card layout and trust labels.
6. Completed 2026-07-06: Added the i18n foundation with English default locale, Spanish and Japanese starter locale files, shared common UI translations, a lightweight provider/hook that preserves existing routing, locale-aware date/time formatting helpers where practical, and documentation for adding locales.

## Autonomous agent safety rules

1. Do not modify production app logic unless the current task explicitly asks for it.
2. Do not scrape airline websites.
3. Do not add or change external provider integrations without explicit approval or a task that specifically requests provider work.
4. Do not introduce claims of confirmed standby/non-rev seat availability unless backed by an approved data source designed for that signal.
5. Do not treat placeholder, scaffold, advisory, historical, community, or weather intelligence as live certainty.
6. Do not hide uncertainty to improve aesthetics.
7. Do not change authentication, billing, environment, database schema, or deployment configuration without inspecting existing state and stating the risk.
8. Do not commit unrelated files, generated artifacts, local temp files, `.env*`, logs, screenshots, or untracked scratch directories.
9. Preserve existing beta architecture unless the task explicitly asks for a refactor.
10. If a change may reduce trust, pause and ask before continuing.

## Commit rules

1. Keep commits focused on the requested task.
2. Use the exact commit message requested by the user when one is provided.
3. Stage only intended files. Check `git status --short` before and after staging.
4. Never include untracked `tmp/` unless a task explicitly says to add it.
5. Run the relevant validation gates before committing.
6. After committing, verify `git log --oneline -1` matches the intended message.
7. Push to the requested branch only after local validation passes.
8. Final report must include commit hash, pushed branch, files changed, validation performed, and any known blockers or leftover untracked files.

## Validation rules

Use the smallest meaningful validation that proves the requested change. Prefer stronger gates for app-logic changes.

### Documentation-only changes

- `git diff --check`
- Confirm the diff only touches documentation or explicitly requested non-logic files.

### TypeScript or app-logic changes

- `git diff --check`
- `npx tsc --noEmit`
- Run targeted route/API checks when itinerary generation, scoring, confidence, recovery, provider, alert, or UI data mapping changes.

### UI changes

- `git diff --check`
- `npx tsc --noEmit`
- Browser or screenshot verification when the browser environment is available.
- If browser verification is unavailable, state that explicitly and provide the next best evidence.

### Provider/data changes

- Validate fallback behavior for missing, partial, stale, and rate-limited provider data.
- Confirm provider diagnostics do not expose secrets.
- Confirm live/stored/framework labels remain truthful.

## Beta-readiness priorities

1. Trustworthy itinerary display over feature breadth.
2. Clear provider and freshness labels over optimistic copy.
3. Stable private-beta flows over broad route coverage.
4. Reproducible validation over manual confidence.
5. Conservative intelligence wording over persuasive scoring.
6. Recovery and backup-option clarity over decorative insights.
7. Known limitations documented in product surfaces and runbooks.

## Provider and data priorities

1. Normalize provider output into internal itinerary types before UI consumption.
2. Track data provenance: provider, retrieval time, freshness rule, fallback reason, and limitations.
3. Make partial provider data explicit instead of filling gaps with fabricated details.
4. Keep provider failure non-fatal when a route-framework fallback is safe and clearly labeled.
5. Prioritize route coverage and freshness for beta test markets before broad expansion.
6. Treat community intelligence as directional only; never as confirmed load or clearance data.
7. Treat weather and historical reliability as advisory scoring inputs until live data contracts are implemented and validated.

## UI priorities

1. Itinerary cards must show the actual route path and never omit legs.
2. The primary card should quickly answer:
   - Where does it go?
   - Is it live, stored, or a route framework?
   - How confident is Nonrevy?
   - What are the main risks?
   - What backup options exist?
3. Use concise labels for intelligence signals:
   - Route Confidence
   - Recovery
   - Historical Reliability
   - Weather
   - Community Signal
   - Sellable Seat Proxy
4. Prefer `Unknown` when a signal is absent or not configured.
5. Avoid redesigns unless requested; improve clarity within the existing layout first.
6. Keep alert and watchlist language direct, conservative, and actionable.
7. Make beta limitations visible without making the product feel broken.

## Default next actions for future agents

When no more specific task is provided, work in this order:

1. Run `git status --short --branch` and inspect the current branch.
2. Read this file and `AGENTS.md`.
3. Choose the highest-priority incomplete P0/P1 task that can be completed safely in one focused commit.
4. Make the smallest safe change.
5. Validate according to this file.
6. Commit with a clear message.
7. Push only when requested or when the operating context explicitly expects autonomous push behavior.
8. Report succinctly with evidence.

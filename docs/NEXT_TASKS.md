# Nonrevy Autonomous Development Task Queue

_Last updated: 2026-07-04 00:47 UTC_

This file is the operating guide for autonomous development agents working on Nonrevy. It defines the next task queue, safety boundaries, validation gates, and priorities for moving the beta toward trustworthy private-beta readiness.

## Core operating principle

Itinerary integrity is sacred. Nonrevy may show less information when certainty is low, but it must never fabricate legs, substitute hubs for origins, hide generated legs, display stale rows as live availability, or overstate provider/weather/reliability certainty.

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

### P2 — Data and provider depth

1. Completed 2026-07-04: Added a provider-agnostic schedule adapter so normalized provider schedules convert into downstream flight rows without leaking provider-native response shapes.
2. Add structured provider diagnostics for freshness, partial coverage, rate limits, and fallbacks.
3. Prepare weather intelligence for real sources while preserving the optional/advisory contract:
   - NOAA
   - National Weather Service
   - AviationWeather.gov / METAR / TAF
   - Tomorrow.io
   - OpenWeather
   - FlightAware weather alerts
4. Improve airport and route coverage datasets through reviewed seed data or controlled migrations.
5. Add persistence for provider result provenance where it improves auditability and beta debugging.

### P3 — Product polish

1. Simplify itinerary cards without removing required trust labels.
2. Keep intelligence signals concise and scannable: confidence, recovery, reliability, weather, community, and sellable-seat proxy.
3. Improve empty states and fallback explanations for first-time beta users.
4. Add comparison affordances only when they do not obscure route integrity.
5. Prioritize accessibility, responsive layout, and readable mobile cards over visual novelty.

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

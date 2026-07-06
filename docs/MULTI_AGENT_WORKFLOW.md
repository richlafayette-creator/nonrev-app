# Nonrevy Parallel Multi-Agent Workflow

_Last updated: 2026-07-06 04:41 UTC_

This document defines the safe branch and merge workflow for running multiple Nonrevy development agents in parallel without weakening itinerary integrity, provider safety, or beta-readiness validation.

## Branch strategy

- `main` — stable production branch.
- `agent-dev` — integration branch.
- `agent/data` — Data Agent branch.
- `agent/frontend` — Frontend Agent branch.
- `agent/qa` — QA Agent branch.
- `agent/docs` — Docs Agent branch.
- `agent/release` — Release Agent branch.

Each sprint happens on the owning agent's branch. Agents do not commit directly to another agent's branch. `agent-dev` remains the integration target after validation and review.

## Agent ownership

### Data Agent

Owns:

- provider integrations
- weather
- historical reliability
- commercial availability
- airport intelligence
- caching
- diagnostics

Typical file areas:

- `lib/providers/`
- `lib/weather/`
- `lib/reliability/`
- `lib/airport/`
- `lib/sellableSeatSignal*`
- provider readiness, cache, diagnostics, and aggregation tests

### Frontend Agent

Owns:

- `app/plan` UI
- itinerary cards
- mobile layout
- accessibility
- confidence display
- user-facing warnings

Typical file areas:

- `app/plan/`
- `components/`
- stylesheets and style modules
- UI/component tests for itinerary and planner surfaces

### QA Agent

Owns:

- regression tests
- route matrix tests
- API fallback tests
- UI smoke tests
- merge validation

Typical file areas:

- test files under the feature area being validated
- route/API regression matrices
- smoke-test docs and validation notes

QA Agent must not change production behavior while adding or maintaining tests.

### Docs Agent

Owns:

- roadmap
- `docs/NEXT_TASKS.md`
- `docs/AGENT_REPORT.md`
- known limitations
- release notes

Typical file areas:

- `docs/`
- README/runbook material when explicitly assigned

### Release Agent

Owns:

- changelog
- beta checklist
- merge readiness
- deployment checklist

Typical file areas:

- release notes
- deployment and beta-readiness checklists
- merge-readiness summaries

## Conflict rules

1. Data Agent must not edit `app/plan/page.tsx` unless explicitly assigned.
2. Frontend Agent must not edit provider/data modules, including provider abstractions, cache modules, reliability services, weather adapters, airport intelligence modules, sellable-seat modules, or diagnostics services.
3. QA Agent must not change production behavior.
4. Shared files require integration review.
5. Each sprint must happen on the agent's own branch.
6. Merge into `agent-dev` only after validation.
7. Shared files include, but are not limited to:
   - `app/api/itinerary/search/route.ts`
   - `lib/itinerarySearch*`
   - `lib/decisionEngine*`
   - `lib/routeFrameworkLabels*`
   - `lib/liveAvailabilityGuard*`
   - `docs/NEXT_TASKS.md`
   - `docs/AGENT_REPORT.md`
   - package/config/test-runner files
8. Do not scrape airline websites.
9. Do not claim confirmed standby or non-rev availability unless backed by an approved data source designed for that signal.
10. If a change can affect displayed itinerary paths, live/stored/framework labels, scoring, provider certainty, or user-facing availability claims, treat it as shared and require integration review.

## Merge protocol

1. Start from latest `agent-dev`.
2. Create or update the agent branch.
3. Complete one sprint.
4. Validate.
5. Commit.
6. Push agent branch.
7. Integration review merges into `agent-dev`.
8. QA validates `agent-dev` after merge.

## First task assignments

### Data Agent next

Historical Reliability aggregation service.

Guardrails:

- remain feature-flagged
- no live provider integration unless explicitly approved
- no UI changes
- no itinerary scoring changes
- no planner behavior changes
- preserve null/fail-closed behavior for missing, stale, partial, or unconfigured data

### Frontend Agent next

Improve intelligence sections on itinerary cards without changing API shape.

Guardrails:

- no provider/data module edits
- no API response shape changes
- no itinerary scoring changes
- no fabricated certainty
- preserve complete route/leg display integrity
- keep live/stored/framework labels truthful and visible

### QA Agent next

Add route matrix smoke tests.

Guardrails:

- test-only changes unless explicitly assigned
- no production behavior changes
- preserve itinerary integrity and no-live-availability claim checks

### Docs Agent next

Maintain beta readiness and known limitations.

Guardrails:

- keep limitations accurate and conservative
- avoid implying live availability, guaranteed clearance, or provider certainty
- coordinate shared docs updates through integration review

### Release Agent next

Prepare private beta deployment checklist.

Guardrails:

- checklist-only unless explicitly assigned
- call out blockers and manual verification requirements
- do not change deployment configuration without explicit approval

## Validation expectations

Minimum for documentation-only changes:

- `git diff --check`

Minimum for Data Agent changes:

- targeted provider/data tests
- `git diff --check`
- `npx tsc --noEmit`

Minimum for Frontend Agent changes:

- targeted UI/component tests where available
- `git diff --check`
- `npx tsc --noEmit`
- browser/screenshot verification when a UI harness is available; otherwise state the harness gap and provide the next best evidence

Minimum for QA Agent changes:

- targeted regression, route matrix, API fallback, or UI smoke tests for the assigned area
- `git diff --check`
- `npx tsc --noEmit` when TypeScript files are touched
- confirm tests do not alter production behavior

Minimum for Docs Agent changes:

- `git diff --check`
- confirm docs accurately reflect current branch state and limitations

Minimum for Release Agent changes:

- `git diff --check`
- confirm checklist entries identify validation gates, blockers, and deployment readiness criteria

Minimum for integration review:

- verify branch is based on latest `agent-dev`
- inspect changed-file ownership boundaries
- verify required validation passed before merge
- merge only clean branches
- run QA validation on `agent-dev` after merge
- confirm no unrelated temp files, logs, screenshots, `.env*`, or generated artifacts are staged

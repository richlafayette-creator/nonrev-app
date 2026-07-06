# Nonrevy Parallel Multi-Agent Workflow

_Last updated: 2026-07-06 04:33 UTC_

This document defines the safe branch and merge workflow for running multiple Nonrevy development agents in parallel without weakening itinerary integrity, provider safety, or beta-readiness validation.

## Branch strategy

- `main` — stable branch. Only receives validated release-ready work.
- `agent-dev` — integration branch. All agent work starts from here and merges back here before any release path.
- `agent/data` — Data Agent branch.
- `agent/frontend` — Frontend Agent branch.
- `agent/qa` — QA Agent branch.
- `agent/docs` — Docs Agent branch.
- `agent/release` — Release Agent branch.

Each agent works on its own branch. Agents do not commit directly to another agent's branch. `agent-dev` remains the merge/integration target after validation.

## Active agents

### Data Agent

Owns provider and data-depth work, including:

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
- related provider, readiness, cache, and diagnostics tests

### Frontend Agent

Owns planning and itinerary presentation work, including:

- itinerary cards
- mobile layout
- planner UI
- accessibility
- confidence displays

Typical file areas:

- `app/plan/`
- `components/`
- stylesheets and style modules
- UI/component tests for itinerary and planner surfaces

## Conflict rules

1. Data Agent cannot edit `app/plan/page.tsx` unless explicitly required by the sprint brief.
2. Data Agent should avoid planner UI files except for narrowly scoped diagnostics contracts that have integration-branch approval.
3. Frontend Agent cannot edit provider/data modules, including provider abstractions, cache modules, reliability services, weather adapters, airport intelligence modules, sellable-seat modules, or diagnostics services.
4. Shared files require integration branch review before merge into `agent-dev`.
5. Shared files include, but are not limited to:
   - `app/api/itinerary/search/route.ts`
   - `lib/itinerarySearch*`
   - `lib/decisionEngine*`
   - `lib/routeFrameworkLabels*`
   - `lib/liveAvailabilityGuard*`
   - `docs/NEXT_TASKS.md`
   - `docs/AGENT_REPORT.md`
   - package/config/test-runner files
6. Each agent works on its own branch and keeps commits focused to one sprint.
7. Merge back into `agent-dev` only after validation passes.
8. Do not scrape airline websites.
9. Do not claim confirmed standby or non-rev availability unless backed by an approved data source designed for that signal.
10. If a change can affect displayed itinerary paths, live/stored/framework labels, scoring, or provider certainty, treat it as shared and require integration review.

## Merge protocol

1. Start from latest `agent-dev`.
2. Create or update the agent branch:
   - Data Agent: `agent/data`
   - Frontend Agent: `agent/frontend`
   - QA Agent: `agent/qa`
   - Docs Agent: `agent/docs`
   - Release Agent: `agent/release`
3. Complete exactly one sprint-sized task.
4. Run required validation for the touched area.
5. Commit only intended files.
6. Push the agent branch.
7. Open a merge candidate into `agent-dev`.
8. QA validates the merge candidate before merge.
9. Merge into `agent-dev` only after QA signoff and conflict review.
10. After merge, the next agent sprint starts from the updated `agent-dev`.

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

Minimum for QA Agent merge candidates:

- verify branch is based on latest `agent-dev`
- inspect changed-file ownership boundaries
- run targeted tests for touched areas
- run `git diff --check`
- run `npx tsc --noEmit` for TypeScript/app changes
- confirm no unrelated temp files, logs, screenshots, `.env*`, or generated artifacts are staged

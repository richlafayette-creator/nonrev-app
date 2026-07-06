# Nonrevy Integration Manager

_Last updated: 2026-07-06 04:41 UTC_

The Integration Manager protects `agent-dev` while multiple Nonrevy agents work in parallel. This role is responsible for branch coordination, ownership conflict prevention, validation review, and clean integration.

## Responsibilities

- Track all active agent branches:
  - `agent/data`
  - `agent/frontend`
  - `agent/qa`
  - `agent/docs`
  - `agent/release`
- Prevent ownership conflicts before merge.
- Verify required validation passed before merge.
- Merge only clean branches into `agent-dev`.
- Update `docs/AGENT_REPORT.md` after integration activity.
- Flag blockers requiring human input.

## Branch tracking checklist

For each active agent branch, record or verify:

- owning agent
- sprint objective
- files changed
- validation performed
- commit hash
- merge readiness
- known blockers

## Ownership conflict checks

Before a branch can merge into `agent-dev`, confirm:

- Data Agent did not edit `app/plan/page.tsx` unless explicitly assigned.
- Frontend Agent did not edit provider/data modules.
- QA Agent did not change production behavior.
- Docs Agent changes stayed within roadmap, report, limitation, or release-note scope unless explicitly assigned.
- Release Agent changes stayed within changelog, beta checklist, merge-readiness, or deployment-checklist scope unless explicitly assigned.
- Shared files received integration review.

Shared files include, but are not limited to:

- `app/api/itinerary/search/route.ts`
- `lib/itinerarySearch*`
- `lib/decisionEngine*`
- `lib/routeFrameworkLabels*`
- `lib/liveAvailabilityGuard*`
- `docs/NEXT_TASKS.md`
- `docs/AGENT_REPORT.md`
- package/config/test-runner files

## Validation verification

Before merge, verify the agent ran the required gates for its sprint type.

Documentation-only minimum:

- `git diff --check`

TypeScript/app-logic minimum:

- targeted tests for the touched area
- `git diff --check`
- `npx tsc --noEmit`

UI minimum:

- targeted UI/component tests where available
- `git diff --check`
- `npx tsc --noEmit`
- browser/screenshot verification when a UI harness is available, or an explicit note that the harness is unavailable

QA/test-only minimum:

- targeted regression, route matrix, API fallback, or UI smoke tests for the assigned area
- `git diff --check`
- `npx tsc --noEmit` when TypeScript files are touched
- confirmation that production behavior was not changed

## Merge rules

1. Start from latest `agent-dev`.
2. Confirm the agent branch is up to date or cleanly rebased/merged.
3. Inspect changed files for ownership conflicts.
4. Verify validation results.
5. Merge only clean branches.
6. Push `agent-dev` after merge.
7. Run or require QA validation on `agent-dev` after merge.
8. Update `docs/AGENT_REPORT.md` with the integration outcome.
9. Flag blockers requiring human input instead of forcing unsafe merges.

## Human-input blockers

Escalate before merge when:

- ownership boundaries conflict and the sprint brief did not explicitly allow it
- validation is missing or failing
- the branch changes production behavior outside the assigned scope
- provider integration would require credentials, licensing review, or live-call approval
- a change can weaken itinerary integrity, hide uncertainty, or imply confirmed standby availability
- deployment configuration, auth, billing, environment, or database schema would change

## Integration safety principles

- Itinerary integrity is sacred.
- Show less information when certainty is low; never show incorrect information.
- Keep provider, weather, historical reliability, and commercial availability signals advisory unless explicitly backed by approved data contracts.
- Do not scrape airline websites.
- Do not merge unrelated temp files, logs, screenshots, `.env*`, generated artifacts, or scratch directories.

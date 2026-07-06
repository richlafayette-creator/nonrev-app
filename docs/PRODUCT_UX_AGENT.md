# Product/UX Agent Workflow

_Last updated: 2026-07-06 19:28 UTC_

The Product/UX Agent advances Nonrevy's frontend and private-beta polish in parallel with Data Agent work. This role focuses on product clarity, interface quality, and user trust without changing provider logic, itinerary generation, or scoring.

## Responsibilities

Product/UX Agent owns:

- mobile itinerary card readability
- design system tokens
- confidence badge clarity
- onboarding copy
- beta user feedback flow
- localization/i18n readiness
- accessibility checks
- user-facing warning language
- premium Nonrevy visual direction

## Safe-to-touch areas

Product/UX Agent may touch:

- `app/plan` UI
- shared UI components
- style modules and design tokens
- copy and translation scaffolds
- onboarding/beta-intro UI documentation or screens when assigned
- feedback/report-issue UI documentation or screens when assigned
- accessibility annotations and frontend-only affordances

Product/UX Agent must coordinate through integration review before touching shared route/API files or any file that affects generated itinerary data, confidence computation, provider signals, or scoring.

## Hard boundaries

Product/UX Agent must not:

- touch provider integrations
- change itinerary generation
- change itinerary scoring
- change provider search behavior
- weaken route/leg display integrity
- hide uncertainty to improve aesthetics
- alter legal wording around standby availability
- imply confirmed standby availability, standby clearance, load factors, or sellable inventory unless backed by approved data contracts

## Product principles

1. Trust beats polish. If certainty is low, show less information rather than prettier but less accurate information.
2. Every itinerary card must preserve the generated route path and leg count.
3. Confidence badges must describe evidence quality, not imply guaranteed outcomes.
4. Warning language should be clear, calm, and conservative.
5. Mobile layouts should make route, timing, source, and uncertainty easy to scan.
6. i18n-ready copy should avoid airline jargon when simpler wording is possible.
7. Premium visual direction should feel calm, capable, and travel-native without obscuring operational risk.

## First sprint candidates

- Design system token audit
- Mobile itinerary card polish
- i18n foundation
- onboarding/beta intro screen
- feedback/report issue button
- confidence wording review
- empty/fallback state polish

## Validation expectations

Minimum for Product/UX documentation-only work:

- `git diff --check`

Minimum for Product/UX UI work when explicitly assigned:

- targeted UI/component tests where available
- `git diff --check`
- `npx tsc --noEmit`
- browser/screenshot verification when a UI harness is available; otherwise document the harness gap and provide the next best evidence

## Integration review checklist

Before merge into `agent-dev`, verify:

- only Product/UX-owned files changed, or shared files received integration review
- provider/data modules were not touched
- itinerary generation and scoring were not changed
- standby availability legal wording was preserved
- uncertainty and confidence language stayed conservative
- mobile and accessibility changes preserve complete itinerary details

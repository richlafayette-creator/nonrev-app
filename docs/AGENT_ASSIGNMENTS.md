# Nonrevy Agent Assignments

_Last updated: 2026-07-06 19:28 UTC_

This document summarizes agent ownership boundaries and safe-to-touch rules for parallel work on `agent-dev`.

## Branches

- `agent/data` — Data Agent
- `agent/frontend` — Frontend Agent
- `agent/qa` — QA Agent
- `agent/docs` — Docs Agent
- `agent/release` — Release Agent
- `agent/product-ux` — Product/UX Agent

All agent branches start from latest `agent-dev` and merge back only after validation and integration review.

## Product/UX Agent

### Owns

- mobile itinerary card readability
- design system tokens
- confidence badge clarity
- onboarding copy
- beta user feedback flow
- localization/i18n readiness
- accessibility checks
- user-facing warning language
- premium Nonrevy visual direction

### May touch

- `app/plan` UI
- shared UI components
- style modules and design tokens
- frontend copy and translation scaffolds
- onboarding/beta-intro UI surfaces when explicitly assigned
- feedback/report-issue UI surfaces when explicitly assigned
- accessibility attributes and frontend-only usability affordances

### Must not touch

- provider integrations
- provider/data modules
- itinerary generation
- itinerary scoring
- server-side provider search behavior
- legal wording around standby availability, except to preserve or clarify already-approved wording

### Safe-to-touch rules

- Product/UX Agent may touch `app/plan` UI and shared UI components.
- Product/UX Agent must not touch provider integrations.
- Product/UX Agent must not change itinerary generation or scoring.
- Product/UX Agent must preserve legal wording around standby availability.

### Required review triggers

Integration review is required if Product/UX work touches:

- `app/api/itinerary/search/route.ts`
- provider/data modules
- confidence or scoring utilities
- route framework or live-availability guardrails
- shared copy that could imply confirmed availability, standby clearance, load factors, or sellable inventory
- deployment, auth, billing, environment, or database configuration

## Existing agent boundaries

### Data Agent

Owns provider integrations, weather, historical reliability, commercial availability, airport intelligence, caching, and diagnostics.

Must not edit `app/plan/page.tsx` unless explicitly assigned.

### Frontend Agent

Owns `app/plan` UI, itinerary cards, mobile layout, accessibility, confidence display, and user-facing warnings.

Must not edit provider/data modules.

### QA Agent

Owns regression tests, route matrix tests, API fallback tests, UI smoke tests, and merge validation.

Must not change production behavior.

### Docs Agent

Owns roadmap, `docs/NEXT_TASKS.md`, `docs/AGENT_REPORT.md`, known limitations, and release notes.

### Release Agent

Owns changelog, beta checklist, merge readiness, and deployment checklist.

## Shared safety rules

- Each sprint must happen on the agent's own branch.
- Shared files require integration review.
- Merge into `agent-dev` only after validation.
- Do not scrape airline websites.
- Do not claim confirmed standby availability.
- Preserve itinerary integrity: never omit legs, substitute hubs for origins, fabricate connections, or display stale/historical rows as current live availability.

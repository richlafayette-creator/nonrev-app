# Private beta runbook

Last updated: 2026-06-18 UTC

This runbook is the tester-facing operating guide for NONREVY private beta. Use it to explain what the app can currently be trusted to do, what still needs human judgment, and how testers should report issues.

## Beta operating principles

- Treat NONREVY as a planning and confidence assistant, not as airline operational truth.
- Verify every itinerary against official airline tools before traveling.
- Use beta feedback to flag confusing wording, wrong routes, missing fallback context, and any result that feels overconfident.
- Do not treat stored, estimated, nearest-date, or demo fallback data as live seat availability.

## What data is live

Live means a provider API response was returned during the itinerary request.

Currently live-capable data includes:

- FlightAware schedule/provider responses when the route/date request succeeds.
- FlightAware flight-number enrichment/status checks when a known flight identifier is available.
- Health/readiness diagnostics from `/api/data-health`, including provider status, missing configuration, and fallback mode.

A route card should only be treated as live when the app labels the result as live provider API data or otherwise indicates it came from a current provider request for the searched route/date.

## What data is estimated or stored

Estimated/stored data supports planning but is not current airline truth.

This includes:

- Stored Supabase flight rows.
- Community load reports submitted by beta users.
- Success probability and route confidence scores.
- Outcome-derived confidence adjustments.
- Nearest-date testing data when Personal Testing Mode is enabled.
- Demo/scaffold fallback cards shown when providers cannot return usable route data.
- Map/airport context cards when Mapbox is limited or unavailable.

Stored Supabase rows may be useful for route shape, connection logic, and app-flow testing. They are still stored data even if they match the requested date. Nearest-date testing data is strictly for beta UI/search-flow testing.

## Confidence score meaning

Confidence scores summarize how trustworthy a route recommendation appears based on available signals. They are not a guarantee of boarding, seat count, or dispatch outcome.

Use this interpretation during beta:

| Score range | Meaning | Tester guidance |
| --- | --- | --- |
| 80-100 | Strong planning signal | Route looks favorable in app context, but still verify with airline tools. |
| 60-79 | Usable but uncertain | Consider as a candidate; check backups, timing, and official loads. |
| 40-59 | Risky or weak signal | Treat as a caution route; compare alternatives before relying on it. |
| 0-39 | Poor or insufficient signal | Use only as a last-resort planning idea unless official tools disagree. |

Common reasons confidence may be lower:

- Provider data is missing, stale, or quota-limited.
- Result came from stored data rather than live provider data.
- Route requires connections or tight timing.
- Community/load/outcome history is sparse or conflicting.
- Personal Testing Mode or nearest-date matching is active.

## How to submit loads

Use load reports to add human-observed route signals during beta.

1. Open `/load-reports`.
2. Enter the carrier, origin, destination, flight/date if known, and load condition.
3. Add any available seat/standby estimates.
4. Choose the confidence level that matches how certain you are.
5. Add notes if something explains the load, such as cancellation spillover, event traffic, weather, or holiday demand.
6. Submit the report.
7. Confirm a success message appears and the recent report/history area updates.

Good load report notes are short, factual, and source-aware. Example: “Gate display showed 8 open seats about 45 minutes before departure; standby list looked long.”

Do not submit private employee data, passenger names, screenshots with personal information, or anything your airline prohibits sharing.

## How to report wrong itineraries

Report wrong itineraries whenever a route card is misleading, impossible, stale, missing a major caveat, or inconsistent with official airline tools.

Include:

- Search query used.
- Date and approximate time of test.
- Origin/destination and carrier filter, if any.
- Screenshot or copied route card text.
- What the app showed.
- What official airline tools or tester knowledge showed instead.
- Whether Personal Testing Mode was enabled.
- Whether the result was labeled live, stored, nearest-date, or demo fallback.

Preferred flow:

1. Use `/beta-feedback` for general itinerary correctness issues.
2. Use `/load-reports` when the main issue is a load or standby signal.
3. If the itinerary caused a tester to make a bad planning decision, mark it as high priority in the notes.

Wrong itinerary examples to report:

- Route uses an impossible airport pair or connection.
- Result date does not match the requested date without a clear nearest-date warning.
- Carrier filter is ignored.
- Live/stored/fallback badge is missing or contradictory.
- Confidence is high despite stale or fallback data.
- Times, airports, or connection order are visibly wrong.

## Operator preflight checks

Before a private-beta session, run through these checks and treat any `fail` item as a launch blocker for that test cohort:

1. Environment configuration: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for browser-safe Supabase features.
2. Provider credentials: `FLIGHTAWARE_API_KEY` is present server-side for primary live schedules; `AVIATIONSTACK_API_KEY` is present if fallback flight search is in scope.
3. Supabase persistence: `SUPABASE_SERVICE_ROLE_KEY` is set server-side only before testing account-backed watchlists, alerts, feedback, outcomes, or provider-result storage.
4. Provider-result storage: if `NONREVY_STORE_PROVIDER_RESULTS=true`, the service-role key and provider-results migration must already be ready; otherwise storage should stay disabled and no-op safely.
5. Alert safety: no service-role-like key uses a `NEXT_PUBLIC_` prefix, and alert copy must not expose raw provider errors, credentials, passenger information, or unsupported live-availability claims.
6. Personal Testing Mode: `NONREVY_TEST_DATA_MODE=true` is acceptable only for explicit fallback-label testing; it is not production-like beta evidence.

The shared helper `betaRunbookChecks` in `lib/betaRunbookChecks.ts` mirrors this checklist for automated smoke coverage. The helper reports pass/warn/fail status without returning secret values.

## Known limitations

Current private beta limitations:

- FlightAware is the primary live schedule path, but provider quota, entitlement, response shape, or network issues can still downgrade results.
- AviationStack is fallback-only and may be quota-limited.
- Supabase flight rows are stored data, not live availability.
- Server-side Supabase persistence requires `SUPABASE_SERVICE_ROLE_KEY`; without it, account beta persistence remains in local fallback mode.
- Required flight freshness columns may still need migration: `public.flights.flight_date` and `public.flights.source_checked_at`.
- Mapbox may return limited/403 diagnostics; maps should degrade to safe placeholders.
- Personal Testing Mode can intentionally match nearest available stored dates and must not be used as production accuracy proof.
- Demo fallback exists to keep flows testable, not to represent real airline schedules.
- Confidence/probability scores are planning aids, not boarding guarantees.
- Private beta is not ready for public launch until persistence, freshness, provider quota, and tester feedback loops are verified.

## How beta testers should give feedback

Testers should give feedback whenever something is broken, confusing, overconfident, or surprisingly helpful.

Use this structure:

```text
Route/search:
Date/time tested:
Device/browser:
Signed in? yes/no:
Personal Testing Mode? yes/no:
What I expected:
What happened:
Why it matters:
Screenshot/video attached? yes/no:
``` 

Feedback channels inside the app:

- `/beta-feedback` for general feedback, wrong itineraries, confusing copy, and trust issues.
- `/load-reports` for observed flight/load/standby reports.
- `/outcomes` or itinerary outcome forms for actual trip results.
- `/watchlist` for alert/watch behavior that does not match expectations.

High-priority feedback categories:

- Wrong itinerary or wrong date.
- Missing fallback/stale-data warning.
- A route card that looks live but is actually stored/test/demo data.
- Dead button, stuck spinner, or silent failure.
- Missing success/error message after submit.
- Confidence score that feels dangerously high.
- Any privacy concern or accidental exposure of raw provider/error data.

Low-priority but useful feedback:

- Awkward wording.
- Missing helpful explanation.
- Mobile layout issues.
- Routes testers want added to the smoke matrix.
- Moments where the app correctly helped choose a better backup.

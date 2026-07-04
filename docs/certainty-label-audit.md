# Certainty label audit

_Last updated: 2026-07-04 UTC_

This audit maps user-facing certainty words to the meaning NONREVY should preserve in itinerary, provider, watchlist, alert, and beta-readiness surfaces. Trust wording is part of itinerary integrity: labels should make uncertainty more visible, not more optimistic.

## Approved certainty vocabulary

| Label family | Approved user-facing wording | Meaning | Required caveat |
| --- | --- | --- | --- |
| Live | `Live provider API data`, `Live provider API: FlightAware`, `Live provider API: Aviationstack` | A provider API response was returned for the current itinerary request path. | Never imply standby clearance, sellable seats, or non-rev seat availability. |
| Stored | `Stored Supabase flight data`, `Stored exact-date schedule`, `Stored historical data` | Persisted rows or historical/provider-cache rows support planning. | Stored rows are not current live availability, even if they match the requested date. |
| Cached | `Cached provider data`, `Recent provider cache`, `Older provider cache` | A saved provider result exists but was not freshly fetched for the current request. | Must say cached/stale rows are not current live availability. |
| Route framework | `Route framework only`, `Live availability unavailable`, `Route framework only — live availability unavailable` | NONREVY generated a complete route shape without provider flight numbers/times/load data. | Must say planning guidance only; flight numbers, times, loads, and standby clearance are unavailable. |
| Demo/testing | `Demo fallback data`, `Nearest-date testing data`, `MVP test data`, `Personal Testing Mode` | Test/scaffold data keeps beta flows usable. | Must be visibly labeled as testing/fallback and not production availability. |
| Placeholder | `Placeholder`, `Scaffold`, `No backend APIs yet`, `No live ... API connected yet` | A future integration surface or local-only scaffold. | Must not be presented as operational truth or a provider-backed signal. |
| Advisory | `Advisory`, `Planning guidance`, `Directional`, `Confidence score` | A model or contextual signal helps ranking but is not airline truth. | Avoid go/no-go language; tell testers to verify with official airline tools. |
| Unknown | `Unknown`, `Not provided`, `Unavailable`, `Pending live schedule` | The app does not have enough data for a signal. | Unknown signals should be neutral and should not be converted into confident copy. |
| No current live | `No current live availability`, `Live availability unavailable` | No current provider-backed availability can be shown. | Prefer showing less detail over filling missing facts. |

## Audit notes by surface

- `app/plan/page.tsx` already distinguishes live provider API data, stored Supabase data, demo fallback data, route frameworks, placeholder scoring, advisory weather, and unknown recovery/reliability. The risky areas are fallback badges and explanatory copy; keep them aligned with `lib/liveAvailabilityGuard.ts`, `lib/routeFrameworkLabels.ts`, and `lib/providerFailureMessaging.ts`.
- `app/api/itinerary/search/route.ts` exposes provider/source labels and no-result explanations. Provider failures should flow through shared provider-failure messaging so rate limits, partial coverage, stale rows, and unavailable providers do not sound live.
- `lib/liveAvailabilityGuard.ts` owns freshness badge normalization and must remain the source of truth for current-live versus stored/cached/testing/framework rows.
- `lib/routeFrameworkLabels.ts` owns route-framework caveats and must continue forcing `productionAvailability: false` and `isLive: false` for framework-only results.
- Watchlist and alert copy may reference confidence or route changes, but should not imply confirmed seats, current loads, or live availability unless a current provider-backed itinerary explicitly supports that label.
- Billing, membership, and activation placeholder labels are product scaffolding, not itinerary certainty labels; keep them clearly described as placeholders until real integrations exist.

## Red flags to fix when found

- `Live` used for stored Supabase rows, provider cache, demo fallback, route frameworks, or nearest-date testing data.
- `Exact requested date` used without also stating stored rows remain stored data.
- `Placeholder` or `scaffold` copy that sounds like a connected provider or operational result.
- Alerts that include raw provider errors, credentials, employee/private data, or unsupported claims of confirmed standby/load availability.
- Confidence, recovery, weather, historical reliability, or community signals written as guarantees instead of advisory planning inputs.

## Current status

No immediate label rewrite is required from this audit. The highest-risk itinerary labels are now covered by shared guardrails and targeted tests. Future UI copy changes should compare new labels against this document before shipping.

# Nonrevy Core Reliability Sprint 1 Audit

Date: 2026-07-09

## Current route search pipeline

1. **Natural language query parsing**
   - `app/api/itinerary/search/route.ts` receives `GET /api/itinerary/search`.
   - `normalizeItineraryRequest` and `parseItineraryPrompt` in `lib/itinerarySearch.ts` resolve origin, destination, date, carrier, and max legs.
   - Parser failures intentionally skip broad provider searches and return no live rows.

2. **Airport resolution**
   - IATA codes and known city aliases are resolved in `lib/itinerarySearch.ts`.
   - Unsupported airport warnings are generated through `airportScaffoldFor` checks.

3. **Date resolution**
   - Relative dates such as `tomorrow`, bare weekdays, and month/day strings resolve in UTC via `dateFromRelative`.
   - Flight matching compares requested date to the departure airport local date when a usable departure timestamp exists.

4. **Provider calls / data source order**
   - Expanded schedule search checks candidate origin/destination, hub, and destination-group segments.
   - Segment order is: recent provider cache, FlightAware, then Aviationstack for segments FlightAware did not fill.
   - If expanded search produces complete itineraries, direct Supabase table lookup is skipped.
   - If expanded search returns no complete itineraries, the endpoint checks exact provider cache, FlightAware exact route, Supabase stored flights, Aviationstack, then planning route frameworks.

5. **Itinerary generation**
   - `buildAllItinerariesFromFlights` normalizes provider rows into legs, filters by carrier/date, creates direct, one-stop, and two-stop chains, checks connection feasibility, and deduplicates equivalent itineraries.
   - Plausible connections currently require 35 minutes to 8 hours.

6. **Filtering / deduplication**
   - Endpoint integrity removes itineraries whose first origin or final destination do not match the request.
   - Duplicate/codeshare rows are merged by operating flight, route, departure time, and arrival time.
   - `scheduleItinerariesOnly` hides incomplete scheduled rows with pending/TBD flight numbers or times.

7. **Display**
   - `app/plan/PlanPage.tsx` stores API `itineraries` as live/scheduled results and `frameworkRoutes` as live-unavailable planning guidance.
   - Developer diagnostics are currently available in the results page details panel as raw JSON and summary cards.

## Why searches can return only 0–2 routes

- The expanded schedule search builds many provider legs, but `fetchExpandedScheduleFlights` currently narrows displayed results to `applyTopRouteRecommendations(..., 5)`. This is a ranking/top-route behavior, not a completeness behavior.
- Candidate expanded segment generation caps hub candidates with `.slice(0, 5)`, so it cannot prove all possible connection paths even if the provider supports them.
- The provider APIs in use are route/date segment searches. They do not expose a single guaranteed “all viable itineraries from origin to destination” response. Nonrevy must assemble connections from searched segments and clearly disclose that limitation.
- Fallback route frameworks are intentionally not displayed as live itineraries. When providers lack rows, the live itinerary count can be zero even when framework route possibilities exist.
- Incomplete rows with missing flight number, departure time, or arrival time are correctly filtered out instead of shown as live.

## Current inclusion/exclusion diagnostics available

- `debug.providerStatuses` explains which provider was checked, skipped, warned, or succeeded.
- `debug.routeMatching` explains normalized rows, exact route matches, date matches, and rejected candidate reasons for row-level filtering.
- `debug.itineraryCompletenessDiagnostics` counts direct, one-stop, two-stop generated, removed, and displayed itineraries.
- `debug.emptyResults`, `debug.rateLimits`, and `debug.safeErrors` explain missing provider rows and provider limitations.

## Data truth status

- FlightAware/Aviationstack provider rows may be live schedule API data, but they do **not** imply load or standby availability.
- Provider cache rows are cached schedule data only.
- Supabase flight rows are stored schedule data only.
- Route frameworks are inferred planning guidance, not live flight schedules.
- Demo/seed fallback code is currently disabled for production-safe behavior and must stay clearly labeled if re-enabled.

## Sprint 1 conclusion

The primary reliability bug is not just provider coverage: the response path still behaves like a ranked “top routes” product in places. The next sprints should make the API return all complete viable scheduled itineraries it can assemble, add a canonical itinerary/trust model, and display provider capability limits prominently on one page.

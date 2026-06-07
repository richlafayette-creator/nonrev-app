# Live flight data plan

Last audited from current code only: 2026-06-07 00:28 UTC

## Scope

This document is based only on the repository code inspected during this audit. It does not rely on external provider documentation or live web research.

Inspected integration files:

- `app/api/itinerary/search/route.ts`
- `lib/liveScheduleProviders.ts`
- `lib/itinerarySearch.ts`
- `lib/mvpRouteSeedData.ts`
- `app/api/flightaware/status/route.ts`
- `app/api/data-health/route.ts`
- `lib/supabase.ts`

## Current itinerary data pipeline

The itinerary search route is `GET app/api/itinerary/search/route.ts`. It parses the request with `normalizeItineraryRequest()`, validates airport/date inputs, then tries data sources in this order:

1. **FlightAware live schedule search** via `fetchFlightAwareScheduleFlights()`.
2. **Supabase stored flight rows** via `fetchSupabaseFlights()`.
3. **Aviationstack fallback search** via `fetchAviationstackFlights()`.
4. **Static MVP route seed test data** from `mvpRouteSeedData.ts`.
5. **Demo planning fallback** with no itinerary rows.

The API returns diagnostics in `debug`, including provider order, provider statuses, API response counts, route matching details, true-live availability, data freshness mode, safe errors, and schedule provider readiness.

## FlightAware integration

### What the current code supports

FlightAware is wired in two ways:

- **Primary live schedule path**: `createFlightAwareScheduleProvider()` in `lib/liveScheduleProviders.ts` calls:
  - `https://aeroapi.flightaware.com/aeroapi/schedules/{startDate}/{endDate}?origin={origin}&destination={destination}&max_pages=1`
  - Requires `FLIGHTAWARE_API_KEY`.
  - Requires both origin and destination.
  - Uses the requested date, or today's UTC date if no date is supplied.
  - Normalizes `data.scheduled` rows into `NormalizedScheduleResult`.
  - Maps missing schedule fields to `Not provided`.
- **Flight-number enrichment/status path**:
  - `enrichWithFlightAware()` calls `https://aeroapi.flightaware.com/aeroapi/flights/{ident}?max_pages=1` for up to 8 known flight identifiers from stored or fallback records.
  - `app/api/flightaware/status/route.ts` exposes a status endpoint requiring `ident` and `FLIGHTAWARE_API_KEY`.
  - `app/api/data-health/route.ts` probes `flights/UAL1?max_pages=1` as a FlightAware enrichment health check.

### Current capabilities declared in code

`createFlightAwareScheduleProvider()` declares:

- Future schedules: yes
- Current flight status: yes
- Route search: yes
- Flight-number enrichment: yes

### Current limitations in code

- The schedule search only runs for requests with both origin and destination.
- The schedule path reads only one page (`max_pages=1`).
- It does not persist live FlightAware schedule results into Supabase.
- `app/api/data-health/route.ts` still frames FlightAware primarily as enrichment and recommends implementing schedules, even though the itinerary route now calls FlightAware schedules first. That health copy is stale relative to the itinerary code.
- Provider failure, unexpected payload shape, missing key, rate limit, quota, or network failure safely downgrades to warning/skipped and falls through to stored/fallback data.

## Supabase integration

### What the current code supports

Supabase is used as stored flight data/cache, not as a live provider. `fetchSupabaseFlights()` reads `/rest/v1/flights` using:

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The query strategy is:

1. Direct route/date query when origin, destination, or date is present.
2. Connection-candidate query when both origin and destination are present.
3. Route-coverage query when targeted rows are absent or do not match.
4. Recent-row safety query when needed.

Rows are de-duplicated and assembled into itineraries with `buildItinerariesFromFlights()`.

`lib/supabase.ts` also creates a Supabase client from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for other app features.

### Current capabilities declared in code

The Supabase schedule-ingestion placeholder declares:

- Future schedules: yes, if stored/ingested rows exist
- Current flight status: no
- Route search: yes, across stored rows
- Flight-number enrichment: no

### What is stored data

Any itinerary returned from the Supabase path is stored data. The API labels this path with:

- `source: 'supabase-flights-first'`
- `source_provider: 'supabase'`
- `dataMode: 'stored-supabase'` for strict stored matches
- `dataMode: 'nearest-date-testing'` when personal testing mode applies a nearest-date match
- `trueLiveDataAvailable: false`

Stored Supabase rows may be enriched with FlightAware by flight number, but the base itinerary remains stored data rather than a current live schedule response.

## Aviationstack integration

### What the current code supports

Aviationstack is wired as a fallback after FlightAware schedules and Supabase stored rows fail to produce usable itineraries.

`createAviationstackScheduleProvider()` calls:

- `https://api.aviationstack.com/v1/flights`
- Query parameters from code: `access_key`, `limit`, optional `dep_iata`, `arr_iata`, `flight_date`, and optional `airline_iata`.
- Requires `AVIATIONSTACK_API_KEY`.

Rows from `data.data` are normalized into `NormalizedScheduleResult`, then converted to flight records for itinerary assembly.

### Current capabilities declared in code

`createAviationstackScheduleProvider()` declares:

- Future schedules: yes
- Current flight status: yes
- Route search: yes
- Flight-number enrichment: no

### Current limitations in code

- It is fallback-only in the itinerary pipeline.
- It uses `/v1/flights`; the code does not contain a separate future-schedules endpoint implementation.
- Carrier filtering is limited to the local `carrierIataCodes` map for United, Delta, and Alaska Group, or a raw uppercase carrier value.
- Rate limit, quota, credentials, unsupported endpoint, provider error, unexpected payload, or network failure are converted into safe warnings and do not break the itinerary response.

## Static MVP route seed test data

`lib/mvpRouteSeedData.ts` contains static route examples dated `2026-07-15`. The file explicitly says these rows are not live airline schedules, inventory, load data, or operational truth.

The itinerary API uses these rows only after:

1. FlightAware live schedules produce no itinerary.
2. Supabase stored rows produce no itinerary.
3. Aviationstack fallback produces no itinerary.

When static seed rows are used, the API returns:

- `source: 'mvp-route-seed-test-data'`
- `source_provider: 'demo'`
- `dataMode: 'test-data'` or `dataMode: 'nearest-date-testing'`
- `providerBadges: ['MVP test data']`
- `trueLiveDataAvailable: false`

## Nearest-date test data

Nearest-date matching is an explicit personal testing mode controlled by `personalTestingMode` or `testingMode` query params. The tolerance defaults to `PERSONAL_TESTING_NEAREST_DATE_TOLERANCE_DAYS` or `45`, clamped to 0–365 days.

Nearest-date matching can apply to:

- Supabase stored rows.
- Static MVP route seed rows.

It rewrites the effective match date to the closest available date within tolerance, but preserves diagnostics showing the requested date, effective match date, closest dates, and a warning. The API marks this as:

- `dataMode: 'nearest-date-testing'`
- `dataFreshnessLabel: 'Cached provider nearest-date test match'` for Supabase
- `dataFreshnessLabel: 'Demo provider nearest-date MVP test data'` for static seed data
- `trueLiveDataAvailable: false`

This path is for testing UI and itinerary assembly only. It should not be presented as strict-date live availability.

## Demo fallback data

Demo fallback is used when the parser cannot produce a complete route or when all provider and test-data paths fail. In this state the itinerary API returns no itinerary rows and instructs the UI to show fallback guidance.

Demo fallback responses use:

- `source: 'parser-safe-planning-fallback'` or `source: 'planning-fallback'`
- `source_provider: 'demo'`
- `dataMode: 'fallback'`
- `providerBadges: ['Demo provider']`
- `trueLiveDataAvailable: false`

This is not flight data. It is planning guidance only.

## Current capability matrix from code

| Provider/path | Future schedules | Current status | Route search | Flight-number enrichment | Current role |
| --- | --- | --- | --- | --- | --- |
| FlightAware AeroAPI | Declared yes; schedule endpoint is wired first. | Declared yes; `/flights/{ident}` is wired. | Declared yes; origin/destination required. | Declared yes; enrichment path exists. | Primary live itinerary provider and enrichment provider. |
| Supabase stored flights | Declared yes for stored/ingested rows. | Declared no by itself. | Declared yes over stored rows. | Declared no by itself. | Stored cache/fallback after FlightAware schedules. |
| Aviationstack | Declared yes. | Declared yes. | Declared yes through current `/v1/flights` filters. | Declared no. | Live-provider fallback after FlightAware and Supabase. |
| MVP route seed data | Static test rows only. | No. | Only routes hardcoded in seed file. | No. | Personal testing fallback. |
| Demo planning fallback | No flight data. | No. | No. | No. | Last-resort UI guidance. |

## What is needed for true live itinerary population

The current code already has a true-live route when FlightAware schedules or Aviationstack fallback return usable provider rows during the request. To make true live itinerary population production-ready and auditable, the remaining work is:

1. **Keep FlightAware first** for route/date schedule search and status enrichment, because this is the only primary live schedule path currently wired before stored data.
2. **Define freshness rules** for stored Supabase rows, including when a cached future schedule is acceptable, when same-day operational status must be re-enriched, and when stale cache must be hidden or downgraded.
3. **Add write-through ingestion only if desired**: persist normalized live provider results into Supabase with `source_provider`, `source_checked_at`, provider flight IDs, route/date fields, and any freshness/staleness metadata. Stored rows must remain labeled as stored on later reads.
4. **Expand provider observability**: record provider latency, zero-result rates, warnings, rate-limit/quota events, and payload-shape failures without exposing secrets.
5. **Reconcile stale health copy** in `app/api/data-health/route.ts` so the FlightAware health recommendation matches the current FlightAware-first schedule implementation.
6. **Decide pagination and coverage rules**: FlightAware currently requests one page, and Aviationstack uses a single fallback endpoint shape. Production may need paging, broader carrier support, and clearer date-window behavior.
7. **Keep test/demo separation strict**: nearest-date and MVP seed paths must continue to be labeled as testing/demo data and never counted as true live availability.

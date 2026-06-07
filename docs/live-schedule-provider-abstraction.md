# Live schedule provider abstraction

This document explains the schedule-provider interface added for future true live itinerary population. It is an abstraction only; it does not add paid integrations or change the current provider order.

## Goals

- Normalize provider schedule rows before itinerary assembly.
- Keep current Supabase-first and demo fallback behavior working.
- Make future providers pluggable without rewriting itinerary scoring/assembly.
- Keep provenance clear: current provider API responses can be labeled live; stored Supabase rows remain stored data.

## Provider interface

The interface lives in `lib/liveScheduleProviders.ts`.

```ts
type LiveScheduleProvider = {
  key: LiveScheduleProviderKey
  label: string
  capabilities: {
    futureSchedules: boolean
    currentFlightStatus: boolean
    routeSearch: boolean
    flightNumberEnrichment: boolean
  }
  searchSchedules: (request: LiveScheduleSearchRequest) => Promise<LiveScheduleProviderResponse>
}
```

Supported provider placeholders:

- Aviationstack
- FlightAware AeroAPI
- Amadeus
- Cirium/OAG
- Supabase schedule ingestion

Only Aviationstack is wired to the existing fallback API call today. The other providers are placeholders that return a safe skipped response and require no credentials.

## Normalized schedule result

All future providers should return this shape:

```ts
type NormalizedScheduleResult = {
  carrier: string
  flightNumber: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
  aircraft: string
  status: string
  source: LiveScheduleProviderKey | string
}
```

Use `scheduleResultsToFlightRecords()` to adapt normalized schedule results into the existing `FlightRecord` shape consumed by `buildItinerariesFromFlights()`.

## Current safe refactor

`app/api/itinerary/search/route.ts` now calls `createAviationstackScheduleProvider().searchSchedules()` inside the existing `fetchAviationstackFlights()` fallback wrapper. This preserves current behavior:

1. Supabase stored flights remain first.
2. FlightAware enrichment remains enrichment-only.
3. Aviationstack remains fallback after Supabase cannot assemble an itinerary.
4. MVP seed/demo fallback behavior remains unchanged.

## Plugging in a future live schedule provider

1. Add or replace a provider factory in `lib/liveScheduleProviders.ts`.
2. Implement `searchSchedules(request)` and return `NormalizedScheduleResult[]`.
3. Keep API keys optional and return `status: 'skipped'` with a safe `detail` when credentials are absent.
4. Do not log or return raw API keys, tokens, or full provider error payloads.
5. Convert provider-specific date/time fields into ISO-like departure/arrival strings where possible.
6. Set `source` to the provider key, for example `flightaware` or `amadeus`.
7. Feed results through `scheduleResultsToFlightRecords()` before itinerary assembly.
8. Label provenance correctly in the API/UI:
   - Provider API response returned during the itinerary request: `Live provider API data`
   - Persisted Supabase rows: `Stored Supabase flight data`
   - Personal-testing nearest-date rows: `Nearest-date testing data`
   - Static/scaffold fallback cards: `Demo fallback data`

## Recommended next provider path

Use FlightAware AeroAPI as the first future primary live schedule provider. The prior live data audit found that the configured FlightAware account can return future route schedules through the schedules endpoint, while the current Aviationstack account was quota-blocked. Keep Aviationstack as secondary/fallback after quota and endpoint choices are resolved.

## Supabase schedule ingestion

Supabase ingestion is modeled as a provider placeholder so future background jobs can normalize and store schedules consistently. Ingested rows must still be labeled as stored data when later read from Supabase. Storage/caching improves performance and auditability, but it does not make those rows true live provider API data.

# Live flight data plan

Last audited: 2026-06-04 13:54 UTC

## Scope

This is an audit only. No feature changes are included. It reviews the existing Aviationstack and FlightAware integrations, the configured-provider probes run during the audit, and the best path for true live itinerary population.

## Current app integrations

### Aviationstack

Current code path: `app/api/itinerary/search/route.ts` → `fetchAviationstackFlights()`.

- Endpoint used today: `GET https://api.aviationstack.com/v1/flights`
- Filters used today: `dep_iata`, `arr_iata`, `flight_date`, `airline_iata`, `limit`
- Role in app today: fallback provider after stored Supabase rows cannot assemble an itinerary.
- Current limitation: this code path is the Aviationstack real-time/historical `flights` endpoint, not the dedicated future schedule endpoint.

### FlightAware AeroAPI

Current code paths:

- `app/api/itinerary/search/route.ts` → `enrichWithFlightAware()`
- `app/api/flightaware/status/route.ts`
- `app/api/data-health/route.ts` → `checkFlightAware()`

Endpoint used today:

- `GET https://aeroapi.flightaware.com/aeroapi/flights/{ident}`

Role in app today: enrich known flight numbers returned by Supabase or Aviationstack. It is not yet used as the primary schedule/route itinerary source.

## Provider capability matrix

| Capability | Aviationstack | FlightAware AeroAPI | Current configured-account result |
| --- | --- | --- | --- |
| Future schedules | Supported by Aviationstack `flightsFuture`, documented as Basic Plan and higher. It is airport/date based (`iataCode`, `type`, `date`) with optional airline/flight filters, not an origin/destination route query by itself. | Supported by AeroAPI `GET /schedules/{date_start}/{date_end}`. Probe with `origin=KLAX&destination=PHNL` returned scheduled rows. Airport scheduled-departure endpoint is more limited for far-future queries. | Aviationstack probes returned `usage_limit_reached` on all tested endpoints, so current key cannot populate now. FlightAware schedule route probe succeeded. |
| Current flight status | Supported by Aviationstack `flights`, available on all plans according to docs. | Supported by AeroAPI `GET /flights/{ident}` and airport flight endpoints. | Aviationstack unavailable due monthly usage limit. FlightAware `GET /flights/UAL1` probe succeeded. |
| Route search | Aviationstack `routes` endpoint is documented as Basic Plan and higher and returns airline route data updated every 24 hours; it is not enough by itself to create dated itinerary options. | AeroAPI has `GET /airports/{id}/flights/to/{dest_id}` for specific origin/destination and `GET /airports/{id}/routes/{dest_id}` for routes between airports. | Aviationstack route probe returned `usage_limit_reached`. FlightAware origin/destination probe `KLAX` → `PHNL` succeeded. |
| Flight-number enrichment | Can return flight identifiers in `flights` / `flightsFuture`, but the app does not use Aviationstack as an enrichment layer. | Strong fit: existing code already enriches via `GET /flights/{ident}`. | FlightAware enrichment probe succeeded. |

## Probe results from configured keys

A sanitized local probe was run without printing API keys.

### Aviationstack

All tested calls returned HTTP `429` with code `usage_limit_reached`:

- `/v1/flights?dep_iata=LAX&arr_iata=HNL&flight_date=2026-07-15`
- `/v1/flightsFuture?iataCode=LAX&type=departure&date=2026-07-15`
- `/v1/routes?dep_iata=LAX&arr_iata=HNL`

Conclusion: the configured Aviationstack account cannot currently supply true live itinerary population because its monthly usage limit is exhausted. Even when quota is available, future itinerary population would need the app to use `flightsFuture` plus local route filtering, not the current `/v1/flights` fallback alone.

### FlightAware AeroAPI

Tested calls:

- `GET /flights/UAL1?max_pages=1` → HTTP `200`, returned flight rows.
- `GET /airports/KLAX/flights/to/PHNL?max_pages=1` → HTTP `200`, returned route flight rows.
- `GET /schedules/2026-07-15T00:00:00Z/2026-07-16T00:00:00Z?origin=KLAX&destination=PHNL&max_pages=1` → HTTP `200`, returned scheduled rows.
- `GET /airports/KLAX/flights/scheduled_departures?start=2026-07-15T00:00:00Z&end=2026-07-16T00:00:00Z` → HTTP `400`, `Invalid start bound: time is too far in the future (limit: 2 days)`.

Conclusion: the configured FlightAware account supports the schedule/route primitives needed for true live future itinerary population. Use `GET /schedules/{date_start}/{date_end}` for future route schedules, not airport `scheduled_departures` for dates beyond its short window.

## Recommended provider path

Recommendation: make FlightAware AeroAPI the primary source for true live itinerary population, with Aviationstack retained as secondary/fallback once quota/plan are healthy.

Why FlightAware should lead:

1. The configured FlightAware key successfully returned future scheduled route rows for `KLAX` → `PHNL` on `2026-07-15`.
2. FlightAware already powers the app's flight-number enrichment path, so the data model fit is better than adding another primary provider shape.
3. AeroAPI exposes route-specific and schedule-specific endpoints. That maps directly to itinerary search by origin, destination, carrier, and date.
4. Aviationstack is currently quota-blocked and the app's existing Aviationstack endpoint is not the dedicated future schedule endpoint.

Suggested non-feature implementation path for a future change:

1. Add a FlightAware schedule adapter around `GET /schedules/{date_start}/{date_end}`.
2. Normalize scheduled rows into the existing `FlightRecord` shape used by `buildItinerariesFromFlights()`.
3. Query FlightAware schedules before Aviationstack when the user supplies a future date and route.
4. Keep Supabase as stored/cache data only, clearly labeled as stored.
5. Optionally persist normalized FlightAware schedule rows to Supabase with source/fetched-at metadata so stored data remains auditable.
6. Keep Aviationstack as fallback for current-day status or as future schedule fallback after resolving quota/plan, using `flightsFuture` rather than overloading `/v1/flights`.

## Source notes

- Aviationstack documentation describes `flights` as real-time, `routes` as Basic Plan and higher, and `flightsFuture` as Basic Plan and higher for future schedules.
- FlightAware AeroAPI pricing/docs list `GET /flights/{ident}`, `GET /airports/{id}/flights/to/{dest_id}`, `GET /airports/{id}/routes/{dest_id}`, airport scheduled arrival/departure endpoints, and `GET /schedules/{date_start}/{date_end}`.

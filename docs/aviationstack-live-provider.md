# Aviationstack live provider adapter

Aviationstack is wired into the beta Search Execution Engine as a server-side schedule/status provider. It is not a nonrev availability provider.

## Supplies

- Provider-reported flight dates and flight status.
- Departure and arrival airport codes when returned.
- Scheduled, estimated, and actual departure/arrival timestamps when returned.
- Airline name/code and flight number when returned.
- Terminal, gate, aircraft registration, and aircraft type metadata when returned.
- Provider fetch timestamp and provider record attribution.

## Does Not Supply

- Employee standby lists.
- Exact open seats or standby load counts.
- Nonrev boarding probability.
- ZED, ID90, or myIDTravel eligibility.
- Fare availability.
- Guaranteed future operation.

## Configuration

Set `AVIATIONSTACK_API_KEY` on the server only. Values are trimmed, placeholders are treated as missing, and credentials are never serialized in API responses or browser bundles.

## Readiness

- `ready`: server key is configured and the provider can execute.
- `credential_missing`: key is absent or placeholder-like.
- `degraded`: configured, but the provider returned a recoverable warning or malformed/limited data.
- `rate_limited`: quota or rate-limit response.
- `timed_out`: request exceeded provider timeout.
- `unsupported_request`: no valid airport pair exists or the endpoint/account cannot serve the request.

## Cache Behavior

The execution adapter caches normalized provider responses by provider, endpoint, origin, destination, date, offset, and limit. Same-day status data uses a short TTL of about 3 minutes. Future schedule data uses about 45 minutes. Provider warnings/errors use a short negative cache of about 45 seconds.

## API Integration

`POST /api/search` runs the static recommendation pipeline first to assemble route-framework segments, then asks Aviationstack only for deterministic airport-pair flight segments. Region text is never sent as an airport code. Provider failures return warnings and diagnostics in `providerRuns`; recoverable provider failure does not turn the search response into HTTP 500.

## Adding Another Provider Later

Add another `SearchExecutionProvider` adapter that returns canonical execution itineraries with provider attribution, safe diagnostics, and explicit capabilities. Preserve the endpoint/mode/date/direction matching rules before overlaying any provider fields onto route-framework segments.

Schedule/status data remains separate from nonrev load availability because it describes operation of a flight, not employee standby demand or seats available to nonrevenue travelers.

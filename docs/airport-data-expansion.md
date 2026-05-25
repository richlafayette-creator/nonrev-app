# Airport and Flight Data Expansion Scaffold

Nonrevy is being designed to search across all commercial airports and all available passenger flights, but production coverage depends on the data providers and plans we connect.

## Coverage reality

- Actual flight coverage depends on Aviationstack/API plan limits, endpoint access, rate limits, historical depth, and commercial licensing.
- Some providers limit live flight status, schedules, aircraft, terminals, gates, delays, or airport metadata by plan tier.
- Cargo-only, military, private, charter, and unavailable carrier inventory should be excluded unless a licensed provider explicitly supports it.
- The app should treat missing fields as normal and show graceful placeholders instead of blocking search or itinerary planning.

## Future airport and passenger-flight data needs

### Flight operations

- Flight number, airline/operator, codeshares
- Origin/destination airport IATA/ICAO
- Departure and arrival scheduled times
- Estimated/actual departure and arrival times
- Boarding time
- Delay minutes and delay reason
- Flight status lifecycle
- Aircraft type, tail number where licensed
- Terminal and gate for departure and arrival

### Airport maps and GPS

- Airport terminal maps or deep links to provider maps
- Gate and lounge coordinates where available
- User GPS location placeholders for future wayfinding
- Walking time estimates between gates, lounges, security, and terminals
- Map licensing review before embedding any third-party tiles or terminal maps

### Lounges nearby

- Lounge provider/API data for name, access rules, terminal, gate proximity, hours, and amenities
- Card/member eligibility integrations only after privacy and terms review
- Graceful fallback: “Lounges nearby not available yet”

### Provider candidates and constraints

- Aviationstack or similar APIs for schedules/live flight status, subject to plan limits.
- Airport/lounges/maps providers for terminal, gate, GPS, and lounge metadata.
- Airline direct APIs or GDS/NDC sources only where terms permit this product use.

## Implementation shape

1. Keep `flights` as the searchable core table.
2. Add nullable columns for richer flight details so partial provider coverage works.
3. Add import audit tables for provider, plan tier, endpoint, row counts, failures, and source timestamps.
4. Keep the UI data-driven: render all DB fields when available, plus clear placeholders for missing fields.
5. Use server-side ingestion and caching before adding any paid provider keys.

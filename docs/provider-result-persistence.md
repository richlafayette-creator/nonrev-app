# Provider result persistence scaffold

See [`docs/provider-results-persistence.md`](./provider-results-persistence.md) for the current provider result persistence architecture, and [`docs/provider-results-table.sql`](./provider-results-table.sql) for the manual Supabase table scaffold.

Key defaults remain unchanged:

- Provider result persistence is off/no-op unless `NONREVY_STORE_PROVIDER_RESULTS=true` is set server-side.
- Only FlightAware schedule-search results are wired to the persistence repository.
- Supabase write failures fall back to local/no-op behavior and must not block itinerary results.
- `SUPABASE_SERVICE_ROLE_KEY` must remain server-only and must never be exposed to client code.

# Provider results persistence architecture

Provider result persistence is a server-side scaffold for storing normalized live itinerary rows returned by provider schedule searches. It is **off by default** and preserves existing itinerary behavior when disabled or unavailable.

## Runtime switch

Persistence only runs when this server-side environment variable is set exactly:

```bash
NONREVY_STORE_PROVIDER_RESULTS=true
```

Any other value, including an unset variable, uses the no-op repository. This is the default behavior.

## Repository abstraction

The server-side repository lives in `lib/providerResultRepository.ts` and exposes:

- `createProviderResultRepository()`
- `storeNormalizedResults(results)`
- `normalizedResultToProviderResultRecord(result)`

The repository stores normalized records with these fields:

- `source_provider`
- `source_checked_at`
- `origin`
- `destination`
- `departure_time`
- `arrival_time`
- `flight_number`
- `carrier`
- `aircraft`
- `status`

FlightAware schedule search is the only current provider wired to call this repository. Aviationstack fallback rows, stored Supabase rows, demo rows, and planning-only rows are not persisted by this scaffold.

## Supabase table

The manual SQL scaffold is in [`docs/provider-results-table.sql`](./provider-results-table.sql). It creates `public.provider_itinerary_results` with the normalized fields above plus `id` and `created_at`, and indexes:

- `origin`
- `destination`
- `departure_time`
- `carrier`
- `source_provider`

Do not apply the migration automatically from application startup, build scripts, or deploy hooks.

## Fallback behavior

If persistence is disabled, Supabase is not configured, the table is unavailable, RLS rejects the insert, or the write times out, the repository returns a local/no-op fallback result. Search results continue to render normally; persistence failure must never block itinerary planning.

## Server-only secrets

Set these only in server/runtime secret configuration:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
NONREVY_STORE_PROVIDER_RESULTS=true
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code, `NEXT_PUBLIC_*` variables, bundled components, or browser APIs. Client-side Supabase usage should continue using anon keys only.

## RLS and security notes

`provider_itinerary_results` should keep RLS enabled and should not have anon/authenticated read policies by default. Server writes use the Supabase service-role key, which bypasses RLS.

If a future UI needs provider result data, prefer a server API route that returns reviewed and/or aggregated fields. Do not expose raw provider rows to browser clients without reviewing provider licensing, retention, privacy, and abuse implications.

## Data Health diagnostics

The Data Health API includes a server-side provider result persistence diagnostics section. It reports:

- whether `NONREVY_STORE_PROVIDER_RESULTS=true` is enabled or disabled
- whether `provider_itinerary_results` is reachable from the server
- total stored provider records count
- newest stored provider record timestamp
- provider coverage grouped by `source_provider`

If persistence is disabled, the dashboard explains that FlightAware schedule results remain no-op/off because `NONREVY_STORE_PROVIDER_RESULTS` is not set to `true`. Diagnostics use server-side Supabase requests only and never return Supabase credentials.

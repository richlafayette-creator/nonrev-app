# Provider result persistence scaffold

Normalized live provider itinerary results are **not stored by default**. The scaffold only attempts to persist FlightAware schedule-search results when this server-side environment variable is set exactly:

```bash
NONREVY_STORE_PROVIDER_RESULTS=true
```

When the flag is missing or any value other than `true`, the repository is a no-op. If the flag is enabled but Supabase is not configured, the table is missing, RLS rejects the insert, or the insert times out, the repository falls back to a local/no-op result and itinerary search continues unchanged.

## Server-only environment

Set these only in server/runtime secret configuration:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
NONREVY_STORE_PROVIDER_RESULTS=true
```

Do **not** put `SUPABASE_SERVICE_ROLE_KEY` in any `NEXT_PUBLIC_` variable and do not import the provider result repository into client components. Client-side Supabase code should continue using anon keys only.

## Migration scaffold

A manual Supabase migration scaffold is available at [`docs/provider-itinerary-results-migration.sql`](./provider-itinerary-results-migration.sql). Do not apply it automatically from application startup, build scripts, or deploy hooks.

The scaffold creates `provider_itinerary_results` with these fields:

- `id`
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
- `raw_payload jsonb`
- `created_at`

It also adds indexes for `origin`, `destination`, `departure_time`, `carrier`, and `source_provider`.

`departure_time` and `arrival_time` are stored as text because providers may send ISO timestamps, local strings, or placeholder values such as `Not provided`. `raw_payload` is reserved for later provider-specific metadata/debug context and should not be exposed to browser clients without review.

## RLS and security notes

Enable RLS and deny browser/client reads by default. The migration scaffold includes:

```sql
alter table public.provider_itinerary_results enable row level security;

-- No anon/authenticated policies are included in this scaffold.
-- Supabase service-role requests bypass RLS for server-side persistence.
```

If a future UI needs to read this table, add narrow read policies or a server API route that returns only safe, aggregated data. Do not expose raw provider rows or `raw_payload` directly to browser clients without reviewing provider licensing, retention, and privacy requirements.

## Current behavior

- Default behavior remains off/no-op unless `NONREVY_STORE_PROVIDER_RESULTS=true` is set server-side.
- FlightAware schedule results are normalized first, then persistence is attempted by the server-side repository.
- When this persistence path is promoted, `NONREVY_STORE_PROVIDER_RESULTS=true` will make the server-side repository insert normalized provider rows into `provider_itinerary_results` after the manual migration has been applied.
- Until that follow-up wiring is promoted, the repository continues to use the existing scaffold/fallback behavior and must remain safe to run when the new table is absent.
- Aviationstack and stored Supabase fallback rows are not persisted by this scaffold.
- Persistence failure never blocks search results; it returns a no-op fallback internally and preserves existing itinerary behavior.

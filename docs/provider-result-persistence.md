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

## Required table

The repository writes to `provider_live_itinerary_results` with these normalized fields:

```sql
create table if not exists public.provider_live_itinerary_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_provider text not null,
  source_checked_at timestamptz not null,
  origin text not null,
  destination text not null,
  departure_time text not null,
  arrival_time text not null,
  flight_number text not null,
  carrier text not null,
  aircraft text not null,
  status text not null
);

create index if not exists provider_live_itinerary_results_route_idx
  on public.provider_live_itinerary_results (origin, destination, departure_time);

create index if not exists provider_live_itinerary_results_source_checked_idx
  on public.provider_live_itinerary_results (source_provider, source_checked_at desc);
```

`departure_time` and `arrival_time` are stored as text because providers may send ISO timestamps, local strings, or placeholder values such as `Not provided`.

## RLS and security notes

Enable RLS and deny browser/client reads by default:

```sql
alter table public.provider_live_itinerary_results enable row level security;

-- No anon/authenticated policies are required for this scaffold.
-- Server writes use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
```

If a future UI needs to read this table, add narrow read policies or a server API route that returns only safe, aggregated data. Do not expose raw provider rows directly to browser clients without reviewing provider licensing, retention, and privacy requirements.

## Current behavior

- FlightAware schedule results are normalized first, then persistence is attempted.
- Aviationstack and stored Supabase fallback rows are not persisted by this scaffold.
- Persistence failure never blocks search results; it returns a no-op fallback internally and preserves existing itinerary behavior.

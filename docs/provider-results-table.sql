-- Provider results table scaffold for normalized live itinerary provider rows.
--
-- Apply this migration manually in Supabase only when provider result persistence is
-- ready to be enabled. The app must not run this SQL automatically during build,
-- startup, or deploy.
--
-- Security notes:
-- - Keep row level security enabled.
-- - Do not add anon/authenticated browser policies by default.
-- - Server-side writes should use SUPABASE_SERVICE_ROLE_KEY from server-only
--   runtime configuration. Never expose service-role keys through NEXT_PUBLIC_*
--   variables or client components.
-- - If a future UI needs to read these rows, prefer a server API route that
--   returns reviewed/aggregated fields, or add least-privilege RLS policies after
--   provider licensing, retention, and privacy review.

create table if not exists public.provider_itinerary_results (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null,
  source_checked_at timestamptz not null,
  origin text not null,
  destination text not null,
  departure_time text not null,
  arrival_time text not null,
  flight_number text not null,
  carrier text not null,
  aircraft text not null,
  status text not null,
  provider_request_hash text not null default 'legacy-provider-request',
  provider_request_scope text not null default 'legacy-provider-request',
  result_fingerprint text not null default 'legacy-result-fingerprint',
  provenance_version text not null default 'provider-result-provenance-v1',
  created_at timestamptz not null default now()
);

create index if not exists provider_itinerary_results_origin_idx
  on public.provider_itinerary_results (origin);

create index if not exists provider_itinerary_results_destination_idx
  on public.provider_itinerary_results (destination);

create index if not exists provider_itinerary_results_departure_time_idx
  on public.provider_itinerary_results (departure_time);

create index if not exists provider_itinerary_results_carrier_idx
  on public.provider_itinerary_results (carrier);

create index if not exists provider_itinerary_results_source_provider_idx
  on public.provider_itinerary_results (source_provider);

create index if not exists provider_itinerary_results_request_hash_idx
  on public.provider_itinerary_results (provider_request_hash);

create index if not exists provider_itinerary_results_fingerprint_idx
  on public.provider_itinerary_results (result_fingerprint);

alter table public.provider_itinerary_results enable row level security;

-- No anon/authenticated policies are included in this scaffold.
-- Supabase service-role requests bypass RLS for server-side persistence.
-- Add explicit, least-privilege policies only after client-readable provider
-- result data is reviewed and approved.

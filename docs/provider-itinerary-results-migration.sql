-- Provider itinerary results persistence scaffold
--
-- This migration is intentionally documentation-only until applied manually in Supabase.
-- Do not run it automatically from application startup or build scripts.
--
-- Security model:
-- - Keep row level security enabled.
-- - Do not create anon/authenticated read policies by default.
-- - Server-side writes should use the Supabase service-role key from server-only
--   runtime configuration. Never expose that key to client/browser code.
-- - If product UI needs this data later, prefer a server API that returns only
--   reviewed/aggregated fields, or add narrow read policies after provider
--   licensing, retention, and privacy review.

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
  raw_payload jsonb not null default '{}'::jsonb,
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

alter table public.provider_itinerary_results enable row level security;

-- No anon/authenticated policies are included in this scaffold.
-- Supabase service-role requests bypass RLS for server-side persistence.
-- Add explicit, least-privilege policies only if/when client-readable provider
-- result data is reviewed and approved.

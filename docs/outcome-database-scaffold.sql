-- NONREVY outcome database scaffold
-- Draft only: do not apply to production until account identity, RLS, and migration ordering are finalized.
-- Runtime currently uses lib/outcomeRepository.ts with local storage fallback.

create table if not exists public.trip_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  subject_type text not null check (subject_type in ('route-recommendation', 'saved-itinerary', 'outcome-reminder')),
  subject_id text not null,
  title text not null,
  route text not null,
  route_outcome text not null default 'Route outcome',
  status text not null check (status in ('Yes, got on', 'No, did not get on', 'Cancelled trip')),
  success boolean null,
  cancelled boolean not null default false,
  notes text not null default '',
  traveler_profile_snapshot jsonb not null default '{}'::jsonb,
  source text not null default 'Database' check (source in ('Local', 'Database')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_outcomes_user_id_created_at_idx
  on public.trip_outcomes (user_id, created_at desc);

create index if not exists trip_outcomes_route_created_at_idx
  on public.trip_outcomes (route, created_at desc);

-- Future RLS sketch:
-- alter table public.trip_outcomes enable row level security;
-- create policy "Users can read own trip outcomes" on public.trip_outcomes
--   for select using (auth.uid() = user_id);
-- create policy "Users can insert own trip outcomes" on public.trip_outcomes
--   for insert with check (auth.uid() = user_id);
-- create policy "Users can update own trip outcomes" on public.trip_outcomes
--   for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

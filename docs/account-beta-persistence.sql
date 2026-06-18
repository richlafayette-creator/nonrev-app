-- Account-backed beta persistence for NONREVY private beta.
-- Apply manually in Supabase. Server routes use SUPABASE_SERVICE_ROLE_KEY and keep browser localStorage fallback.

create table if not exists public.nonrevy_saved_searches (
  id text primary key,
  user_id text not null,
  route text,
  category text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nonrevy_saved_searches_user_updated_idx
  on public.nonrevy_saved_searches (user_id, updated_at desc);

create index if not exists nonrevy_saved_searches_user_route_idx
  on public.nonrevy_saved_searches (user_id, route);

create table if not exists public.nonrevy_beta_feedback (
  id text primary key,
  user_id text not null,
  route text,
  category text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nonrevy_beta_feedback_user_updated_idx
  on public.nonrevy_beta_feedback (user_id, updated_at desc);

create index if not exists nonrevy_beta_feedback_user_category_idx
  on public.nonrevy_beta_feedback (user_id, category);

create table if not exists public.nonrevy_trip_outcomes (
  id text primary key,
  user_id text not null,
  route text,
  category text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nonrevy_trip_outcomes_user_updated_idx
  on public.nonrevy_trip_outcomes (user_id, updated_at desc);

create index if not exists nonrevy_trip_outcomes_user_route_idx
  on public.nonrevy_trip_outcomes (user_id, route);

create index if not exists nonrevy_trip_outcomes_user_category_idx
  on public.nonrevy_trip_outcomes (user_id, category);

-- RLS can remain disabled for these private-beta tables if only server-side service-role routes access them.
-- If direct client access is added later, enable RLS and map user_id to auth.uid()-scoped policies first.

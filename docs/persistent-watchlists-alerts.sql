-- Persistent watchlists and alerts for beta cross-device sync.
-- Apply manually in Supabase. Server API uses SUPABASE_SERVICE_ROLE_KEY and stores each user's
-- watch/alert payload under a service-derived user/device owner key.

create table if not exists public.nonrevy_watchlist_items (
  id text primary key,
  user_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nonrevy_watchlist_items_user_updated_idx
  on public.nonrevy_watchlist_items (user_id, updated_at desc);

create table if not exists public.nonrevy_alert_history (
  id text primary key,
  user_id text not null,
  event_key text,
  read boolean not null default false,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nonrevy_alert_history_user_created_idx
  on public.nonrevy_alert_history (user_id, created_at desc);

create index if not exists nonrevy_alert_history_user_event_idx
  on public.nonrevy_alert_history (user_id, event_key);

create table if not exists public.nonrevy_alert_snapshots (
  id text primary key,
  user_id text not null,
  target_id text,
  target_type text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists nonrevy_alert_snapshots_user_target_idx
  on public.nonrevy_alert_snapshots (user_id, target_type, target_id);

-- RLS can remain disabled for these tables if only server-side service-role routes access them.
-- If client-side access is added later, enable RLS and map user_id to auth.uid()-scoped policies first.

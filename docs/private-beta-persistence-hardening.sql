-- Private-beta persistence hardening.
--
-- Scope:
--   1. Add account-backed tables used by /api/beta-feedback and /api/saved-searches.
--   2. Add a DB-level uniqueness guard for one canonical load response per request.
--
-- Safety:
--   - Additive only.
--   - No drops, renames, or destructive type changes.
--   - Run the duplicate-response audit before applying the unique index.
--   - Current server routes use SUPABASE_SERVICE_ROLE_KEY; browser clients do not receive service-role credentials.

begin;

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

alter table public.nonrevy_saved_searches enable row level security;

drop policy if exists nonrevy_saved_searches_owner_select on public.nonrevy_saved_searches;
create policy nonrevy_saved_searches_owner_select
  on public.nonrevy_saved_searches
  for select
  using (user_id = ('user:' || auth.uid()::text));

drop policy if exists nonrevy_saved_searches_owner_insert on public.nonrevy_saved_searches;
create policy nonrevy_saved_searches_owner_insert
  on public.nonrevy_saved_searches
  for insert
  with check (user_id = ('user:' || auth.uid()::text));

drop policy if exists nonrevy_saved_searches_owner_update on public.nonrevy_saved_searches;
create policy nonrevy_saved_searches_owner_update
  on public.nonrevy_saved_searches
  for update
  using (user_id = ('user:' || auth.uid()::text))
  with check (user_id = ('user:' || auth.uid()::text));

drop policy if exists nonrevy_saved_searches_owner_delete on public.nonrevy_saved_searches;
create policy nonrevy_saved_searches_owner_delete
  on public.nonrevy_saved_searches
  for delete
  using (user_id = ('user:' || auth.uid()::text));

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

alter table public.nonrevy_beta_feedback enable row level security;

drop policy if exists nonrevy_beta_feedback_owner_select on public.nonrevy_beta_feedback;
create policy nonrevy_beta_feedback_owner_select
  on public.nonrevy_beta_feedback
  for select
  using (user_id = ('user:' || auth.uid()::text));

drop policy if exists nonrevy_beta_feedback_owner_insert on public.nonrevy_beta_feedback;
create policy nonrevy_beta_feedback_owner_insert
  on public.nonrevy_beta_feedback
  for insert
  with check (user_id = ('user:' || auth.uid()::text));

drop policy if exists nonrevy_beta_feedback_owner_update on public.nonrevy_beta_feedback;
create policy nonrevy_beta_feedback_owner_update
  on public.nonrevy_beta_feedback
  for update
  using (user_id = ('user:' || auth.uid()::text))
  with check (user_id = ('user:' || auth.uid()::text));

drop policy if exists nonrevy_beta_feedback_owner_delete on public.nonrevy_beta_feedback;
create policy nonrevy_beta_feedback_owner_delete
  on public.nonrevy_beta_feedback
  for delete
  using (user_id = ('user:' || auth.uid()::text));

commit;

-- Preflight audit for live duplicates. This query must return zero rows before
-- the unique index below can be applied without failing.
--
-- select request_id, count(*)
-- from public.load_responses
-- where request_id is not null
-- group by request_id
-- having count(*) > 1;

do $$
begin
  if exists (
    select 1
    from public.load_responses
    where request_id is not null
    group by request_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate load_responses.request_id rows exist; resolve duplicates before applying load_responses_one_response_per_request_idx.';
  end if;
end $$;

create unique index if not exists load_responses_one_response_per_request_idx
  on public.load_responses (request_id)
  where request_id is not null;

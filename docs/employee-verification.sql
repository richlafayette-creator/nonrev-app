-- Employee verification persistence for the private beta.
-- Additive only. Apply through the normal Supabase migration path after review.
--
-- Privacy posture:
-- - Store verification outcome, airline, method, domain/hash, and audit timestamps.
-- - Do not store government ID images.
-- - Do not store temporary manual-review evidence here.
-- - If evidence uploads are later enabled, use a private short-retention bucket and
--   delete reviewed objects after approval/rejection.

create table if not exists public.nonrevy_employee_verification (
  id text primary key,
  user_id text not null,
  status text not null check (status in ('unverified', 'pending', 'verified', 'rejected', 'expired', 'reverify_required')),
  airline_code text not null,
  airline_name text not null,
  method text not null check (method in ('company_email', 'manual_review', 'operator_verified')),
  email_domain text,
  work_email_hash text,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  review_source text,
  reason_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nonrevy_employee_verification_user_updated_idx
  on public.nonrevy_employee_verification (user_id, updated_at desc);

create index if not exists nonrevy_employee_verification_status_submitted_idx
  on public.nonrevy_employee_verification (status, submitted_at asc);

alter table public.nonrevy_employee_verification enable row level security;

drop policy if exists "employee verification owner read" on public.nonrevy_employee_verification;
create policy "employee verification owner read"
  on public.nonrevy_employee_verification
  for select
  using (user_id = ('user:' || auth.uid()::text));

drop policy if exists "employee verification owner insert pending" on public.nonrevy_employee_verification;
create policy "employee verification owner insert pending"
  on public.nonrevy_employee_verification
  for insert
  with check (
    user_id = ('user:' || auth.uid()::text)
    and status = 'pending'
    and method in ('company_email', 'manual_review')
  );

-- Operator review uses server-side service-role access only.
-- Do not add browser policies that allow users to update status to verified.

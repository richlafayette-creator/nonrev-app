-- Autonomous employee work-email verification challenges.
-- Additive only. Apply through the normal Supabase migration path after review.
--
-- Privacy/security posture:
-- - Do not store raw work email addresses.
-- - Store only domain, HMAC/hash metadata, code HMAC, and magic-token digest.
-- - Browser users must not be able to consume challenges or mark themselves verified
--   directly through Supabase. Trusted server code uses service-role access.

create table if not exists public.nonrevy_employee_email_verification_challenge (
  id text primary key,
  user_id text not null,
  verification_record_id text not null,
  airline_code text not null,
  airline_name text not null,
  email_domain text not null,
  work_email_hash text not null,
  magic_token_hash text not null,
  code_hmac text not null,
  status text not null check (status in ('pending', 'consumed', 'expired', 'locked')),
  attempt_count integer not null default 0,
  send_count integer not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  last_sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nonrevy_email_challenge_user_status_idx
  on public.nonrevy_employee_email_verification_challenge (user_id, status, created_at desc);

create index if not exists nonrevy_email_challenge_record_idx
  on public.nonrevy_employee_email_verification_challenge (verification_record_id, created_at desc);

create index if not exists nonrevy_email_challenge_expiry_idx
  on public.nonrevy_employee_email_verification_challenge (expires_at);

alter table public.nonrevy_employee_email_verification_challenge enable row level security;

-- Challenge creation, resend, consumption, and status transitions use trusted
-- server-side service-role access only.
-- Do not add public select/update policies for this table: code HMACs and
-- magic-token digests are server-only challenge material.

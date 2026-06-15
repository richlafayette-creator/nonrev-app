-- Community Loads MVP foundation
-- Phase 1: collect/display load reports without integrating them into scoring yet.

create table if not exists public.community_load_contributor_reputation (
  contributor_id text primary key,
  total_reports integer not null default 0 check (total_reports >= 0),
  accepted_reports integer not null default 0 check (accepted_reports >= 0),
  trust_score integer not null default 50 check (trust_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_load_reports (
  id uuid primary key default gen_random_uuid(),
  contributor_id text not null references public.community_load_contributor_reputation(contributor_id),
  flight_number text not null,
  carrier text,
  route text,
  origin text,
  destination text,
  flight_date date not null,
  available_seats integer not null check (available_seats >= 0),
  standby_count integer not null check (standby_count >= 0),
  cabin text,
  notes text,
  source_trust_score integer not null default 50 check (source_trust_score between 0 and 100),
  -- Future-ready outcome fields for scoring calibration.
  boarded_result boolean,
  missed_result boolean,
  cabin_upgrade_result boolean,
  gate_clear_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_load_reports_flight_date_idx
  on public.community_load_reports (flight_number, flight_date, created_at desc);

create index if not exists community_load_reports_route_date_idx
  on public.community_load_reports (origin, destination, flight_date, created_at desc);

create or replace view public.community_load_report_freshness as
select
  report.*,
  case
    when report.created_at > now() - interval '60 minutes' then 'Fresh'
    when report.created_at > now() - interval '4 hours' then 'Recent'
    else 'Stale'
  end as freshness_level
from public.community_load_reports report;

-- Future scoring architecture anchors:
-- community_load_reports: open seats, standby pressure, freshness, source trust, report volume
-- trip outcomes: boarded/missed historical calibration
-- recovery options: backup departures and alternate routing resilience
-- carrier performance: reliability/source coverage weighting
-- route complexity: nonstop vs connection damping and airport disruption exposure

-- Reputation/trust scoring follow-up: local and API scaffolds now track validation feedback
-- separately from report volume so contributor trust can rise with corroborated reports and
-- fall when reports are repeatedly marked outdated or inaccurate.
alter table if exists public.community_load_contributor_reputation
  add column if not exists confirmed_validations integer not null default 0 check (confirmed_validations >= 0),
  add column if not exists outdated_validations integer not null default 0 check (outdated_validations >= 0),
  add column if not exists inaccurate_validations integer not null default 0 check (inaccurate_validations >= 0),
  add column if not exists average_source_trust_score integer not null default 50 check (average_source_trust_score between 0 and 100),
  add column if not exists trust_level text not null default 'New';

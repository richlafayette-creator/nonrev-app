-- MVP Supabase seed data for nonrev flight search testing.
--
-- This file is intentionally static, realistic-looking test data. It is not live
-- airline inventory, does not represent bookable schedules, and must not be used
-- as operational flight data.
--
-- Production safety:
-- - Review the target database before running.
-- - Run this only in local, preview, staging, or other MVP test databases.
-- - The insert is idempotent by flight_number + origin + destination + departure_time
--   and will skip matching rows instead of updating or overwriting existing data.
-- - It assumes public.flights has these columns:
--   flight_number, carrier, origin, destination, departure_time, arrival_time,
--   aircraft, status, score.

begin;

with mvp_flights (
  flight_number,
  carrier,
  origin,
  destination,
  departure_time,
  arrival_time,
  aircraft,
  status,
  score
) as (
  values
    -- LAX-HNL direct options
    ('UA1170', 'United',   'LAX', 'HNL', '2026-07-15T08:15:00-07:00'::timestamptz, '2026-07-15T11:10:00-10:00'::timestamptz, 'Boeing 777-200',     'MVP test data — not live', 82),
    ('DL480',  'Delta',    'LAX', 'HNL', '2026-07-15T10:05:00-07:00'::timestamptz, '2026-07-15T13:05:00-10:00'::timestamptz, 'Airbus A330-300',    'MVP test data — not live', 76),
    ('HA9',    'Hawaiian', 'LAX', 'HNL', '2026-07-15T17:30:00-07:00'::timestamptz, '2026-07-15T20:25:00-10:00'::timestamptz, 'Airbus A330-200',    'MVP test data — not live', 88),

    -- SFO-HNL direct options
    ('UA1509', 'United',   'SFO', 'HNL', '2026-07-15T09:00:00-07:00'::timestamptz, '2026-07-15T11:35:00-10:00'::timestamptz, 'Boeing 777-300ER',   'MVP test data — not live', 84),
    ('AS877',  'Alaska',   'SFO', 'HNL', '2026-07-15T11:40:00-07:00'::timestamptz, '2026-07-15T14:15:00-10:00'::timestamptz, 'Boeing 737 MAX 9',   'MVP test data — not live', 79),
    ('HA11',   'Hawaiian', 'SFO', 'HNL', '2026-07-15T18:15:00-07:00'::timestamptz, '2026-07-15T20:50:00-10:00'::timestamptz, 'Airbus A330-200',    'MVP test data — not live', 86),

    -- SEA-HNL direct options
    ('AS811',  'Alaska',   'SEA', 'HNL', '2026-07-15T08:20:00-07:00'::timestamptz, '2026-07-15T11:45:00-10:00'::timestamptz, 'Boeing 737 MAX 9',   'MVP test data — not live', 81),
    ('DL419',  'Delta',    'SEA', 'HNL', '2026-07-15T12:35:00-07:00'::timestamptz, '2026-07-15T16:00:00-10:00'::timestamptz, 'Airbus A321neo',     'MVP test data — not live', 73),
    ('HA21',   'Hawaiian', 'SEA', 'HNL', '2026-07-15T18:05:00-07:00'::timestamptz, '2026-07-15T21:30:00-10:00'::timestamptz, 'Airbus A330-200',    'MVP test data — not live', 85),

    -- LAX-SEA-HNL connection candidates
    ('AS1293', 'Alaska',   'LAX', 'SEA', '2026-07-15T06:30:00-07:00'::timestamptz, '2026-07-15T09:20:00-07:00'::timestamptz, 'Boeing 737-900',     'MVP test data — not live', 77),
    ('DL1402', 'Delta',    'LAX', 'SEA', '2026-07-15T07:15:00-07:00'::timestamptz, '2026-07-15T10:05:00-07:00'::timestamptz, 'Airbus A220-300',    'MVP test data — not live', 72),
    ('AS825',  'Alaska',   'SEA', 'HNL', '2026-07-15T13:25:00-07:00'::timestamptz, '2026-07-15T16:50:00-10:00'::timestamptz, 'Boeing 737 MAX 9',   'MVP test data — not live', 80),

    -- LAX-SFO-HNL connection candidates
    ('UA565',  'United',   'LAX', 'SFO', '2026-07-15T07:00:00-07:00'::timestamptz, '2026-07-15T08:25:00-07:00'::timestamptz, 'Airbus A320',        'MVP test data — not live', 74),
    ('AS3305', 'Alaska',   'LAX', 'SFO', '2026-07-15T09:30:00-07:00'::timestamptz, '2026-07-15T10:55:00-07:00'::timestamptz, 'Embraer 175',       'MVP test data — not live', 69),
    ('UA2380', 'United',   'SFO', 'HNL', '2026-07-15T12:10:00-07:00'::timestamptz, '2026-07-15T14:45:00-10:00'::timestamptz, 'Boeing 777-200',     'MVP test data — not live', 83),

    -- LAX-OGG direct MVP test-data options
    ('UA1212', 'United',   'LAX', 'OGG', '2026-07-15T08:55:00-07:00'::timestamptz, '2026-07-15T11:45:00-10:00'::timestamptz, 'Boeing 757-300',     'MVP test data — not live', 78),
    ('DL464',  'Delta',    'LAX', 'OGG', '2026-07-15T11:25:00-07:00'::timestamptz, '2026-07-15T14:15:00-10:00'::timestamptz, 'Boeing 767-300',     'MVP test data — not live', 74),
    ('HA33',   'Hawaiian', 'LAX', 'OGG', '2026-07-15T17:05:00-07:00'::timestamptz, '2026-07-15T19:55:00-10:00'::timestamptz, 'Airbus A330-200',    'MVP test data — not live', 86),

    -- SFO-OGG direct MVP test-data options
    ('UA1749', 'United',   'SFO', 'OGG', '2026-07-15T09:35:00-07:00'::timestamptz, '2026-07-15T12:05:00-10:00'::timestamptz, 'Boeing 737 MAX 9',   'MVP test data — not live', 80),
    ('AS879',  'Alaska',   'SFO', 'OGG', '2026-07-15T12:45:00-07:00'::timestamptz, '2026-07-15T15:15:00-10:00'::timestamptz, 'Boeing 737 MAX 9',   'MVP test data — not live', 77),
    ('HA41',   'Hawaiian', 'SFO', 'OGG', '2026-07-15T18:40:00-07:00'::timestamptz, '2026-07-15T21:10:00-10:00'::timestamptz, 'Airbus A321neo',     'MVP test data — not live', 84),

    -- ATL-HNL direct option
    ('DL837',  'Delta',    'ATL', 'HNL', '2026-07-15T10:15:00-04:00'::timestamptz, '2026-07-15T14:15:00-10:00'::timestamptz, 'Airbus A330-300',    'MVP test data — not live', 71),

    -- SLC-HNL direct options
    ('DL397',  'Delta',    'SLC', 'HNL', '2026-07-15T11:20:00-06:00'::timestamptz, '2026-07-15T14:20:00-10:00'::timestamptz, 'Boeing 767-300',     'MVP test data — not live', 78),
    ('HA85',   'Hawaiian', 'SLC', 'HNL', '2026-07-15T16:10:00-06:00'::timestamptz, '2026-07-15T19:05:00-10:00'::timestamptz, 'Airbus A321neo',     'MVP test data — not live', 87)
)
insert into public.flights (
  flight_number,
  carrier,
  origin,
  destination,
  departure_time,
  arrival_time,
  aircraft,
  status,
  score
)
select
  seed.flight_number,
  seed.carrier,
  seed.origin,
  seed.destination,
  seed.departure_time,
  seed.arrival_time,
  seed.aircraft,
  seed.status,
  seed.score
from mvp_flights seed
where not exists (
  select 1
  from public.flights existing
  where existing.flight_number = seed.flight_number
    and existing.origin = seed.origin
    and existing.destination = seed.destination
    and existing.departure_time = seed.departure_time
);

commit;

# MVP flight seed data

`supabase/seed-mvp-flights.sql` provides realistic, static flight records for MVP testing of route search and itinerary planning.

## What it covers

Seed routes:

- LAX-HNL
- SFO-HNL
- SEA-HNL
- LAX-SEA-HNL
- LAX-SFO-HNL
- ATL-HNL
- SLC-HNL

Seed carriers:

- United
- Delta
- Alaska
- Hawaiian

Each row includes `flight_number`, `carrier`, `origin`, `destination`, `departure_time`, `arrival_time`, `aircraft`, `status`, and `score`.

## Not live data

This is MVP seed data only. It is realistic-looking test data, not live airline schedule, inventory, load, or operational data. Do not show it to users as current flight truth, and do not use it for travel decisions.

## Production safety

Do not run this against production unless you intentionally want these static MVP records there. The SQL inserts records only when an exact `flight_number` + `origin` + `destination` + `departure_time` match does not already exist, so it skips matching rows instead of updating or overwriting existing data.

Recommended use:

1. Apply to a local, preview, or staging Supabase project.
2. Confirm the `public.flights` table has the required MVP columns.
3. Run the SQL file from the Supabase SQL editor or CLI against that non-production database.
4. Search routes in the app, especially direct HNL routes and the LAX connections through SEA or SFO.

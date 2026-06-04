# MVP flight seed data

The app now has two safe MVP seed/demo paths for personal route-search testing:

1. `lib/mvpRouteSeedData.ts` — in-app static fallback rows used only after live Supabase and Aviationstack return no matching itinerary cards.
2. `supabase/seed-mvp-flights.sql` — optional idempotent SQL seed rows for a local, preview, or staging Supabase `public.flights` table.

Both paths use realistic-looking **test data only**. They are not live airline schedules, inventory, loads, or operational truth.

## Covered MVP routes

Direct route cards are seeded for:

- LAX-HNL
- SFO-HNL
- SEA-HNL
- LAX-OGG
- SFO-OGG

Carrier examples include:

- United
- Delta
- Alaska
- Hawaiian

The seed date is `2026-07-15`. If you search without a date, `/plan` can use the seed/demo rows as matched itinerary cards. If you search for another specific date, live provider matching still applies first and the static seed rows may be filtered out by date.

## Labels in the UI/API

Seeded/demo itinerary cards are explicitly marked as test data:

- API `sourceLabel`: `MVP route seed test data`
- API `dataMode`: `test-data`
- Provider badge: `MVP test data`
- Flight status: `MVP test data — not live`
- Planner data mode: `MVP test data — not live`

This keeps personal testing usable while avoiding the impression that static rows are live flight truth.

## Production safety

Do not run `supabase/seed-mvp-flights.sql` against production unless you intentionally want static MVP test rows in that database.

The SQL is non-destructive:

- It inserts only into `public.flights`.
- It does not update or delete any existing row.
- It skips an insert when the exact `flight_number` + `origin` + `destination` + `departure_time` already exists.
- It assumes these columns exist: `flight_number`, `carrier`, `origin`, `destination`, `departure_time`, `arrival_time`, `aircraft`, `status`, `score`.

Recommended use:

1. Apply the SQL only to local, preview, staging, or personal-test Supabase projects.
2. Confirm the target database and table before running it.
3. Search the covered routes in `/plan` with no specific date, or with `2026-07-15`.
4. Verify cards show the MVP/test-data labels before sharing screenshots or demos.

## Replacing seed data with live data

When live data is ready:

1. Stop running `supabase/seed-mvp-flights.sql` in refreshed environments.
2. Remove any static MVP rows from non-production databases when no longer needed, using a deliberate audited delete by the known test status/date/flight numbers.
3. Populate `public.flights` from the live ingestion job with provider-sourced `origin`, `destination`, `departure_time`, `arrival_time`, `carrier`, `flight_number`, `aircraft`, `status`, and scoring fields.
4. Keep the app-level seed fallback behind the current live-first order, or remove `lib/mvpRouteSeedData.ts` once Supabase/Aviationstack coverage is reliable for these routes.
5. Confirm `/api/itinerary/search` returns `dataMode: live` with `Live current API data` badges for current provider API results, or `dataMode: stored-supabase` with stored-data badges for persisted database rows, before considering the replacement complete.

The important handoff rule: live provider data should replace seed rows at the data-source layer; do not mutate seed rows into production-looking rows.

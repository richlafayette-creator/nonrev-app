# Route Matching Coverage Report

This report documents the route-matching diagnostics covered by `lib/itinerarySearch.routeMatching.test.ts` and the live Supabase behavior inspected while fixing route matching.

## Covered route checks

| Route | Coverage | Expected fixture result |
| --- | --- | --- |
| LAX-HNL | Exact direct match, rejected candidate reasons, origin/destination counters | 1 exact route row / 1 final match |
| LAX-OGG | No exact direct route, closest-route recommendation | 0 exact route rows / closest `LAX → HNL` |
| SEA-HNL | Airport-code field normalization via `origin_airport_code` / `destination_airport_code` | 1 exact route row / 1 final match |
| SFO-HNL | Alternate provider field normalization via `departure_iata` / `arrival_iata` | 1 exact route row / 1 final match |

## Normalization checks

- Airport normalization accepts canonical route fields plus provider-specific aliases: `dep_iata`, `arr_iata`, `departure_iata`, `arrival_iata`, `origin_airport_code`, and `destination_airport_code`.
- Carrier normalization verifies United and Alaska Group aliases; Alaska Group includes Alaska and Hawaiian identifiers.
- Date filtering verifies matching and non-matching normalized departure dates.
- No-exact-route coverage verifies diagnostics explain when fetched rows do not contain an exact normalized route and recommend closest routes from the fetched dataset.

## Stored Supabase diagnostic finding

The inspected 300-row recent safety query normalized successfully, but produced 0 matches for LAX-HNL, SEA-HNL, and SFO-HNL because those exact routes existed outside the latest 300 rows and/or outside the requested date window. LAX-OGG had no exact route row in the inspected dataset; closest useful fetched routes included LAX-HNL and HNL-OGG depending on query coverage.

Fix: when targeted route/date rows do not produce a final match, the API now runs a route-coverage query without the date filter before the recent-row safety query. That lets diagnostics distinguish:

1. exact route exists, but date/carrier rejected it; from
2. no exact route exists in the fetched dataset, so closest routes should be recommended.

## Diagnostic output contract

The itinerary API debug payload includes:

- Origin match count
- Destination match count
- Exact route row count
- Date match count
- Carrier match count
- Final exact matched rows
- Route normalization summary
- Supabase query-path counts, including route coverage rows
- Closest matching routes when no exact route exists
- First five rejected candidate flights with rejection reasons

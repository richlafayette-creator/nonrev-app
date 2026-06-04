# Route Matching Coverage Report

This report documents the route-matching diagnostics covered by `lib/itinerarySearch.routeMatching.test.ts`.

## Covered route checks

| Route | Coverage |
| --- | --- |
| LAX-HNL | Exact direct match, rejected candidate reasons, origin/destination counters |
| LAX-OGG | Alternate provider field normalization via `dep_iata` / `arr_iata` |
| SEA-HNL | Airport-code field normalization via `origin_airport_code` / `destination_airport_code` |
| SFO-HNL | Alternate provider field normalization via `departure_iata` / `arrival_iata` |

## Normalization checks

- Airport normalization accepts canonical route fields and provider-specific aliases.
- Carrier normalization verifies United and Alaska Group aliases.
- Date filtering verifies matching and non-matching normalized departure dates.
- No-exact-route coverage verifies diagnostics explain that fetched rows did not produce a single exact match and recommend closest routes from the fetched dataset.

## Diagnostic output contract

The itinerary API debug payload now includes:

- Origin match count
- Destination match count
- Date match count
- Carrier match count
- Final exact matched rows
- Route normalization summary
- Closest matching routes when no exact route exists
- First five rejected candidate flights with rejection reasons

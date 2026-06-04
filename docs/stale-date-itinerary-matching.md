# Stale-date itinerary matching for personal testing

## Supabase flight date audit

Stored Supabase `public.flights` currently contains stale sample data relative to the current personal-testing search date.

Audited on 2026-06-04 UTC:

| Metric | Date |
| --- | --- |
| Oldest flight date | 2026-05-24 |
| Newest flight date | 2026-05-24 |
| Requested search date used for verification | 2026-06-04 |

Route-specific audit highlights:

| Route | Exact rows | Available exact dates |
| --- | ---: | --- |
| LAX-HNL | 21 | 2026-05-24 |
| SFO-HNL | 9 | 2026-05-24 |
| SEA-HNL | 13 | 2026-05-24 |
| LAX-OGG | 0 exact direct Supabase rows | none; connecting candidates available through HNL |
| SFO-OGG | 1 | 2026-05-24 |

Because 2026-06-04 is newer than the newest Supabase flight date, strict date matching correctly returns no same-date live rows for that request.

## Production strict mode

Strict matching remains the default API behavior. If `personalTestingMode` is omitted or false, the itinerary API keeps using the requested date exactly.

Use strict mode for production and for any workflow where same-date accuracy matters.

## Personal Testing Mode

For personal testing only, `/api/itinerary/search` accepts:

- `personalTestingMode=true`
- `nearestDateToleranceDays=45` or another bounded integer tolerance

When enabled, the API:

1. Fetches Supabase route/date candidates as usual.
2. Audits normalized available flight dates.
3. If the requested date is newer than available data, returns a clear warning.
4. Chooses the nearest available date within tolerance for matching.
5. Labels results as nearest-date testing data, not production strict-date results.

The `/plan` UI exposes this as **Personal Testing Mode** and shows:

- Oldest flight date
- Newest flight date
- Requested search date
- Effective match date
- Closest available dates
- Whether nearest-date matching was applied

## Verification

With `personalTestingMode=true&nearestDateToleranceDays=45` and requested date `2026-06-04`, the following routes returned usable itinerary cards:

| Route | Effective match date | Result mode |
| --- | --- | --- |
| LAX-HNL | 2026-05-24 | nearest-date-testing |
| SFO-HNL | 2026-05-24 | nearest-date-testing |
| SEA-HNL | 2026-05-24 | nearest-date-testing |
| LAX-OGG | 2026-05-24 | nearest-date-testing, connecting via HNL |
| SFO-OGG | 2026-05-24 | nearest-date-testing, connecting via HNL |

Nearest-date results are for UI and itinerary-flow testing only. They must not be treated as live flight availability.

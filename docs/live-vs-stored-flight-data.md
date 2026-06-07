# Live vs stored flight data labels

The itinerary pipeline separates four data freshness classes:

| Class | Meaning | UI/API label |
| --- | --- | --- |
| Live provider API data | A provider API response returned during the itinerary request, currently FlightAware first or Aviationstack fallback, matching the requested route/date filters. | `Live provider API data` |
| Stored Supabase flight data | Rows already persisted in `public.flights`. These may match the requested date, but they are not a current provider API response. | `Stored Supabase flight data` |
| Nearest-date testing data | Personal Testing Mode matched stored or static rows from the nearest available date within tolerance instead of the requested date. | `Nearest-date testing data` |
| Demo fallback data | Static/scaffold fallback cards used only when provider data cannot produce itinerary cards. | `Demo fallback data` |

## True live rule

Only provider API results returned during the itinerary request should be called live. Supabase rows are stored data even when their date exactly matches the requested search date. FlightAware enrichment can add current operational context, but it does not change the base Supabase row into true live schedule data.

## Diagnostics

The itinerary debug payload includes:

- `trueLiveDataAvailable`
- `trueLiveDataUnavailableReason`
- `dataFreshnessMode`
- route date coverage: oldest, newest, requested date, effective match date, closest available dates

When Personal Testing Mode applies nearest-date matching, `/plan` shows a warning banner and itinerary cards carry a nearest-date freshness badge.

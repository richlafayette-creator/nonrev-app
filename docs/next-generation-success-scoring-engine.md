# Next Generation Nonrev Success Scoring Engine

Goal: rank itineraries by probability of successfully reaching the destination as a nonrev traveler, not by schedule convenience alone.

This is scoring architecture only. It does not call external APIs. Inputs that will eventually come from live providers use conservative neutral defaults until those integrations exist.

## Output labels

| Score | Label |
| --- | --- |
| 85–99 | Best Choice |
| 72–84 | Strong Option |
| 58–71 | Backup Option |
| 1–57 | Last Chance |

## Formula

```text
overallScore = Σ(normalizedFactorScore × factorWeight) / Σ(factorWeight)
finalScore = clamp(round(overallScore), 1, 99)
```

Each factor is normalized to 0–100 before weighting. The score is intentionally capped at 99 because nonrev travel is never guaranteed.

## Weights

| Input | Weight | Notes |
| --- | ---: | --- |
| Historical community load success rate on specific flight number | 14 | Highest weight because exact-flight boarding history is the strongest success proxy. |
| Historical route success rate | 10 | Route-level pattern when exact-flight data is sparse. |
| Airline recovery network strength | 9 | Measures carrier/network ability to recover after a miss or misconnect. |
| Number of remaining departures that day | 8 | More same-day attempts reduce trip-failure risk. |
| Hub strength | 7 | Strong hubs improve reaccommodation and alternate routing. |
| Public seat inventory when available | 10 | Visible open-seat margin versus standby count. Neutral when unavailable. |
| Time until departure | 7 | Enough lead time allows monitoring, pivoting, and earlier recovery decisions. |
| Historical cancellation rate | 7 | Reliability penalty; lower cancellation risk scores higher. |
| Historical delay rate | 7 | Delay risk matters most for connections and recovery windows. |
| Aircraft seat count | 5 | Larger aircraft usually create better nonrev odds. |
| Number of alternate routing options if misconnect occurs | 6 | Backup routes protect destination success. |
| User-provided load reports | 5 | Trust/recency/seat-margin weighted local intelligence. |
| Freshness of load reports | 3 | Fresh loads matter more than stale reports. |
| Multiple independent load confirmations | 2 | Corroboration helps, but does not outweigh exact load quality. |

Total weight: 100.

## Current implementation

- Core scoring lives in `lib/intelligence.ts` as `scoreNonrevItinerary`.
- Planner comparison cards store the result as `nextGenSuccess`.
- Sorting uses `nextGenSuccess.score` first; schedule timing is now a tie-breaker.
- Each itinerary exposes:
  - overall score
  - label: Best Choice, Strong Option, Backup Option, or Last Chance
  - top 3 positive factors
  - single top risk factor

## Missing-data policy

Do not fabricate live data. If a signal is not available yet:

- exact flight/route history falls back to existing prediction scaffolds
- public inventory defaults neutral unless user/community loads provide seats and standby counts
- delay/cancellation are estimated from existing disruption/weather/airport-risk scaffolds
- aircraft capacity is inferred from aircraft text when possible, otherwise neutral
- same-day departures and alternate routes are estimated from existing airport backup availability until schedule APIs are connected

## Future API plug-in points

The architecture can accept external feeds later without changing the UI contract:

- exact flight historical nonrev outcomes
- route-level historical outcomes
- public seat/inventory availability
- cancellation and delay rates
- aircraft configuration seat counts
- same-day remaining departure count
- alternate routing graph
- independent community load confirmations

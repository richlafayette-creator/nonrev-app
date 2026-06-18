# Private beta smoke-test matrix

Last updated: 2026-06-18 UTC

Run these smoke tests before each private beta build handoff. The goal is not to prove seat availability; it is to verify route search behavior, provider/fallback labeling, confidence wording, and tester-safe failure states.

## Test protocol

For each route:

1. Open `/plan`.
2. Use the listed search query or equivalent structured itinerary fields.
3. Keep Personal Testing Mode off for the first pass.
4. Record live/stored/nearest-date/demo labels, confidence wording, provider badges, and any warnings.
5. If no usable result appears, optionally repeat with Personal Testing Mode on and record that the result is testing-only.
6. Confirm no raw provider JSON, secrets, stack traces, or confusing quota errors appear to the tester.

## Route matrix

| # | Coverage | Search query | Expected behavior | What to verify | Common failure signs |
| ---: | --- | --- | --- | --- | --- |
| 1 | United / Hawaii | `United SFO to HNL tomorrow` | Returns United or Star/available route options when provider data is available; otherwise safe stored/fallback messaging. | Carrier filter is respected where possible; date warning is clear; route confidence appears; live vs stored label is visible. | Shows stale stored data as live; ignores United intent; no Hawaii route warning; stuck spinner. |
| 2 | United / Domestic hub | `United DEN to ORD tomorrow morning` | Produces a domestic trunk-route result or a clear provider/fallback message. | Times are readable; nonstop or connection logic is plausible; confidence explanation mentions available signals. | Impossible connection order; missing carrier/timing; raw provider/quota error. |
| 3 | United / Domestic commuter | `United Express SFO to SBA tomorrow` | Handles commuter/regional route gracefully, including no-result fallback if provider lacks data. | Regional/commuter wording does not overpromise; fallback says no usable live result if applicable. | Demo card looks like real availability; airport code parsing fails; no clear no-results state. |
| 4 | Delta / Europe | `Delta JFK to AMS next Friday` | Returns Delta/SkyTeam transatlantic options or safe limited-provider messaging. | International date handling; carrier intent; confidence is cautious if data is limited. | Wrong continent/airport; high confidence on fallback data; no provider badge. |
| 5 | Delta / Domestic | `Delta ATL to LAX tomorrow` | Returns a high-volume domestic route or explicit fallback. | Origin/destination parsing; route card timing; confidence/probability language. | ATL/LAX swapped; empty page; conflicting live/stored badges. |
| 6 | Delta / Domestic commuter | `Delta Connection MSP to FAR tomorrow` | Handles regional Delta Connection style search without breaking. | Smaller airport parsing; no-result message if provider lacks schedules; warnings are tester-friendly. | Airport not recognized; route card omits source/date; raw API error. |
| 7 | Alaska / West Coast | `Alaska SEA to SFO tomorrow` | Returns Alaska or appropriate west-coast route options when available. | Alaska carrier intent; route freshness badge; confidence score stays within 0-100. | Carrier filter ignored without explanation; Mapbox failure blocks result; impossible times. |
| 8 | Alaska / Hawaii | `Alaska SEA to OGG next Saturday` | Produces Hawaii search behavior with direct/connection options or clear provider limitation. | Hawaii airport parsing; date/freshness warning; backup route reasoning. | OGG confused with HNL; nearest-date data shown without warning; no backup context. |
| 9 | Alaska / Domestic commuter | `Alaska PDX to RDM tomorrow` | Handles short regional route gracefully, including no-result fallback. | Commuter route does not crash; status text explains limited data; no overconfident score. | Dead Generate/Search button; blank itinerary area; demo data presented as live. |
| 10 | American / Hawaii | `American DFW to HNL tomorrow` | Returns American/oneworld route candidates or safe fallback. | Long-haul route parsing; connection alternatives; source label and confidence explanation. | DFW/HNL parsed incorrectly; high confidence with no live data; no stale-data warning. |
| 11 | American / Europe | `American PHL to LHR next Friday` | Handles transatlantic American route search with route/fallback clarity. | International airport codes; carrier filter; provider availability text. | Shows domestic-only alternatives; missing date; raw entitlement/quota message. |
| 12 | American / Domestic commuter | `American Eagle CLT to AVL tomorrow` | Handles short regional search with clear no-result or regional result. | Small airport recognition; fallback copy; route confidence is cautious. | AVL not parsed; impossible layover; no result and no explanation. |
| 13 | Hawaiian / Interisland | `Hawaiian HNL to OGG tomorrow morning` | Handles interisland route and Hawaiian carrier intent. | Short-haul timing; airport code labels; live/stored/test badge is obvious. | Treats as mainland route; missing Hawaiian intent; confidence too high on fallback. |
| 14 | Hawaiian / Mainland | `Hawaiian HNL to LAX next Friday` | Produces Hawaii-mainland route behavior or safe provider limitation. | Directionality; date handling across time zones; source/freshness labels. | HNL/LAX swapped; stale stored data without warning; no provider fallback text. |
| 15 | Hawaii / Interisland backup | `best backup from KOA to HNL tomorrow` | Shows backup-oriented route reasoning or no-result guidance. | Backup explanation; connection/direct handling; confidence wording is planning-safe. | Claims boarding certainty; no explanation for low/no confidence; airport parse failure. |
| 16 | Japan / United | `United SFO to NRT next week` | Handles Japan route search with international code parsing and provider/fallback clarity. | NRT recognized; international route not forced into domestic assumptions; source label visible. | NRT rejected; wrong airport/country; no warning when only fallback data appears. |
| 17 | Japan / Delta or partner intent | `Delta SEA to HND next Friday` | Handles Japan route even if carrier/provider cannot return direct data; degrades safely. | HND recognized; carrier intent captured; no overpromising if provider lacks schedule. | High confidence with no supporting data; HND/NRT confusion without explanation; raw error. |
| 18 | Europe / United | `United EWR to FRA next Friday` | Handles Europe route search and long-haul provider/fallback states. | EWR/FRA parsing; date and source badges; route confidence explanation. | Europe route omitted; fallback card lacks label; stuck provider search. |
| 19 | Europe / Delta | `Delta ATL to CDG next Friday` | Handles Europe route search with Delta intent or safe limited result. | CDG recognized; international timing shown clearly; confidence remains bounded. | CDG parse failure; incorrect domestic alternative; no stale-data marker. |
| 20 | Domestic commuter / American or regional | `American Eagle DCA to CHO tomorrow` | Handles small commuter route without crashing, even if no provider result exists. | Regional route no-result state; useful fallback guidance; no raw provider text. | Blank result pane; impossible alternate airport route; demo fallback appears live. |

## Pass/fail criteria

A route smoke test passes when:

- Search completes without a crash or stuck loading state.
- The app clearly labels live, stored, nearest-date, or demo/fallback data.
- Confidence/probability text is present when an itinerary card appears.
- Provider limitations are shown as tester-safe warnings, not raw errors.
- Wrong/no data produces a useful next step instead of silence.

A route smoke test fails when:

- The page crashes, hangs, or leaves the tester without feedback.
- The route/date/carrier intent is clearly parsed incorrectly.
- Stored, nearest-date, or demo data is presented as live availability.
- Confidence is missing, impossible, or dangerously overconfident for fallback data.
- A provider error exposes raw implementation details, secrets, stack traces, or confusing JSON.

## Recording template

```text
Route #:
Tester:
Device/browser:
Signed in? yes/no:
Personal Testing Mode? yes/no:
Result label: live / stored / nearest-date / demo / no result
Expected behavior met? yes/no:
What failed or felt risky:
Screenshot/video attached? yes/no:
Follow-up owner:
```

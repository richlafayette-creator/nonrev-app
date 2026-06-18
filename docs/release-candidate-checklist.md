# Release candidate checklist

Purpose: final operator checklist for shipping a 20-user airline employee private beta. This is not a feature spec. Do not add UI, redesign, dependencies, or new product scope from this document.

## INFRASTRUCTURE

### Supabase env vars

- [ ] `NEXT_PUBLIC_SUPABASE_URL` is set.
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set.
- [ ] `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` is available server-side.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set server-side only.
- [ ] No service-role value appears in browser code, logs, docs, screenshots, or tester messages.
- [ ] `/api/data-health` reports public Supabase client readiness and service-role readiness separately.

### SQL migrations

Verify these are applied before calling the build release-candidate ready:

- [ ] `docs/account-beta-persistence.sql` for saved searches, beta feedback, and trip outcomes.
- [ ] `docs/persistent-watchlists-alerts.sql` for watchlists, alert history, and alert snapshots.
- [ ] `docs/flight-data-expansion.sql` for `public.flights.flight_date` and `public.flights.source_checked_at`.
- [ ] `docs/community-loads-mvp.sql` if load reports must persist beyond local/in-memory behavior.
- [ ] `docs/provider-results-table.sql` if `NONREVY_STORE_PROVIDER_RESULTS=true`.

Release-candidate gate: `/api/data-health` reports required tables/columns as present, account persistence as Supabase-backed, and flight freshness as ready.

### PM2 checks

Run on the host before inviting testers:

```bash
pm2 status
pm2 describe nonrev-app
pm2 logs nonrev-app --lines 100
```

Pass criteria:

- [ ] `nonrev-app` is `online`.
- [ ] Restart count is stable and understood.
- [ ] Memory remains stable after route smoke tests.
- [ ] Logs do not show repeated provider, Supabase, or Next.js runtime exceptions.
- [ ] Restart/redeploy has been tested after validation.

### Health endpoints

- [ ] `/api/data-health` returns HTTP 200.
- [ ] `checkedAt` is current.
- [ ] `/data-health` renders a readable operator status page.
- [ ] `/operator` renders provider health, beta counts, data freshness, build version, and commit hash.
- [ ] `/api/beta-feedback`, `/api/community-loads`, `/api/outcomes`, `/api/watchlist`, and `/api/alerts` respond without server errors.

### Provider readiness

- [ ] FlightAware AeroAPI key, entitlement, billing, and quota are ready for 20 testers.
- [ ] AviationStack status is known; quota issues are acceptable only as a documented fallback limitation.
- [ ] Mapbox token scope, URL restrictions, and quota are known; map failures degrade safely.
- [ ] Supabase project limits are sufficient for beta write/read volume.
- [ ] Provider failures show tester-safe warnings, not raw JSON, secrets, or stack traces.

## ROUTE VALIDATION

Protocol for every route:

1. Open `/plan`.
2. Keep Personal Testing Mode off for the first pass.
3. Search the listed carrier/route for tomorrow or the next practical future date.
4. Record live/stored/fallback label, provider badge, warnings, confidence wording, and whether the result is safe for testers.
5. If no result appears, verify the no-result/fallback message is clear and not overconfident.

### United

| Category | Routes |
| --- | --- |
| Domestic | SFO-DEN, DEN-ORD, EWR-ORD, IAH-LAX |
| Hawaii | SFO-HNL, DEN-OGG |
| Europe | EWR-FRA, ORD-LHR |
| Japan | SFO-HND, LAX-NRT |

### Delta

| Category | Routes |
| --- | --- |
| Domestic | ATL-LAX, MSP-SEA, DTW-LGA, SLC-JFK |
| Hawaii | SEA-HNL, LAX-OGG |
| Europe | JFK-AMS, ATL-CDG |
| Japan | SEA-HND, LAX-HND |

### Alaska

| Category | Routes |
| --- | --- |
| Domestic | SEA-SFO, PDX-LAX, SEA-ANC, SAN-SEA |
| Hawaii | SEA-OGG, PDX-HNL |
| Europe | SEA-LHR, PDX-AMS |
| Japan | SEA-NRT, SFO-HND |

### American

| Category | Routes |
| --- | --- |
| Domestic | DFW-LAX, CLT-JFK, ORD-MIA, PHX-DFW |
| Hawaii | DFW-HNL, LAX-HNL |
| Europe | PHL-LHR, DFW-MAD |
| Japan | DFW-HND, LAX-HND |

### Hawaiian

| Category | Routes |
| --- | --- |
| Domestic | HNL-LAX, HNL-SFO, HNL-LAS, OGG-LAX |
| Hawaii | HNL-OGG, KOA-HNL |
| Europe | HNL-LHR, HNL-CDG |
| Japan | HNL-HND, HNL-NRT |

Route validation passes when searches complete or fail safely, carrier/date/airport intent is respected where possible, fallback labels are clear, and confidence language does not imply guaranteed boarding.

## BETA INVITATION

### 20 testers

- [ ] Invite exactly 20 airline employee testers.
- [ ] Include only testers who understand non-rev travel risk and can give route-quality feedback.
- [ ] Track tester name, airline context, device/browser, home airport, and invited date privately.
- [ ] Tell testers this is a private beta and not public launch material.

### Onboarding instructions

Send testers this concise flow:

```text
1. Create or sign into your NONREVY beta account if requested.
2. Complete onboarding/profile with home airport and travel context.
3. Search 3-5 routes you know well.
4. Save at least one route to your watchlist.
5. Submit load information only when safe and allowed.
6. Report any wrong, stale, confusing, or overconfident itinerary.
7. Verify every travel decision with official airline tools.
```

### How to submit loads

- Open `/load-reports`.
- Enter carrier, route, flight/date if known, load condition, confidence, and safe seat/standby context.
- Add short factual notes without private passenger, employee, or restricted operational details.
- Submit and confirm the success message or recent report state updates.

### How to report incorrect itineraries

Use `/beta-feedback`. Include:

- Search query, route, and date.
- Date/time tested.
- Device/browser and signed-in state.
- Whether Personal Testing Mode was enabled.
- What NONREVY showed.
- What official airline tools or tester knowledge showed instead.
- Screenshot only if it contains no private or restricted information.

Escalate immediately when an itinerary is high-confidence but wrong, stale, fallback-derived, wrong-date, or likely to cause a bad travel decision.

## SUCCESS METRICS

Review daily during week 1:

| Metric | Release-candidate target |
| --- | --- |
| Searches/day | 40+ total searches/day after all testers are invited. |
| Repeat usage | 50%+ of testers return for a second day in week 1. |
| Watchlists created | 12+ testers create at least one watchlist item. |
| Load reports submitted | 20+ total reports across 8+ unique routes. |
| Outcome reports submitted | 8+ trip or test outcomes by end of week 1. |

Week-1 review question: are testers repeatedly using the planner, adding community/load signal, and reporting outcomes without operator hand-holding?

## KNOWN ACCEPTABLE DEFECTS

These defects are acceptable for the 20-user private beta only if clearly disclosed to operators/testers and not misrepresented as live certainty.

### AviationStack quota issues

- Acceptable: AviationStack fallback is quota-limited while FlightAware remains the primary ready live provider.
- Not acceptable: raw quota errors shown to testers or fallback limitation hidden from operators.

### Mapbox limitations

- Acceptable: Map cards/context degrade to placeholders or limited map behavior.
- Not acceptable: Mapbox failure blocks itinerary search, load submission, feedback, watchlists, or outcomes.

### Graceful fallback behavior

- Acceptable: stored, local, demo, or nearest-date fallback keeps flows testable with clear labels.
- Not acceptable: fallback data is presented as live availability or confidence language implies boarding certainty.
- Acceptable: local fallback persistence for narrow testing when operators know cross-device sync may not work.
- Not acceptable: promising reliable account persistence while service-role or SQL migrations are missing.

## RELEASE-CANDIDATE STOP CONDITIONS

Pause launch if any of these occur:

- FlightAware is unavailable and no safe route-search fallback is understandable.
- Supabase persistence is required for the cohort but service-role or migrations are missing.
- Route cards show stale/fallback/demo data as live.
- High-confidence results are repeatedly wrong for known routes.
- Feedback, load, watchlist, or outcome submissions silently fail.
- PM2 restarts repeatedly or logs show repeated runtime exceptions.
- Secrets, raw provider responses, stack traces, or restricted data appear to testers.

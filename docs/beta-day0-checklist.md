# Beta Day 0 checklist

Purpose: operator-focused launch checklist for a 20-user airline employee private beta. Keep this tight: verify runtime readiness, invite testers, monitor safety signals, and pause quickly if trust drops.

## PRE-LAUNCH

### Required environment variables

- [ ] `FLIGHTAWARE_API_KEY` is set server-side and `/api/data-health` reports FlightAware as ready.
- [ ] `AVIATIONSTACK_API_KEY` is set if AviationStack fallback is expected; quota warnings are understood.
- [ ] `NEXT_PUBLIC_MAPBOX_TOKEN` is set and scoped correctly; map failures degrade safely.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for the public Supabase client.
- [ ] `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` is available server-side for persistence checks.
- [ ] `NONREVY_TEST_DATA_MODE` is unset or `false` for production-safe beta behavior.
- [ ] Optional: `NONREVY_STORE_PROVIDER_RESULTS=true` only if provider-result persistence has been migrated and verified.

### Supabase service-role requirements

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set only in the server/runtime environment.
- [ ] The service-role key is never exposed to browser code, public docs, screenshots, logs, or tester messages.
- [ ] `/api/data-health` reports `supabaseEnvironment.serviceRoleConfigured: true`.
- [ ] Account-backed beta persistence reports Supabase mode, not local fallback, before relying on cross-device persistence.

### SQL migrations required

Apply and verify:

- [ ] `docs/account-beta-persistence.sql` for saved searches, beta feedback, and trip outcomes.
- [ ] `docs/persistent-watchlists-alerts.sql` for watchlists, alert history, and alert snapshots.
- [ ] `docs/flight-data-expansion.sql` for `public.flights.flight_date` and `public.flights.source_checked_at`.
- [ ] `docs/provider-results-table.sql` if provider-result persistence is enabled.
- [ ] `docs/community-loads-mvp.sql` if community load reports should persist beyond local/in-memory beta behavior.

Launch gate: `/api/data-health` should show required tables/columns as present and freshness status as ready.

### PM2 checks

Run on the launch host:

```bash
pm2 status
pm2 describe nonrev-app
pm2 logs nonrev-app --lines 100
```

Confirm:

- [ ] `nonrev-app` is `online`.
- [ ] Restart count is stable and understood.
- [ ] Memory usage is stable after smoke searches.
- [ ] Logs do not show repeated provider, Supabase, or Next.js runtime errors.
- [ ] Restart works cleanly after deploy or validation.

### Health endpoint checks

- [ ] `/api/data-health` returns HTTP 200.
- [ ] `checkedAt` is current.
- [ ] Supabase public client readiness is true.
- [ ] Supabase service-role readiness is true or explicitly accepted as a launch blocker/degraded mode.
- [ ] Account persistence, provider persistence, and flight freshness diagnostics are understandable.
- [ ] `/operator` loads and shows provider health, beta counts, freshness, build version, and commit hash.

### Provider readiness checks

- [ ] FlightAware is ready and has quota/entitlement headroom for 20 testers.
- [ ] AviationStack fallback status is known; quota-limited fallback is documented for operators.
- [ ] Mapbox token and quota are known; map failure does not block route planning.
- [ ] Supabase project API/database limits are sufficient for the cohort.
- [ ] Run one smoke route for United, Delta, Alaska, American, and Hawaiian from `docs/smoke-test-matrix.md`.

## LAUNCH DAY

### Tester onboarding steps

1. Invite exactly 20 airline employee testers.
2. Tell testers NONREVY is a planning assistant, not airline operational truth.
3. Ask testers to create/sign into an account if account persistence is in scope.
4. Have testers complete `/onboarding` or `/profile`.
5. Ask each tester to run 3-5 familiar route searches.
6. Ask each tester to save at least one useful route to `/watchlist`.
7. Ask each tester to submit at least one feedback item during the first session.
8. Remind every tester to verify all travel decisions in official airline tools.

### How users submit loads

1. Open `/load-reports`.
2. Enter carrier, route, flight/date if known, load condition, confidence, and safe seat/standby context.
3. Add short factual notes without private passenger, employee, or restricted operational information.
4. Submit and confirm the success message/recent report state updates.

### How users report incorrect itineraries

Use `/beta-feedback` for wrong or misleading itineraries. Ask users to include:

- Route/search query.
- Date and time tested.
- Device/browser.
- Signed-in state.
- Whether Personal Testing Mode was enabled.
- What the app showed.
- What official airline tools or tester knowledge showed instead.
- Screenshot only if it contains no private or restricted information.

Escalate immediately if a result is high-confidence but stale, fallback-derived, wrong-date, or likely to cause a bad travel decision.

### Known limitations

- Confidence scores are planning aids, not boarding guarantees.
- Stored Supabase rows are not live seat availability.
- Demo, fallback, or nearest-date data must not be treated as production truth.
- FlightAware is the main live schedule provider; provider quota or entitlement failures can degrade search quality.
- AviationStack may be fallback-limited or quota-limited.
- Mapbox failures should degrade safely and should not block planning.
- Missing Supabase service-role or SQL migrations means cross-device/account persistence may fall back locally.
- Freshness columns are required before stored data can be trusted at launch quality.

### Support workflow

- Triage incoming feedback daily into: blocker, launch-risk, confusing-but-safe, later enhancement.
- For blockers, pause affected tester instructions until fixed or clearly documented.
- Reproduce each wrong-itinerary report with the exact route/date/device context.
- Check `/api/data-health`, `/operator`, PM2 logs, and provider dashboards before changing code.
- Reply to testers with status: received, reproduced/not reproduced, workaround, fixed, or deferred.

## SUCCESS METRICS

Track these in week 1:

| Metric | Week-1 target for 20 users | Review question |
| --- | --- | --- |
| Searches per user | Median 5+ searches per tester | Can testers reach and reuse the core planning loop? |
| Watchlists created | 12+ testers create at least one watchlist item | Is route tracking understandable enough to use? |
| Load reports submitted | 20+ total reports across 8+ unique routes | Are testers willing and able to add community signal? |
| Outcome reports submitted | 8+ trip/test outcomes | Can the app collect the learning loop after travel? |
| Weekly return usage | 50%+ testers return on a second day | Does the beta have repeat value? |

## FAILURE MODES

### Provider outages

- FlightAware outage/quota/entitlement failure: mark live schedule quality degraded, verify fallback labels, and pause any tester claims about live coverage.
- AviationStack outage/quota failure: continue only if FlightAware is healthy; document fallback limitation.
- Mapbox outage/token failure: continue if planning flows work and map placeholders are safe.
- Provider schema change: capture logs, isolate affected path, and retest smoke routes before resuming confidence claims.

### Supabase outages

- Public client outage: account/profile/data flows may fail; pause account-backed testing.
- Service-role outage or missing key: account persistence may fall back locally; do not promise cross-device persistence.
- Missing tables/columns: apply migrations or keep beta in degraded/local mode with operator awareness.
- Supabase API/rate limits: reduce tester volume or pause writes until stable.

### Local fallback behavior

- Local fallback is acceptable only for narrow beta testing when operators know data may not sync across devices.
- Local fallback should preserve the user flow but not be described as reliable account persistence.
- If local fallback is active, tell testers to keep screenshots/notes for critical feedback and outcomes.
- Never hide fallback mode from operators reviewing launch readiness.

### Rollback procedure

1. Stop inviting new testers.
2. Notify current testers that route quality or persistence is degraded.
3. Inspect `/api/data-health`, `/operator`, PM2 logs, provider dashboards, and recent feedback.
4. If a deploy caused the issue, redeploy or reset to the last known good commit.
5. If a provider caused the issue, keep the app in clearly labeled degraded mode or pause affected testing.
6. If Supabase caused the issue, revert risky config changes and keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
7. Re-run the smoke matrix carrier sample before resuming invites.
8. Document impact, cause, action taken, and retest result.

## POST-LAUNCH

### Top issues to monitor

- Wrong date, carrier, route, or airport results.
- Missing stale/stored/fallback warnings.
- Overconfident scores on weak data.
- Search hangs, silent failures, or confusing empty states.
- Feedback, load, outcome, watchlist, or alert records not persisting.
- Raw provider/Supabase errors visible to testers.
- Mobile form submission blockers.
- PM2 restarts, memory growth, or repeated runtime exceptions.

### Top metrics to review after week 1

- Median and distribution of searches per tester.
- Number of testers who created watchlists.
- Number and quality of load reports submitted.
- Number and quality of outcome reports submitted.
- Weekly return usage and second-session behavior.
- Count of blocker and launch-risk feedback items.
- Count of wrong-itinerary reports by provider/source mode.
- Provider readiness incidents and duration.
- Supabase persistence incidents and local fallback usage.

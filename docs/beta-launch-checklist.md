# Beta launch checklist

Last updated: 2026-06-18 UTC

Scope: launch preparation for the first 20-user private beta. This is an operator checklist only. It does not add product features, change UI, or replace `/api/data-health` as the runtime source of truth.

## PRE-LAUNCH

### Required environment variables

Confirm these are set in the production/private-beta runtime before inviting testers.

| Area | Required variables | Launch check |
| --- | --- | --- |
| FlightAware live schedules | `FLIGHTAWARE_API_KEY` | `/api/data-health` reports FlightAware AeroAPI as `Ready`. |
| AviationStack fallback | `AVIATIONSTACK_API_KEY` | `/api/data-health` reports fallback status; quota warnings are acceptable only if FlightAware remains ready. |
| Mapbox maps/context | `NEXT_PUBLIC_MAPBOX_TOKEN` | `/api/data-health` reports Mapbox status; map failures must degrade safely. |
| Supabase public client | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `supabaseEnvironment.clientConfigured: true`. |
| Supabase server persistence | `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, plus `SUPABASE_SERVICE_ROLE_KEY` | `supabaseEnvironment.serviceRoleConfigured: true`; keep `SUPABASE_SERVICE_ROLE_KEY` server-only. |
| Provider-result persistence | `NONREVY_STORE_PROVIDER_RESULTS=true`, `SUPABASE_SERVICE_ROLE_KEY` | Optional for beta, but required if provider result storage is being tested. |
| Production-safe fallback mode | `NONREVY_TEST_DATA_MODE` unset or `false` | Nearest-date/demo testing behavior remains disabled for normal beta use. |

Pre-launch gate:

- [ ] No required secret values are exposed in client code, screenshots, docs, or tester instructions.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is present only in server/runtime environment configuration.
- [ ] Personal Testing Mode/test-data behavior is not treated as production accuracy proof.

### SQL migrations required

Apply and verify these migrations before launch if persistence and freshness should be cross-device/account-backed.

| Migration doc | Required objects/checks |
| --- | --- |
| `docs/account-beta-persistence.sql` | `nonrevy_saved_searches`, `nonrevy_beta_feedback`, `nonrevy_trip_outcomes`. |
| `docs/persistent-watchlists-alerts.sql` | `nonrevy_watchlist_items`, `nonrevy_alert_history`, `nonrevy_alert_snapshots`. |
| `docs/flight-data-expansion.sql` | `public.flights.flight_date`, `public.flights.source_checked_at`. |
| `docs/provider-results-table.sql` | Provider result table, if `NONREVY_STORE_PROVIDER_RESULTS=true`. |
| `docs/community-loads-mvp.sql` | Community load report persistence, if moving load reports beyond local/in-memory beta behavior. |

SQL verification gate:

- [ ] `/api/data-health` reports required beta persistence tables as `present`.
- [ ] `/api/data-health` reports `accountPersistence.storageMode: "supabase"`.
- [ ] `/api/data-health` reports `flightFreshnessSchema.status: "ready"`.
- [ ] If provider-result persistence is enabled, provider-result diagnostics report write/read readiness.

### Provider accounts required

- [ ] FlightAware AeroAPI account is active, billable if needed, and entitled for the schedule/status endpoints used by the app.
- [ ] FlightAware quota headroom is sufficient for 20 testers plus operator smoke tests.
- [ ] AviationStack account is active or explicitly accepted as fallback-limited for beta.
- [ ] Mapbox token has the correct scopes, URL restrictions, and quota for private beta traffic.
- [ ] Supabase project has enough database/API limits for saved searches, feedback, outcomes, watchlists, alerts, and load reports.
- [ ] Provider account dashboards are bookmarked for launch-day monitoring.

### PM2 checks

Run these checks on the launch host immediately before invites go out.

```bash
pm2 status
pm2 logs nonrev-app --lines 100
pm2 describe nonrev-app
```

PM2 launch gate:

- [ ] `nonrev-app` is `online`.
- [ ] Restart count is understood and not rapidly increasing.
- [ ] Memory usage is stable after several searches.
- [ ] Logs show no repeated provider, Supabase, or Next.js runtime exceptions.
- [ ] App restarts cleanly after validation/deploy.

### Health checks

Required operator checks:

- [ ] Open `/api/data-health` and confirm `checkedAt` is current.
- [ ] Open `/data-health` and confirm the human-readable status is understandable.
- [ ] Open `/operator` and confirm provider health, beta counts, data freshness, build version, and commit hash render.
- [ ] Run one smoke search from `docs/smoke-test-matrix.md` for each launch carrier: United, Delta, Alaska, American, Hawaiian.
- [ ] Confirm fallback/stored/test data warnings are visible whenever a result is not truly live.
- [ ] Confirm `/beta-feedback`, `/load-reports`, `/outcomes`, `/watchlist`, and `/alerts` respond without server errors.

## 20 USER PRIVATE BETA

### Onboarding steps

1. Invite exactly 20 testers with the private beta framing: planning assistant, not airline operational truth.
2. Ask each tester to create/sign into an account if account testing is part of the launch cohort.
3. Ask each tester to complete `/onboarding` or `/profile` with home airport, airline/traveler context, and preferred routes.
4. Send the tester to `/plan` for their first route search.
5. Ask the tester to save at least one interesting itinerary to `/watchlist`.
6. Ask the tester to submit at least one feedback item through `/beta-feedback` during the first session.
7. Ask testers with real travel/load knowledge to submit a load report through `/load-reports`.
8. Ask testers who actually attempt travel to submit an outcome through the available outcome flow.
9. Remind testers to verify all trips with official airline tools before making travel decisions.
10. Collect device/browser and tester role for every issue report.

### Expected tester instructions

Give testers this short instruction set:

```text
NONREVY private beta helps compare non-rev route options. It does not guarantee seats or boarding.

Please test:
1. Set up your profile/home airport.
2. Search 3-5 routes you understand well.
3. Save at least one route to your watchlist.
4. Submit any load information you can safely share.
5. Report every wrong, confusing, stale, or overconfident result.
6. If you travel, report the outcome after the trip.
7. Always verify with official airline tools before acting on a recommendation.
```

Tester safety rules:

- Do not submit passenger names, employee-only screenshots, private operational data, or anything prohibited by an airline.
- Do not treat confidence scores as boarding guarantees.
- Do not treat stored, demo, fallback, or nearest-date data as live availability.
- Include screenshots only when they do not expose private data.

### Feedback workflow

- Use `/beta-feedback` for wrong itineraries, confusing copy, missing warnings, broken flows, dead buttons, privacy concerns, and trust issues.
- Include route, date, time tested, device/browser, signed-in state, Personal Testing Mode state, what was expected, and what actually happened.
- Mark high priority when a result could cause a bad travel decision.
- Operator reviews feedback daily and groups it into: blocker, launch-risk, confusing-but-safe, enhancement-later.
- Operator updates the launch issue log and retests the route after each fix or provider/config change.

### How to submit loads

Tester flow:

1. Open `/load-reports`.
2. Enter carrier, route, flight/date if known, load condition, confidence, seats/standby estimate if safe to share, and short notes.
3. Submit the report.
4. Confirm a success message appears.
5. Confirm recent report/history updates when applicable.

Good load notes are factual and source-aware. Example: “Gate display showed several open seats about 45 minutes before departure; standby list looked long.”

### Known limitations

Tell every tester these limitations before testing starts:

- FlightAware is the primary live schedule path, but quota, entitlement, or network failures can downgrade results.
- AviationStack is fallback-only and may be quota-limited.
- Supabase flight rows are stored data, not live seat availability.
- Account-backed persistence requires server-side `SUPABASE_SERVICE_ROLE_KEY` and successful SQL migrations.
- Missing `flight_date` or `source_checked_at` freshness columns reduce stored-data trust.
- Mapbox failures should degrade safely and should not block planning.
- Personal Testing Mode can intentionally use nearest-date stored data and must not be used as production accuracy evidence.
- Demo fallback keeps flows testable but does not represent real airline schedules.
- Confidence/probability scores are planning aids, not promises.

## SUCCESS METRICS

Track these for the first 20 users during the first beta week.

| Metric | Target for 20-user beta | Why it matters |
| --- | --- | --- |
| Searches per user | Median 5+ searches per tester in week 1 | Shows testers can reach the core planning loop. |
| Watchlists created | 12+ testers create at least one watchlist item | Shows route tracking is understandable and useful. |
| Load reports submitted | 20+ total load reports, with at least 8 unique routes | Shows community signal capture is viable. |
| Outcome reports submitted | 8+ trip outcomes or test outcomes | Shows the feedback loop can improve confidence scoring. |
| Return usage rate | 50%+ of testers return on a second day within week 1 | Shows the beta has repeat value beyond curiosity. |

Operator review cadence:

- Daily: count searches, feedback items, load reports, outcomes, watchlists, and active return users.
- Twice weekly: review wrong-itinerary reports and provider/fallback incidents.
- End of week 1: decide whether to keep cohort at 20, add a small second cohort, or pause for fixes.

## POST-LAUNCH

### Top issues to monitor

- Wrong route/date/carrier results.
- Missing or unclear live/stored/fallback warnings.
- High confidence on stale, fallback, or contradicted results.
- Search flows that hang, silently fail, or return empty states without guidance.
- Feedback/load/outcome submissions that appear successful but do not persist.
- Watchlist or alert records that disappear across sessions/devices.
- Raw provider, Supabase, or stack errors shown to testers.
- Mobile layout issues that block form submission.

### Provider failures

Monitor `/api/data-health`, PM2 logs, and provider dashboards for:

- FlightAware `401`, `403`, `429`, entitlement, quota, timeout, or schema-change failures.
- AviationStack quota exhaustion or response shape changes.
- Mapbox `403`, token restriction, or quota failures.
- Supabase REST/auth/table errors, especially around service-role persistence.
- Provider-result persistence write failures if enabled.

Provider incident policy:

- FlightAware down or quota-blocked: pause confidence claims for live searches and warn testers that live schedule quality is degraded.
- AviationStack down: continue if FlightAware is healthy; note fallback limitation in operator log.
- Mapbox down: continue if planning still works; verify placeholders render safely.
- Supabase persistence down: continue only if local fallback is acceptable for the cohort; warn operators that cross-device/account persistence is degraded.

### Fallback behavior

Expected fallback behavior during beta:

- Provider failures should produce warnings, safe fallback states, or stored/test-safe results rather than app crashes.
- Stored results must identify that they are stored and not live availability.
- Demo or nearest-date results must not appear as production truth.
- Local fallback persistence is acceptable for limited testing only when operators understand data may not sync cross-device.
- Confidence language should become more cautious as data gets older, less complete, or fallback-derived.

### Rollback plan

Use this rollback sequence if launch quality drops below acceptable beta safety.

1. Stop inviting new testers.
2. Post a tester notice that live schedule quality or persistence is degraded and all recommendations must be double-checked.
3. Review `/api/data-health`, PM2 logs, provider dashboards, and recent beta feedback.
4. If a deploy caused the issue, roll back to the last known good commit on `agent-dev` or redeploy the previous production build.
5. If provider quota/config caused the issue, disable or de-emphasize the affected provider path and rely only on clearly labeled safe fallback behavior.
6. If Supabase persistence caused the issue, keep `SUPABASE_SERVICE_ROLE_KEY` server-only, revert risky config changes, and fall back to local mode only if acceptable for the cohort.
7. Re-run smoke routes from `docs/smoke-test-matrix.md` before resuming invites.
8. Document the incident, user impact, fix, and retest result in the operator launch log.

Rollback success gate:

- [ ] `/api/data-health` is understandable and no longer worsening.
- [ ] `/operator` loads and reflects the expected degraded or restored state.
- [ ] PM2 is online with stable logs.
- [ ] A representative search, feedback submission, load report, watchlist save, and outcome flow are usable.
- [ ] Testers receive a clear status update before more testing.

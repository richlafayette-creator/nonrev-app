# Provider readiness

Last local verification: 2026-06-18 UTC via `/api/data-health`.

This document summarizes private-beta provider readiness without exposing secrets. Runtime source of truth is the `/api/data-health` JSON response, especially:

- `providerReadiness`
- `checks`
- `accountPersistence`
- `providerPersistence`
- `routeFreshnessProbes`

The data-health UI is intentionally unchanged; these diagnostics are additive API fields for beta release checks.

Supabase readiness is split deliberately so missing server-only persistence does not look like a total Supabase outage:

- `supabaseEnvironment.clientConfigured` reports browser-safe Supabase URL/anon-key readiness.
- `supabaseEnvironment.serviceRoleConfigured` reports server-only service-role readiness without exposing values.
- `accountPersistence.checkedTables` reports each required beta persistence table as `present`, `missing`, or `unknown`.
- `flightFreshnessSchema.columns` reports `flights.flight_date` and `flights.source_checked_at` as `present`, `missing`, or `unknown`.
- `accountPersistence.storageMode` remains `local-fallback` unless all required persistence tables are reachable with service-role diagnostics.

| Provider | Status | Missing environment variables | Fallback behavior | Rate limits |
| --- | --- | --- | --- | --- |
| FlightAware AeroAPI | Ready | None detected | Planner keeps FlightAware first for live schedules/enrichment. If FlightAware is unavailable, route search skips it safely and continues to stored Supabase rows, AviationStack fallback, and test/demo fallback only when explicitly enabled. | Latest probe did not report rate-limit pressure. Continue monitoring AeroAPI quota, billing, and endpoint entitlements; `429`/quota responses are downgraded to warnings. |
| AviationStack | Warning | None detected | Fallback provider is skipped safely when unavailable or quota-limited. Planner can continue with FlightAware, stored Supabase rows, and local/test-safe fallbacks. | Latest probe reported monthly usage limit reached. Treat as fallback unavailable until plan/quota is reset or upgraded; `429`/quota responses remain warning states, not hard API failures. |
| Mapbox | Warning | None detected | Airport map cards keep rendering page-safe placeholders/context when Mapbox static maps are unavailable. No planner flow should fail because maps fail. | Latest static-map probe returned `403`; verify token scope, URL restrictions, and account/quota settings. `429`/quota responses are warning states. |
| Supabase persistence | Missing | `SUPABASE_SERVICE_ROLE_KEY` | Saved searches, beta feedback, outcomes, watchlists, alerts, alert snapshots, and provider-result storage preserve localStorage/local no-op fallback when server persistence is unavailable. | Supabase diagnostics use bounded count/range probes. Monitor project REST limits during beta traffic after service-role persistence is enabled. |
| Route freshness probes | Warning | None directly; depends on live provider access and stored flight schema/freshness | Route cards retain requested-date/source warnings. If `flights.flight_date` is missing but `source_checked_at` exists, diagnostics fall back to source-check age only and keep a warning active. Production-safe mode blocks nearest-date/demo availability unless `NONREVY_TEST_DATA_MODE=true`. | Freshness probes reuse lightweight provider/Supabase checks and avoid high-volume route search traffic. Latest stored freshness probe is limited because `flights.flight_date` is unavailable. |

## Required environment variables

| Area | Variables | Current note |
| --- | --- | --- |
| FlightAware | `FLIGHTAWARE_API_KEY` | Present in local env; latest probe connected. |
| AviationStack | `AVIATIONSTACK_API_KEY` | Present in local env; latest probe quota-limited. |
| Mapbox | `NEXT_PUBLIC_MAPBOX_TOKEN` | Present in local env; latest probe returned `403`. |
| Supabase public client | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Present in local env. `/api/data-health` reports this as `supabaseEnvironment.clientConfigured`. |
| Supabase server persistence | `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, plus `SUPABASE_SERVICE_ROLE_KEY` | Service-role key missing locally; account-backed beta persistence stays in local fallback. `/api/data-health` reports this as `supabaseEnvironment.serviceRoleConfigured`. |
| Provider result storage | `NONREVY_STORE_PROVIDER_RESULTS=true`, `SUPABASE_SERVICE_ROLE_KEY` | Optional/off by default; provider-result writes remain no-op fallback until enabled. |
| Route freshness/test data mode | `NONREVY_TEST_DATA_MODE` | Missing/false is production-safe. Only set `true` for personal testing/demo fallback checks. |

## Supabase setup checklist

Before private beta cross-device persistence checks:

1. Set `SUPABASE_SERVICE_ROLE_KEY` server-side only.
2. Apply `docs/account-beta-persistence.sql` for:
   - `nonrevy_saved_searches`
   - `nonrevy_beta_feedback`
   - `nonrevy_trip_outcomes`
3. Apply `docs/persistent-watchlists-alerts.sql` for:
   - `nonrevy_watchlist_items`
   - `nonrevy_alert_history`
   - `nonrevy_alert_snapshots`
4. Apply the route freshness column migration in `docs/flight-data-expansion.sql` for:
   - `public.flights.flight_date`
   - `public.flights.source_checked_at`
5. If provider result persistence is desired, apply `docs/provider-results-table.sql` and set `NONREVY_STORE_PROVIDER_RESULTS=true`.
6. Verify `/api/data-health` returns:
   - `supabaseEnvironment.clientConfigured: true`
   - `supabaseEnvironment.serviceRoleConfigured: true`
   - every `accountPersistence.checkedTables[].status: "present"`
   - `flightFreshnessSchema.status: "ready"`
   - `accountPersistence.storageMode: "supabase"`

## Warning-state policy

Provider diagnostics should warn rather than hard-fail app behavior:

- Missing keys return `Missing` with local fallback details.
- Provider rejection, quota pressure, schema mismatch, or network failure returns `Limited`/`Warning`.
- Existing planner and beta capture flows keep local fallbacks active.
- Visual UI remains unchanged; extra readiness fields are API-only.

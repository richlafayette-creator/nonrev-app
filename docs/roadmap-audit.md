# NONREVY Roadmap Audit

Audit date: 2026-06-03  
Branch: `agent-dev`  
Build command: `npm run build`

## Executive summary

NONREVY has a broad product scaffold in place: homepage search, planner, provider fallback API, AI trip prompt parsing, itinerary comparison, watchlists, alerts, outcomes, route confidence, airport intelligence, disruption intelligence, data-health checks, and PWA files all exist in the repository. The strongest work is the product surface area and the local scoring/intelligence model composition.

The main gap is that most product systems are still local, static, or provider-optional. Many pages explicitly call themselves scaffolds. Persistence is primarily `localStorage`; Supabase is used for flight/provider reads and a few realtime subscription hooks, but watchlists, saved comparisons, alert history, reminders, trip outcomes, profile, and community probability inputs are not yet synced to durable account-backed tables. The current production build gate is also broken/stalled in this environment: `next build` remained at `Creating an optimized production build ...` until killed twice by timeout.

No standalone roadmap document was found beyond the current product surfaces and docs (`docs/mvp-flight-seed-data.md`, `docs/airport-data-expansion.md`, SQL scaffolds, and page/lib implementation). This audit therefore treats the requested roadmap areas as the roadmap checklist.

## Build verification

Status: **Broken**

Commands run:

```bash
npm run build
npm run build
```

Observed result:

- First run was terminated after the initial 120s command timeout.
- Second run was allowed 300s and was also terminated with `SIGTERM`.
- Both runs reached only:
  - `▲ Next.js 16.2.6 (Turbopack)`
  - `Creating an optimized production build ...`
- Both runs emitted the same workspace-root warning:
  - Next inferred `/root/package-lock.json` as the workspace root because multiple lockfiles exist.
  - It also detected `/root/nonrev-app/package-lock.json`.
  - Suggested mitigation from Next: set `turbopack.root` in Next config or remove the unneeded lockfile.

Build blocker conclusion: the build cannot currently be treated as passing. The most suspicious immediate issue is root inference caused by multiple lockfiles plus duplicate Next config files (`next.config.js` and `next.config.ts`).

## Feature status matrix

| Area | Status | Evidence | Notes / gaps |
| --- | --- | --- | --- |
| Homepage | **Partial** | `app/page.tsx` has branded landing page, search form, voice input hook, carrier selector, AI prompt preview, links to core pages. | Functional navigation scaffold, but no server-side search result rendering on the homepage itself. Carrier selection on homepage is not carried into `/plan`. README remains create-next-app boilerplate. |
| Plan workflow | **Partial** | `app/plan/page.tsx` is the main planner surface with search fields, live itinerary fetch, carrier scope, AI trip planner, scoring, comparison panels, watch/save actions, route confidence, airport intelligence, disruption sections. | Large monolithic client component. Many labels say scaffold. Workflow depends heavily on local/static assumptions and provider availability. |
| Live itinerary search | **Partial** | `app/api/itinerary/search/route.ts` checks Supabase first, Aviationstack fallback second, then FlightAware enrichment, then planning fallback. `lib/itinerarySearch.ts` normalizes flights and builds direct/connecting itineraries. | Good provider order and safe error handling, but live truth depends on env keys, API plans, Supabase schema/seed state, and provider quotas. Fallback can make results look complete even when live data is missing. Supabase query uses broad recent-row fallback. |
| AI Trip Planner | **Partial** | `lib/aiTripPlanner.ts` parses natural language with aliases/dates/preferences and blends route recommendations, historical routes, and prediction engine. Homepage and plan page expose AI trip prompt UX. | Deterministic rules-based parser, not an actual LLM/agent planner. Destination coverage is narrow. Date handling is simple. No itinerary booking/listing constraints. |
| Itinerary comparison | **Partial** | `app/plan/page.tsx` builds comparison cards from live or fallback itineraries, shows score, success probability, route confidence, connection risk, disruption impact, and save/watch actions. `lib/savedItineraryComparisons.ts` stores saved comparisons. | Strong UX scaffold, but saved comparisons are local-only and there is no shared backend, account sync, or historical audit trail. |
| Watchlists | **Partial** | `lib/watchlist.ts` and `app/watchlist/page.tsx` support saved trip watchlists, de-duping, route stats, alert preferences, and watchlist events. | Browser-local only. No scheduled refresh, server push, cross-device sync, or durable notification delivery. |
| Notifications | **Partial** | `app/notifications/page.tsx` has notification center, alert badges, local preference summaries, and Supabase realtime subscriptions for `load_responses` inserts and `flights` changes. | Initial notifications are hardcoded. Realtime hooks create UI messages but do not persist notification records. Alerts are mostly local `localStorage` derived. No push/email/SMS/PWA notification path. |
| Outcome tracking | **Partial** | `lib/tripOutcomes.ts`, `lib/outcomeReminders.ts`, `app/outcomes/page.tsx`, and `app/reminders/page.tsx` implement local trip outcomes, stats, due reminder generation, and “Did you get on?” responses. | Useful local loop, but no account-backed outcome history. Reminders are generated only when the page/client runs, not by a server scheduler. |
| Community probability engine | **Partial** | `lib/predictionEngine.ts` blends carrier baseline, historical routes, outcome history, community load reports, route confidence, traveler profile, and trust score. `app/load-reports/page.tsx`, `lib/loadReports.ts`, and `app/reputation/page.tsx` provide local community/trust scaffolds. | Model is well-explained but placeholder/static/local. No real community network, moderation, anti-abuse, or calibrated validation against actual outcomes. |
| Route confidence | **Partial** | `lib/routeConfidence.ts` calculates route confidence from success probability, historical data, community load, traveler profile, disruption intelligence, and weather sensitivity; UI sections are in planner/watchlist/alerts. | Local deterministic scoring only. Weather impact is static airport sensitivity, not live weather. Prior trend mostly comes from saved local snapshots. |
| Airport intelligence | **Partial** | `lib/airportIntelligence.ts`, `lib/airportMapScaffold.ts`, `app/flights/[id]/page.tsx`, and planner sections provide terminal, connection difficulty, walking, hub, backup, and map placeholders. | Static seed data for selected airports. No licensed terminal maps, gate coordinates, lounges, GPS, or dynamic connection times. |
| Disruption intelligence | **Partial** | `lib/disruptionIntelligence.ts` consumes itinerary leg statuses/delays/cancellations/diversions and airport operational alert placeholders; planner displays route health and backup recommendations. | Strong local abstraction, but operational alerts are static strings and only FlightAware enrichment can add live-ish flight status when configured/entitled. No FAA/weather/airport ops feed. |
| Data health dashboard | **Partial** | `app/data-health/page.tsx` and `app/api/data-health/route.ts` check Supabase, Aviationstack, FlightAware, Mapbox, plus local profile/reports/outcomes. Errors are sanitized. | Good diagnostic surface. Does not appear linked in global `AppNavigation`. It probes provider reachability but not schema completeness, freshness windows, ingestion jobs, or query quality. |
| PWA readiness | **Partial** | `app/manifest.ts`, `public/sw.js`, `app/offline/page.tsx`, `app/PWAInstallScaffold.tsx`, icons and offline shell exist. | Basic manifest/service worker/offline fallback are present. Need production build pass, registration verification, Lighthouse audit, cache versioning strategy, push notification integration, and install UX verification. |

## Complete

These are complete in the sense that a coherent first implementation exists and can be inspected end-to-end, not in the sense that the production roadmap is finished.

- Branded homepage shell with search and AI prompt entry.
- Main planner route and broad UI composition.
- Local itinerary comparison cards with save/watch actions.
- Local watchlist CRUD and event dispatch.
- Local saved comparison CRUD.
- Local outcome capture and reminder response flow.
- Route confidence calculation module and display components.
- Airport intelligence static module and display components.
- Disruption intelligence module and display components.
- Data health API/page scaffold with sanitized provider error messaging.
- PWA manifest, service worker, offline page, and icons.

## Partial

Most roadmap items are currently partial because they are UI-complete or algorithm-complete but not production-integrated:

- Live itinerary search has provider integration code but depends on environment, provider plans, schema, quotas, and fallback behavior.
- AI Trip Planner is rules-based and narrow, not a full AI planning service.
- Community probability engine is explainable but not calibrated against a real community dataset.
- Watchlists, alerts, notifications, outcomes, reminders, profile, trust, load reports, and saved comparisons are local-only.
- Airport maps and flight details degrade gracefully but are placeholders when Mapbox/provider details are unavailable.
- PWA files exist but need build/Lighthouse/install/push validation.

## Missing

- Durable authenticated data model for user profile, saved routes, watchlists, comparisons, alert preferences, alerts, outcomes, reminders, and community reports.
- Server-side ingestion/sync jobs for Supabase flights and provider freshness.
- Server-side scheduler/worker for watchlist refreshes, alerts, and outcome reminders.
- Push notification implementation using Web Push/PWA notifications or another delivery provider.
- Real community system: identities, moderation, abuse controls, report verification, reputation history, and privacy rules.
- Calibration/validation harness for success probabilities against actual trip outcomes.
- Full airport/terminal/gate/lounges/maps data provider integration.
- Comprehensive test suite for parser, itinerary builder, provider fallback, scoring engines, local storage migrations, and API health checks.
- Product onboarding/auth flow completeness; account/profile pages are local scaffolds.
- Production README and deployment/runbook documentation.

## Broken

- Production build did not complete within 300 seconds and was terminated with `SIGTERM`.
- Next/Turbopack workspace root inference is suspicious because `/root/package-lock.json` and `/root/nonrev-app/package-lock.json` both exist.
- Duplicate Next config files exist: `next.config.js` and `next.config.ts`. The JS file sets `allowedDevOrigins`; the TS file is empty. This can cause confusion about which config is authoritative.
- `app/page.tsx.save` is checked into the app directory as a stale backup artifact.
- The homepage carrier scope selector does not appear to affect the `/plan` URL.

## Disconnected systems

1. **Local storage islands:** watchlists, comparisons, alert preferences, alert history, outcomes, reminders, load reports, traveler profile, and reputation-related signals are each local browser state. They communicate through custom window events, not a shared backend domain model.
2. **Notifications versus alerts:** notifications page subscribes to Supabase events and displays hardcoded notification records, while route alerts are generated from local alert history. They are adjacent but not one durable notification pipeline.
3. **Watchlist versus live provider refresh:** watchlist items store snapshot scores/probabilities but do not trigger server-side live itinerary refresh or provider re-query.
4. **Outcome reminders versus actual scheduling:** reminders are generated when a user opens the page/client. There is no backend cron, job queue, or push reminder.
5. **Community probability engine versus actual community:** load reports are local-only, so the “community” engine is currently a single-browser simulation.
6. **Data health versus navigation:** `/data-health` exists but is not included in `AppNavigation`, reducing discoverability for admins/operators.
7. **Provider data versus fallback planning cards:** fallback cards keep UX alive, but they can mask whether Supabase/Aviationstack/FlightAware are really contributing.
8. **Account/billing/credits/membership scaffolds:** monetization surfaces exist but are intentionally not connected to Stripe or real entitlements.

## Duplicate functionality / overlap

- Homepage has a custom top nav while `AppNavigation` defines another global menu; labels/routes overlap but are not identical.
- `/alerts` and the alert section inside `/notifications` both show route alert history/preference state.
- Watchlist and saved itinerary comparisons are separate local stores with overlapping fields: route, carrier, score, success probability, route confidence, risk, connections, travel date.
- Outcome history and outcome reminders both maintain adjacent outcome/reminder state and could be unified under a trip lifecycle model.
- Airport intelligence appears in planner sections, flight detail placeholders, and map scaffold data; these should share one data contract as provider data grows.
- `next.config.js` and `next.config.ts` duplicate config responsibility.
- `app/page.tsx.save` duplicates stale homepage code.

## Technical debt

- Very large `app/plan/page.tsx` client component mixes UI, data fetching, scoring composition, local storage orchestration, and product copy.
- Heavy use of inline styles makes design consistency, responsive polish, and accessibility harder to maintain.
- Extensive `localStorage` persistence lacks versioning, migrations, schema validation, and cross-device support.
- Many model weights are hardcoded and explained as placeholders; no central config/versioning exists for scoring formulas.
- Static route/airport/weather/operational data is embedded in code rather than seeded/provider-backed tables.
- Provider API calls lack comprehensive observability: no request IDs, stored provider audit trail, or freshness dashboard beyond health probes.
- Build config is ambiguous due to duplicate Next config files and multiple lockfiles.
- No visible automated tests or CI gate were inspected in this audit.
- README is still default boilerplate, so the repo lacks product-specific setup/deployment guidance.
- Runtime safety depends on client-side labels like “scaffold”; fallback/planning data needs stronger UI distinction from live data.

## Top 10 highest-value next tasks

1. **Fix the build gate first.** Resolve workspace-root inference, consolidate Next config, remove stale backup artifacts, then get `npm run build` passing reliably.
2. **Create a durable Supabase schema for core user state.** Persist profiles, watchlists, comparisons, alert preferences, alerts, outcomes, reminders, and community load reports with user ownership/RLS.
3. **Unify route watch, saved itinerary, alert, and outcome data into a trip lifecycle model.** Reduce duplicated fields and make planner/watchlist/reminders/outcomes operate on the same entities.
4. **Build a server-side watchlist refresh and alert worker.** Periodically re-query providers, compare snapshots, create durable alerts, and fan out notifications.
5. **Separate live data from planning fallback in the UI and API contract.** Add explicit freshness/source labels and prevent fallback cards from being mistaken for live flight truth.
6. **Extract planner logic out of `app/plan/page.tsx`.** Move scoring composition, API adapters, and UI sections into smaller tested modules/components.
7. **Add tests for the critical engines.** Cover itinerary parsing/building, provider fallback metadata, AI prompt parsing, prediction scoring, route confidence, disruption intelligence, and local/durable storage adapters.
8. **Implement real notification delivery.** Start with durable in-app notifications, then add PWA push once service worker registration and permissions are verified.
9. **Add provider ingestion/audit infrastructure.** Store provider, endpoint, query, row counts, freshness, quota/rate-limit state, and sanitized errors for flight/search data.
10. **Replace static airport/disruption/weather placeholders incrementally.** Move seeds to data tables and connect licensed airport, weather, terminal/gate, and operations feeds behind clear fallbacks.

## Recommended status labels for roadmap tracking

- **Complete:** usable end-to-end without hidden provider/local-only caveats.
- **Partial:** UI or algorithm exists but depends on local storage, static scaffolds, optional provider keys, or manual page visits.
- **Missing:** no implementation or only documentation/copy exists.
- **Broken:** implementation exists but cannot pass build/runtime verification or is likely misleading in production.

Using those labels, the current roadmap is best summarized as:

- Complete: core scaffold surfaces and local demos.
- Partial: nearly all product roadmap areas.
- Missing: backend durability, scheduled automation, real community network, real notification delivery, production calibration.
- Broken: production build gate/config hygiene.

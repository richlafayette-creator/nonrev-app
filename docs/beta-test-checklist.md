# Beta Testing Checklist

Scope: **frugal build mode**. Inspect only user-facing flows. Do not review roadmap items or unrelated systems. For each test, record device, browser, route, signed-in state, expected result, actual result, screenshot/video, and any visible console error.

## Static inspection findings to verify in beta

- **Missing navigation:** the collapsible global menu currently exposes many beta flows but does not include `/onboarding`, `/notification-preferences`, `/membership`, or `/billing`; those are reachable from page-level/account links. Confirm testers can still discover them.
- **Potential broken flow:** `/outcomes` primarily lists/syncs saved outcomes; manual outcome submission appears inside itinerary/reminder contexts via the outcome capture form. Confirm there is a clear path when no reminder is present.
- **Messaging risk:** auth and provider errors appear as user-facing status text. Confirm no raw, confusing provider errors are shown to beta testers.

## Account creation

- [ ] Open `/login` in a fresh browser/session.
- [ ] Create an account with valid email/password.
- [ ] Confirm a clear success message appears and the user can log in.
- [ ] Try invalid credentials and duplicate signup details.
- [ ] Confirm errors are understandable and do not expose raw implementation details.
- [ ] After login, confirm navigation to the main app works.
- Watch for: broken signup/login buttons, stuck loading, missing success/error messages, unclear post-login route.

## Profile setup

- [ ] Open `/profile`.
- [ ] Save employee airline, traveler type, pass priority, home airport, preferred airports, and travel style.
- [ ] Confirm the status message says the local profile was saved.
- [ ] Refresh and confirm saved values persist.
- [ ] Reset profile and confirm defaults return with a clear message.
- [ ] Use links from Profile to Plan, Onboarding, Account, Referrals, Load Reports, and Open Requests.
- Watch for: dead Save/Reset buttons, missing validation, saved data disappearing, missing adjacent navigation.

## Home airport setup

- [ ] Open `/onboarding`.
- [ ] Enter a valid 3-letter home airport and at least one preferred destination.
- [ ] Complete onboarding and confirm success text appears.
- [ ] Open `/profile` and confirm the home airport/preferred airports populated.
- [ ] Try missing/short airport codes and confirm completion is blocked with a useful message.
- Watch for: lowercase/spacing issues, unclear disabled state, missing success/error message, no way back to profile/plan.

## AI Trip Planner

- [ ] Open `/plan`.
- [ ] Submit a natural-language request such as “best Hawaii trip from LAX tomorrow.”
- [ ] Confirm parsed origin, destination, date range, and preferences are visible.
- [ ] Confirm generated recommendations refresh and show explanation text.
- [ ] Submit an empty request and confirm a helpful warning appears.
- Watch for: dead Generate button, no loading/status feedback, mismatched parsed fields, missing success/error text.

## Live itinerary search

- [ ] On `/plan`, search a route/date using the structured itinerary form.
- [ ] Confirm results render with carrier, route, timing, provider badges/freshness, risk, and status.
- [ ] Confirm provider fallback or stale-date messages are readable.
- [ ] Toggle Personal Testing Mode and nearest-date tolerance, then search again.
- [ ] Confirm failures show fallback demo guidance instead of a stuck spinner.
- Watch for: silent API failure, raw JSON/errors, stuck “Searching providers…”, no fallback messaging, invalid date tolerance behavior.

## Itinerary comparison

- [ ] Save at least two planner results for comparison.
- [ ] Confirm saved comparison cards display score, success probability, route confidence, connection count, and backup reasoning.
- [ ] Remove one saved comparison and confirm the list updates.
- [ ] Clear all comparisons and confirm a clear status message appears.
- Watch for: dead Save/Remove/Clear buttons, stale cards after deletion, missing status messages, confusing duplicate routes.

## Watchlists

- [ ] Open `/watchlist`.
- [ ] Add a manual watched route.
- [ ] Add a watched route from Planner.
- [ ] Confirm success probability, route confidence, notification preferences, and saved-itinerary alert context display.
- [ ] Update alert preferences.
- [ ] Remove a watched route and confirm it disappears.
- [ ] Use “Open planner” from saved itinerary alerts.
- Watch for: missing validation, duplicate route confusion, dead Remove/Preference buttons, missing Planner navigation.

## Notifications

- [ ] Open `/notification-preferences`.
- [ ] Enable/disable each event type.
- [ ] Enable/disable each channel.
- [ ] Change frequency and browser push rate limit.
- [ ] Click Enable browser push and confirm permission/subscription status is clear.
- [ ] Process queued notifications now.
- [ ] Clear queue and delivery diagnostics.
- [ ] Open `/notifications`, `/notification-history`, and `/notification-diagnostics` from notification links.
- Watch for: dead permission/process/clear buttons, unclear denied-permission recovery, queue changes without feedback, missing navigation among notification pages.

## Outcome submission

- [ ] From an itinerary/reminder outcome form, submit “got on,” “did not get on,” and other available statuses.
- [ ] Confirm each submission shows a saved status message.
- [ ] Open `/outcomes` and verify submitted outcomes appear.
- [ ] Click Sync outcomes and confirm sync status updates.
- [ ] Confirm stats update: total outcomes, successful trips, success rate, and route confidence average.
- [ ] Open Reminders and Outcome Diagnostics from Outcomes.
- Watch for: no manual submission path when reminders are absent, dead Sync button, stats not updating after refresh, missing success/error messages.

## Community reports

- [ ] Open `/load-reports`.
- [ ] Submit a report with carrier, route, flight/date, load condition, confidence, seat/standby estimates, and notes.
- [ ] Confirm a success message includes report trust/recency context.
- [ ] Confirm recent/report history updates.
- [ ] Use links to Trust/Reputation and Planner.
- Watch for: dead Submit button, validation gaps, report not appearing after submit, missing downstream Planner/Intelligence context.

## Route confidence

- [ ] In Planner, confirm each itinerary shows route confidence score, badge, trend, and component explanation.
- [ ] In Watchlist, confirm route confidence appears consistently for watched routes.
- [ ] In Intelligence, confirm route confidence/probability labels align with Planner language.
- [ ] Add a community report or outcome and refresh to confirm confidence wording acknowledges local signals.
- Watch for: confidence missing, stale score, contradictory labels, impossible values outside 0-100, hidden component details.

## Probability engine

- [ ] In Planner, confirm success probability appears on itinerary cards and detailed explanations.
- [ ] Open `/intelligence` and confirm high-probability route sections render.
- [ ] Open `/historical-routes` and confirm historical success data appears.
- [ ] Add outcome/load report data and confirm probability language mentions stored/local signals where applicable.
- Watch for: probability stuck at a default, missing explanation, impossible values outside 1-99%, labels that conflict across pages.

## Membership upgrade flow

- [ ] Open `/membership`.
- [ ] Select each plan and confirm a local/test-mode status message appears.
- [ ] Click cancel/reset placeholder and confirm it clearly says no Stripe cancellation was sent.
- [ ] Open `/billing`.
- [ ] Stage, activate, and reset plans.
- [ ] Click billing portal placeholder and confirm it gives a clear non-production message.
- Watch for: buttons implying live charging, portal navigation to nowhere, no success/error feedback, missing route from global menu.

## Mobile usability

- [ ] Test home, onboarding, profile, plan, watchlist, notifications, outcomes, load reports, intelligence, membership, and billing at phone width.
- [ ] Confirm the global Menu opens/closes and links are tappable.
- [ ] Confirm forms fit without horizontal scroll.
- [ ] Confirm cards, tables, and long route names wrap cleanly.
- [ ] Confirm primary buttons remain visible and usable with the mobile keyboard open.
- [ ] Confirm status/error text is not clipped.
- Watch for: clipped cards, tiny tap targets, fixed-width grids, hidden navigation, keyboard covering submit buttons.

## Finding log categories

### Broken flows
- [ ] Account signup/login completes and gives clear next steps.
- [ ] Profile/onboarding data saves and persists after refresh.
- [ ] Planner search completes with live, stored, or fallback results.
- [ ] Saved comparisons and watchlists persist after refresh.
- [ ] Outcome and load-report submissions update visible stats/signals.
- [ ] Membership/billing stays clearly test-mode only.

### Dead buttons
- [ ] Login: Sign up, Log in.
- [ ] Onboarding/Profile: Complete, Save draft, Save local profile, Reset.
- [ ] Planner: Generate AI trip plan, Update planner results, Start voice note, Watch route, Save comparison, Remove, Clear.
- [ ] Watchlist: Add route, Remove, alert preference controls.
- [ ] Notifications: Enable browser push, Process queue, Clear queue, Clear diagnostics, Mark all read.
- [ ] Outcomes: Save outcome, Sync outcomes.
- [ ] Load Reports: Submit report.
- [ ] Membership/Billing: Select/stage/activate/reset plan, cancel placeholder, billing portal placeholder.

### Missing navigation
- [ ] Global menu exposes or page links clearly lead to Plan, Profile, Onboarding, Watchlist, Notifications, Notification Preferences, Load Reports, Outcomes, Intelligence, Membership, and Billing.
- [ ] Notification pages link among Preferences, Notifications, History, Diagnostics, and Alerts.
- [ ] Outcomes link to Reminders and Diagnostics.
- [ ] Membership and Billing link to each other and Account.
- [ ] Planner links to Profile, Historical Routes, Load Reports, Outcomes, and Login.

### Missing success/error messages
- [ ] Required-field validation appears before submit where needed.
- [ ] Async actions show completion/failure text.
- [ ] Provider fallback/stale-data states are explicit and non-technical.
- [ ] Notification permission denied state gives a recovery path.
- [ ] Outcome/report saves show visible confirmation.
- [ ] Billing/membership placeholders clearly say no live charge occurred.

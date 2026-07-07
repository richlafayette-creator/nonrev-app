# Standby Confidence Engine

The Standby Confidence Engine is advisory-only planning support. It must never claim standby availability, clearance, seat inventory, employee-travel eligibility, or boarding outcome.

## Sprint 1 aggregation slice

`lib/standbyConfidenceEngine.ts` now exposes two paths:

- `calculateStandbyConfidence(input, env)` — existing guarded score calculation. It still requires the `NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED` feature flag and trusted structured load counts before returning an advisory score.
- `aggregateStandbyConfidence(input, env)` — aggregation wrapper that accepts existing provider result shapes for weather, historical reliability, airport intelligence, and commercial availability.

## Provider behavior

Provider signals are optional. Missing, disabled, unavailable, stale, or unknown providers remain neutral and are recorded in diagnostics metadata.

- Weather: diagnostics-only in this slice; no score impact.
- Airport intelligence: diagnostics-only in this slice; no score impact.
- Commercial availability: proxy-only diagnostics; no score impact and no standby availability claim.
- Historical reliability: maps to the existing `historicalReliabilityScore` input only, preserving the existing score weight.

## Guardrails

- No UI changes.
- No itinerary generation changes.
- No score weighting changes.
- No scraping.
- No fabricated availability.
- Diagnostics explicitly record `advisoryOnly`, `missingProvidersNeutral`, `noScraping`, `noFabricatedAvailability`, `scoreWeightingChanged: false`, and `itineraryGenerationChanged: false`.

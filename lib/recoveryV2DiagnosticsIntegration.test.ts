import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ItineraryResult } from './itinerarySearch'
import type { RecoveryAnalysis } from './recoveryEngine'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildRecoveryV2ServerDiagnostics } from './recoveryV2DiagnosticsIntegration.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { recoveryV2FeatureFlag } from './recoveryV2Readiness.ts'

const recovery: RecoveryAnalysis = {
  score: 72,
  strength: 'Good',
  summary: 'Good advisory recovery profile.',
  primaryRecoveryOption: { type: 'later-flight', label: 'Later flight placeholder', summary: 'Monitor later departures as advisory recovery context.', scoreImpact: 12, estimatedHours: 4, estimatedCost: null, placeholder: true },
  backupOptions: [
    { type: 'later-flight', label: 'Later flight placeholder', summary: 'Monitor later departures as advisory recovery context.', scoreImpact: 12, estimatedHours: 4, estimatedCost: null, placeholder: true },
    { type: 'alternate-airport', label: 'Alternate airport placeholder', summary: 'Consider nearby alternate airports as advisory recovery context.', scoreImpact: 8, estimatedHours: 5, estimatedCost: 90, placeholder: true },
    { type: 'ground-transport', label: 'Ground transport placeholder', summary: 'Ground transport may be worth checking as advisory context.', scoreImpact: 4, estimatedHours: 3, estimatedCost: 70, placeholder: true }
  ],
  laterFlightOpportunities: 2,
  alternateAirportCount: 1,
  alternateAirports: [],
  overnightRisk: false,
  estimatedRecoveryHours: 5,
  estimatedRecoveryCost: 90,
  rentalCarPossible: true,
  hotelLikely: false,
  strandedRisk: 'Low',
  weatherRisk: 'Unknown',
  delayRisk: 'Unknown',
  hotelRecovery: { hotelLikely: false, estimatedNightlyCost: null, riskLevel: 'Low', notes: ['Placeholder hotel recovery only; no hotel API has been called.'] },
  groundRecovery: { rentalCarPossible: true, ridesharePossible: true, trainPossible: false, busPossible: true, estimatedCost: 70, estimatedHours: 3, notes: ['Placeholder ground recovery only; no provider API has been called.'] },
  reasons: ['Some later flight options', 'Alternate airport context']
}

const baseItinerary: ItineraryResult = {
  id: 'itin-1',
  route: 'SFO → LAX',
  legs: [{ route: 'SFO → LAX', origin: 'SFO', destination: 'LAX', carrier: 'UA', flightNumber: '100', departureTime: '2026-07-08T12:00:00.000Z', arrivalTime: '2026-07-08T13:30:00.000Z', aircraft: '737', status: 'scheduled', score: 81, risk: 'moderate', source: 'stored-provider' }],
  carrier: 'UA',
  flightNumber: '100',
  departureTime: '2026-07-08T12:00:00.000Z',
  arrivalTime: '2026-07-08T13:30:00.000Z',
  aircraft: '737',
  status: 'scheduled',
  score: 81,
  risk: 'moderate',
  source: 'stored-provider',
  topRouteRank: 2,
  topRouteScore: 77
}

function enabledEnv(extra: Record<string, string | undefined> = {}) {
  return { [recoveryV2FeatureFlag]: 'true', ...extra }
}

function assertDiagnosticGuardrails(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(lower, /(flight|seat|room|hotel|vehicle|ride)\s+(is\s+|are\s+)?(booked|guaranteed|confirmed|available)/)
  assert.doesNotMatch(lower, /(you\s+can\s+clear|will\s+clear|should\s+clear)\s+standby/)
}

describe('Recovery Engine v2 diagnostics integration', () => {
  it('omits diagnostics completely when the feature flag is disabled', () => {
    const diagnostics = buildRecoveryV2ServerDiagnostics({
      itineraries: [{ ...baseItinerary, recovery }],
      now: new Date('2026-07-08T02:24:00.000Z'),
      env: {}
    })

    assert.equal(diagnostics, undefined)
  })

  it('exposes diagnostics when enabled without changing scoring, ranking, planner behavior, UI, or itinerary generation', () => {
    const diagnostics = buildRecoveryV2ServerDiagnostics({
      itineraries: [{ ...baseItinerary, recovery }],
      now: new Date('2026-07-08T02:24:00.000Z'),
      env: enabledEnv()
    })

    assert.ok(diagnostics)
    assert.equal(diagnostics.enabled, true)
    assert.equal(diagnostics.diagnosticsOnly, true)
    assert.equal(diagnostics.noItineraryGenerationChange, true)
    assert.equal(diagnostics.noRankingChange, true)
    assert.equal(diagnostics.noScoringChange, true)
    assert.equal(diagnostics.noPlannerBehaviorChange, true)
    assert.equal(diagnostics.noUiChange, true)
    assert.equal(diagnostics.noFabricatedFlights, true)
    assert.equal(diagnostics.itineraries.length, 1)
    assert.equal(diagnostics.itineraries[0].candidateReasoning.length, 3)
    assert.equal(diagnostics.itineraries[0].recoveryStageMetadata.stage, 'candidate-generation')
    assert.equal(diagnostics.itineraries[0].recoveryStageMetadata.generatedAt, '2026-07-08T02:24:00.000Z')
    assert.equal(diagnostics.itineraries[0].candidateReasoning.every((candidate) => candidate.rankingImpact === 0 && candidate.scoringImpact === 0), true)
    assertDiagnosticGuardrails(JSON.stringify(diagnostics))
  })

  it('keeps no-candidate diagnostics neutral with rejected missing-provider summaries', () => {
    const diagnostics = buildRecoveryV2ServerDiagnostics({
      itineraries: [baseItinerary],
      now: new Date('2026-07-08T02:24:00.000Z'),
      env: enabledEnv()
    })

    assert.ok(diagnostics)
    const first = diagnostics.itineraries[0]
    assert.equal(first.candidateReasoning.length, 0)
    assert.equal(first.recoveryConfidence.level, 'none')
    assert.equal(first.recoveryConfidence.score, 0)
    assert.equal(first.recoveryStageMetadata.stage, 'no-candidates-neutral-fallback')
    assert.equal(first.recoveryStageMetadata.missingProviderCount > 0, true)
    assert.match(first.fallbackReason, /No Recovery Engine v2 candidates were generated/i)
    assert.equal(first.rejectedCandidateSummaries.length > 0, true)
  })

  it('summarizes multiple recovery candidates from multiple itineraries', () => {
    const diagnostics = buildRecoveryV2ServerDiagnostics({
      itineraries: [
        { ...baseItinerary, id: 'itin-1', recovery },
        { ...baseItinerary, id: 'itin-2', route: 'SFO → OAK → LAX', recovery }
      ],
      now: new Date('2026-07-08T02:24:00.000Z'),
      env: enabledEnv()
    })

    assert.ok(diagnostics)
    assert.equal(diagnostics.itineraries.length, 2)
    assert.equal(diagnostics.itineraries.every((itinerary) => itinerary.candidateReasoning.length === 3), true)
    assert.equal(diagnostics.itineraries.every((itinerary) => itinerary.recoveryConfidence.score > 0), true)
  })

  it('treats provider failures as neutral fallback diagnostics', () => {
    const diagnostics = buildRecoveryV2ServerDiagnostics({
      itineraries: [baseItinerary],
      providerFailures: [{ provider: 'flightaware', label: 'FlightAware', state: 'error', detail: 'FlightAware timeout; skipped recovery provider input.' }],
      safeErrors: ['Commercial provider warning: rate limited.'],
      now: new Date('2026-07-08T02:24:00.000Z'),
      env: enabledEnv()
    })

    assert.ok(diagnostics)
    assert.equal(diagnostics.providerFailures.length, 2)
    assert.equal(diagnostics.itineraries[0].recoveryStageMetadata.stage, 'provider-failure-neutral-fallback')
    assert.equal(diagnostics.itineraries[0].recoveryStageMetadata.providerFailureCount, 2)
    assert.match(diagnostics.itineraries[0].fallbackReason, /provider failures|skipped sources/i)
  })

  it('redacts secrets and provider credentials from diagnostics', () => {
    const diagnostics = buildRecoveryV2ServerDiagnostics({
      itineraries: [{
        ...baseItinerary,
        recovery: {
          ...recovery,
          backupOptions: [{ ...recovery.backupOptions[0], summary: 'Fetched with bearer secret-provider-token and token_abcdefghijklmnop' }]
        }
      }],
      providerFailures: [{ provider: 'flightaware', label: 'FlightAware', state: 'error', detail: 'GET https://example.test?api_key=secret-provider-token failed with bearer secret-provider-token' }],
      safeErrors: ['Cached credential token_abcdefghijklmnop must not leak.'],
      now: new Date('2026-07-08T02:24:00.000Z'),
      env: enabledEnv({ SECRET_TOKEN: 'secret-provider-token' })
    })
    const serialized = JSON.stringify(diagnostics)

    assert.ok(diagnostics)
    assert.doesNotMatch(serialized, /secret-provider-token/)
    assert.doesNotMatch(serialized, /token_abcdefghijklmnop/)
    assert.match(serialized, /\[redacted\]/)
  })
})

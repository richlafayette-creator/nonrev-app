import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ItineraryResult } from './itinerarySearch'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildPlannerSignalAttributionDiagnostics, plannerSignalAttributionFeatureFlag } from './plannerSignalAttribution.ts'

const now = new Date('2026-07-08T02:58:00.000Z')

const baseItinerary: ItineraryResult = {
  id: 'itin-1',
  route: 'SFO → LAX',
  legs: [{ route: 'SFO → LAX', origin: 'SFO', destination: 'LAX', carrier: 'UA', flightNumber: '100', departureTime: '2026-07-08T12:00:00.000Z', arrivalTime: '2026-07-08T13:30:00.000Z', aircraft: '737', status: 'scheduled', score: 82, risk: 'moderate', source: 'stored-provider' }],
  carrier: 'UA',
  flightNumber: '100',
  departureTime: '2026-07-08T12:00:00.000Z',
  arrivalTime: '2026-07-08T13:30:00.000Z',
  aircraft: '737',
  status: 'scheduled',
  score: 82,
  risk: 'moderate',
  source: 'stored-provider',
  topRouteRank: 1,
  topRouteScore: 88
}

const weather = {
  route: 'SFO → LAX',
  source: 'AviationWeather.gov / METAR / TAF',
  observedAt: '2026-07-08T01:50:00.000Z',
  cacheStatus: 'fresh',
  routeRisk: { level: 'clear', label: 'Clear', highRiskConnectionAirports: [] }
}

const historicalReliability = {
  providerName: 'Internal historical reliability',
  confidenceScore: 74,
  onTimePercentage: 82,
  sampleSize: 120,
  dataFreshness: { latestUpdated: '2026-07-07T00:00:00.000Z' },
  providerStatus: { status: 'success' }
}

const airportIntelligence = {
  airportCode: 'SFO',
  providerName: 'OurAirports scaffold',
  confidence: 68,
  lastUpdated: '2026-07-07T12:00:00.000Z',
  alternateAirportOptions: []
}

const commercialAvailability = {
  providerName: 'Commercial proxy cache',
  safeLabel: 'limited',
  proxyOnly: true,
  lastUpdated: '2026-07-08T01:30:00.000Z'
}

const recoveryV2 = {
  candidates: [{ id: 'recovery-v2-later-flight-1' }, { id: 'recovery-v2-weather-1' }],
  diagnostics: { generatedAt: '2026-07-08T02:24:00.000Z' }
}

const standbyConfidence = {
  status: 'advisory',
  level: 'medium',
  displayValue: '62/100 advisory',
  confirmedClearance: false,
  standbyAvailabilityConfirmed: false,
  diagnostics: {
    generatedAt: '2026-07-08T02:20:00.000Z',
    signals: [{ source: 'route', status: 'present' }, { source: 'load', status: 'present' }]
  }
}

function enabledEnv(extra: Record<string, string | undefined> = {}) {
  return { [plannerSignalAttributionFeatureFlag]: 'true', ...extra }
}

function withAllSignals(extra: Record<string, unknown> = {}) {
  return {
    ...baseItinerary,
    weatherIntelligence: weather as never,
    historicalReliability: historicalReliability as never,
    airportIntelligence,
    commercialAvailability,
    recoveryV2,
    standbyConfidence,
    ...extra
  }
}

function serializedGuardrails(value: unknown) {
  const serialized = JSON.stringify(value)
  assert.doesNotMatch(serialized, /confirmed standby|standby is available|seat is available|booked|guaranteed/i)
  return serialized
}

function assertZeroImpact(signal: { rankingImpact: number; scoringImpact: number; confidenceScoringImpact: number; itineraryGenerationImpact: number; plannerBehaviorImpact: number }) {
  assert.equal(signal.rankingImpact, 0)
  assert.equal(signal.scoringImpact, 0)
  assert.equal(signal.confidenceScoringImpact, 0)
  assert.equal(signal.itineraryGenerationImpact, 0)
  assert.equal(signal.plannerBehaviorImpact, 0)
}

describe('Planner signal attribution diagnostics', () => {
  it('records attribution when all providers are available', () => {
    const diagnostics = buildPlannerSignalAttributionDiagnostics({
      itineraries: [withAllSignals()],
      now,
      env: enabledEnv()
    })

    assert.ok(diagnostics)
    assert.equal(diagnostics.enabled, true)
    assert.equal(diagnostics.diagnosticsOnly, true)
    assert.equal(diagnostics.noApiContractChange, true)
    assert.equal(diagnostics.noPlannerBehaviorChange, true)
    assert.equal(diagnostics.noRankingChange, true)
    assert.equal(diagnostics.noScoringChange, true)
    assert.equal(diagnostics.noConfidenceScoringChange, true)
    assert.equal(diagnostics.noItineraryGenerationChange, true)
    assert.equal(diagnostics.noUiChange, true)
    assert.equal(diagnostics.noAdvisoryWordingChange, true)
    assert.equal(diagnostics.generatedAt, '2026-07-08T02:58:00.000Z')
    const first = diagnostics.itineraries[0]
    assert.equal(first.signals.length, 6)
    assert.deepEqual(first.signals.map((signal) => signal.source), ['weather', 'historical-reliability', 'airport-intelligence', 'commercial-availability', 'recovery-engine-v2', 'standby-confidence'])
    assert.equal(first.presentSignalCount, 6)
    assert.equal(first.missingSignalCount, 0)
    assert.equal(first.failedSignalCount, 0)
    first.signals.forEach(assertZeroImpact)
    assert.match(first.attributionSummary, /Weather, Historical Reliability, Airport Intelligence, Commercial Availability, Recovery Engine v2, Standby Confidence/)
    serializedGuardrails(diagnostics)
  })

  it('keeps partial provider availability neutral for missing signals', () => {
    const diagnostics = buildPlannerSignalAttributionDiagnostics({
      itineraries: [withAllSignals({
        airportIntelligence: undefined,
        commercialAvailability: undefined,
        recoveryV2: undefined
      })],
      now,
      env: enabledEnv()
    })

    assert.ok(diagnostics)
    const first = diagnostics.itineraries[0]
    assert.equal(first.presentSignalCount, 3)
    assert.equal(first.missingSignalCount, 3)
    assert.equal(first.signals.find((signal) => signal.source === 'airport-intelligence')?.status, 'missing')
    assert.equal(first.signals.find((signal) => signal.source === 'commercial-availability')?.contribution, 'neutral-fallback')
    assert.equal(first.signals.find((signal) => signal.source === 'recovery-engine-v2')?.contributed, false)
  })

  it('records missing providers as neutral attribution without throwing', () => {
    const diagnostics = buildPlannerSignalAttributionDiagnostics({
      itineraries: [baseItinerary],
      now,
      env: enabledEnv()
    })

    assert.ok(diagnostics)
    const first = diagnostics.itineraries[0]
    assert.equal(first.presentSignalCount, 0)
    assert.equal(first.missingSignalCount, 6)
    assert.equal(first.signals.every((signal) => signal.status === 'missing'), true)
    assert.equal(first.signals.every((signal) => signal.contributed === false), true)
    assert.match(first.attributionSummary, /neutral fallback applied for all providers/i)
  })

  it('records provider failures as diagnostics-only neutral fallback and handles unknown provider shapes', () => {
    const diagnostics = buildPlannerSignalAttributionDiagnostics({
      itineraries: [withAllSignals({
        weatherIntelligence: { status: 'timeout', source: 'Weather provider', routeRisk: { level: 'unknown' } } as never,
        airportIntelligence: { totallyUnknownProviderShape: true, providerName: 'MysteryProvider' }
      })],
      providerFailures: [
        { source: 'weather', providerName: 'Weather provider', status: 'timeout', detail: 'Weather provider timed out; neutral fallback applied.' },
        { source: 'airport-intelligence', providerName: 'MysteryProvider', status: 'unknown', detail: 'Unknown payload shape ignored safely.' }
      ],
      now,
      env: enabledEnv()
    })

    assert.ok(diagnostics)
    const first = diagnostics.itineraries[0]
    assert.equal(first.signals.find((signal) => signal.source === 'weather')?.status, 'failed')
    assert.equal(first.failedSignalCount, 1)
    assert.equal(diagnostics.providerFailures.length, 2)
    assert.match(diagnostics.providerFailures[0].neutralFallbackReason, /did not change planner behavior/)
    assert.equal(first.signals.find((signal) => signal.source === 'airport-intelligence')?.status, 'present')
  })

  it('omits diagnostics completely when the feature flag is off', () => {
    const diagnostics = buildPlannerSignalAttributionDiagnostics({
      itineraries: [withAllSignals()],
      now,
      env: {}
    })

    assert.equal(diagnostics, undefined)
  })

  it('redacts provider secrets, credentials, and internal implementation details', () => {
    const diagnostics = buildPlannerSignalAttributionDiagnostics({
      itineraries: [withAllSignals({
        weatherIntelligence: {
          ...weather,
          source: 'provider-secret-token',
          routeRisk: { level: 'clear', label: 'Clear from lib/secretProvider.ts:42:7 using token_abcdefghijklmnop' }
        } as never,
        commercialAvailability: {
          providerName: 'Bearer secret-provider-token',
          safeLabel: 'limited',
          lastUpdated: '2026-07-08T01:30:00.000Z'
        }
      })],
      providerFailures: [{
        source: 'commercial-availability',
        providerName: 'provider-secret-token',
        status: 'error',
        detail: 'GET https://example.test/path?api_key=secret-provider-token failed at fetchSecret (/root/nonrev-app/lib/provider.ts:10:2) with token_abcdefghijklmnop'
      }],
      now,
      env: enabledEnv({ SECRET_VALUE: 'secret-provider-token' })
    })

    const serialized = JSON.stringify(diagnostics)
    assert.ok(diagnostics)
    assert.doesNotMatch(serialized, /secret-provider-token/)
    assert.doesNotMatch(serialized, /token_abcdefghijklmnop/)
    assert.doesNotMatch(serialized, /api_key=secret-provider-token/)
    assert.doesNotMatch(serialized, /\/root\/nonrev-app/)
    assert.doesNotMatch(serialized, /lib\/provider\.ts/)
    assert.match(serialized, /\[redacted\]|\[internal\]/)
  })
})

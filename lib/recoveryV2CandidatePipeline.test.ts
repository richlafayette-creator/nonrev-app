import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RecoveryAnalysis } from './recoveryEngine'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildRecoveryV2Candidates } from './recoveryV2CandidatePipeline.ts'

function assertNoConfirmedRecoveryClaims(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(lower, /(flight|seat|room|hotel|vehicle|ride)\s+(is\s+|are\s+)?(booked|guaranteed|confirmed|available)/)
  assert.doesNotMatch(lower, /(you\s+can\s+clear|will\s+clear|should\s+clear)\s+standby/)
  assert.doesNotMatch(lower, /confirmed\s+(reaccommodation|clearance|boarding|availability)/)
}

const itinerary = {
  id: 'itinerary-1',
  route: 'SFO → LAX',
  carrier: 'UA',
  flightNumber: '100',
  departureTime: '2026-07-08T12:00:00.000Z',
  arrivalTime: '2026-07-08T13:30:00.000Z',
  duration: '1h 30m',
  aircraft: '737',
  status: 'scheduled',
  score: 81,
  topRouteRank: 2,
  topRouteScore: 77,
  risk: 'moderate',
  source: 'stored-provider',
  legs: [{ origin: 'SFO', destination: 'LAX', flightNumber: '100', departureTime: '2026-07-08T12:00:00.000Z', arrivalTime: '2026-07-08T13:30:00.000Z' }]
}

const recovery: RecoveryAnalysis = {
  score: 74,
  strength: 'Good',
  summary: 'Good recovery profile: Some later flight options Alternate airport available Hotel options nearby',
  primaryRecoveryOption: { type: 'later-flight', label: 'Later flight placeholder', summary: '2 later departure opportunities estimated from route density placeholders.', scoreImpact: 14, estimatedHours: 4, estimatedCost: null, placeholder: true },
  backupOptions: [
    { type: 'later-flight', label: 'Later flight placeholder', summary: '2 later departure opportunities estimated from route density placeholders.', scoreImpact: 14, estimatedHours: 4, estimatedCost: null, placeholder: true },
    { type: 'alternate-airport', label: 'Alternate airport placeholder', summary: 'Consider OAK, SJC if the primary airport fails.', scoreImpact: 10, estimatedHours: 6, estimatedCost: 90, placeholder: true },
    { type: 'ground-transport', label: 'Ground recovery placeholder', summary: 'Rental car or rideshare recovery may be possible for nearby airport moves.', scoreImpact: 6, estimatedHours: 5, estimatedCost: 90, placeholder: true },
    { type: 'overnight-hotel', label: 'Hotel recovery placeholder', summary: 'Hotel options are likely nearby if recovery slips overnight.', scoreImpact: 3, estimatedHours: null, estimatedCost: 190, placeholder: true }
  ],
  laterFlightOpportunities: 2,
  alternateAirportCount: 2,
  alternateAirports: [],
  overnightRisk: false,
  estimatedRecoveryHours: 6,
  estimatedRecoveryCost: 90,
  rentalCarPossible: true,
  hotelLikely: true,
  strandedRisk: 'Low',
  weatherRisk: 'Unknown',
  delayRisk: 'Unknown',
  hotelRecovery: { hotelLikely: true, estimatedNightlyCost: 190, riskLevel: 'Low', notes: ['Placeholder hotel recovery only; no hotel API has been called.'] },
  groundRecovery: { rentalCarPossible: true, ridesharePossible: true, trainPossible: true, busPossible: true, estimatedCost: 90, estimatedHours: 6, notes: ['Placeholder ground recovery only; no rideshare, rental car, train, or bus API has been called.'] },
  reasons: ['Some later flight options', 'Alternate airport available', 'Hotel options nearby']
}

describe('Recovery Engine v2 candidate pipeline', () => {
  it('keeps missing providers neutral and performs candidate generation only', () => {
    const result = buildRecoveryV2Candidates({
      itinerary,
      now: new Date('2026-07-08T00:16:00.000Z'),
      env: {}
    })

    assert.equal(result.advisoryOnly, true)
    assert.equal(result.candidates.length, 0)
    assert.equal(result.diagnostics.generatedAt, '2026-07-08T00:16:00.000Z')
    assert.equal(result.diagnostics.candidateGenerationOnly, true)
    assert.equal(result.diagnostics.missingProvidersNeutral, true)
    assert.equal(result.diagnostics.noRankingChange, true)
    assert.equal(result.diagnostics.noScoringChange, true)
    assert.equal(result.diagnostics.noItineraryGenerationChange, true)
    assert.equal(result.diagnostics.noScraping, true)
    assert.equal(result.diagnostics.noFabricatedFlights, true)
    assert.deepEqual(result.originalRanking, { score: 81, topRouteRank: 2, topRouteScore: 77 })
    assert.deepEqual(result.unchangedRanking, result.originalRanking)
    assert.equal(result.diagnostics.signals.every((signal) => signal.status === 'missing' || signal.status === 'neutral'), true)
    assert.equal(result.diagnostics.signals.every((signal) => signal.rankingImpact === 0 && signal.scoringImpact === 0), true)
  })

  it('generates advisory candidates from existing recovery and provider interfaces without changing ranking', () => {
    const result = buildRecoveryV2Candidates({
      itinerary,
      recovery,
      weatherIntelligence: {
        route: 'SFO → LAX',
        airports: [],
        routeRisk: {
          level: 'watch',
          label: 'Watch',
          category: 'Moderate',
          scoreAdjustment: 0,
          scoreImpact: 0,
          successProbabilityImpact: 0,
          routeRankingImpact: 0,
          delayRisk: 'watch',
          cancellationRisk: 'clear',
          confidence: 'medium',
          highRiskConnectionAirports: ['SFO'],
          summary: 'Advisory watch only.',
          limitations: ['Advisory only.']
        },
        observedAt: '2026-07-08T00:00:00.000Z',
        source: 'AviationWeather.gov / METAR / TAF',
        dataSources: ['AviationWeather.gov / METAR / TAF'],
        futureDataSources: [],
        sourceReadiness: [],
        advisoryOnly: true,
        cacheStatus: 'fresh',
        limitations: ['Advisory only.']
      },
      airportIntelligence: {
        airportCode: 'SFO',
        congestionLevel: 'moderate',
        connectionRisk: 'low',
        minimumConnectionMinutes: 45,
        customsImmigrationRisk: 'unknown',
        terminalTransferRisk: 'low',
        alternateAirportOptions: [{ airportCode: 'OAK', reason: 'Nearby alternate', recoveryScore: 70, minimumConnectionMinutes: null, confidence: 65 }],
        recoveryScore: 70,
        confidence: 65,
        providerName: 'Local static airport scaffold',
        lastUpdated: '2026-07-08T00:00:00.000Z'
      },
      commercialAvailability: {
        carrier: 'UA',
        flightNumber: '100',
        origin: 'SFO',
        destination: 'LAX',
        departureDate: '2026-07-08',
        cabinAvailability: [],
        fareClassAvailability: [],
        observedPrice: null,
        priceTrend: 'unknown',
        sellableStatus: 'available',
        safeLabel: 'favorable',
        confidence: 'low',
        providerName: 'MockCommercialAvailabilityProvider',
        lastUpdated: '2026-07-08T00:00:00.000Z',
        limitations: ['Proxy only.']
      },
      standbyConfidence: {
        generatedAt: '2026-07-08T00:00:00.000Z',
        route: 'SFO → LAX',
        advisoryOnly: true,
        missingProvidersNeutral: true,
        noScraping: true,
        noFabricatedAvailability: true,
        scoreWeightingChanged: false,
        itineraryGenerationChanged: false,
        signals: [{
          source: 'weather',
          status: 'present',
          providerName: 'Cached METAR',
          lastUpdated: '2026-07-08T00:00:00.000Z',
          contribution: 'none',
          scoreImpact: 0,
          message: 'Weather is advisory-only context.',
          metadata: { level: 'watch' }
        }]
      },
      now: new Date('2026-07-08T00:16:00.000Z'),
      env: {}
    })

    assert.ok(result.candidates.length >= 5)
    assert.equal(result.candidates.every((candidate) => candidate.advisoryOnly), true)
    assert.equal(result.candidates.every((candidate) => candidate.confirmedAvailability === false), true)
    assert.equal(result.candidates.every((candidate) => candidate.bookingEnabled === false), true)
    assert.equal(result.candidates.every((candidate) => candidate.fabricatedFlight === false), true)
    assert.equal(result.candidates.every((candidate) => candidate.rankingImpact === 0 && candidate.scoringImpact === 0), true)
    assert.deepEqual(result.unchangedRanking, { score: 81, topRouteRank: 2, topRouteScore: 77 })
    assert.ok(result.diagnostics.signals.find((signal) => signal.source === 'standby-confidence' && signal.status === 'present'))
    assert.ok(result.diagnostics.signals.find((signal) => signal.source === 'airport-intelligence' && signal.candidateCount === 1))
    assertNoConfirmedRecoveryClaims(JSON.stringify(result))
  })

  it('redacts secrets from diagnostics and candidate provenance', () => {
    const result = buildRecoveryV2Candidates({
      itinerary,
      standbyConfidence: {
        generatedAt: '2026-07-08T00:00:00.000Z',
        route: 'SFO → LAX',
        advisoryOnly: true,
        missingProvidersNeutral: true,
        noScraping: true,
        noFabricatedAvailability: true,
        scoreWeightingChanged: false,
        itineraryGenerationChanged: false,
        signals: [{
          source: 'commercial-availability',
          status: 'present',
          providerName: 'Bearer secret-provider-token',
          lastUpdated: null,
          contribution: 'none',
          scoreImpact: 0,
          message: 'Fetched https://example.test/path?api_key=secret-provider-token with bearer token_abcdefghijklmnop',
          metadata: { token: 'secret-provider-token' }
        }]
      },
      env: { SECRET_TOKEN: 'secret-provider-token' }
    })
    const serialized = JSON.stringify(result)

    assert.doesNotMatch(serialized, /secret-provider-token/)
    assert.doesNotMatch(serialized, /token_abcdefghijklmnop/)
    assert.match(serialized, /\[redacted\]/)
  })

  it('does not mutate the input itinerary while producing recovery candidates', () => {
    const input = structuredClone(itinerary)
    const before = structuredClone(input)
    const result = buildRecoveryV2Candidates({ itinerary: input, recovery, env: {} })

    assert.deepEqual(input, before)
    assert.deepEqual(result.originalRanking, result.unchangedRanking)
    assert.equal(result.diagnostics.noRankingChange, true)
    assert.equal(result.diagnostics.noScoringChange, true)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { aggregateStandbyConfidence, calculateStandbyConfidence, standbyConfidenceEngineFeatureFlag } from './standbyConfidenceEngine.ts'

function assertNoConfirmedStandbyClaims(text: string) {
  assert.doesNotMatch(text.toLowerCase(), /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(text.toLowerCase(), /(you\s+can\s+clear|will\s+clear|should\s+clear)\s+standby/)
  assert.doesNotMatch(text.toLowerCase(), /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
}

describe('standby confidence engine guardrails', () => {
  it('is disabled by default and never confirms clearance', () => {
    const result = calculateStandbyConfidence({
      route: 'SFO → HNL',
      routeConfidenceScore: 82,
      loadDataStatus: 'verified',
      seatsAvailable: 20,
      standbyCount: 2
    }, {})

    assert.equal(result.status, 'disabled')
    assert.equal(result.score, null)
    assert.equal(result.displayValue, 'Disabled')
    assert.equal(result.featureFlagEnvVar, standbyConfidenceEngineFeatureFlag)
    assert.equal(result.advisoryOnly, true)
    assert.equal(result.confirmedClearance, false)
    assert.equal(result.standbyAvailabilityConfirmed, false)
    assertNoConfirmedStandbyClaims([...result.reasons, ...result.limitations].join(' '))
  })

  it('requires trusted structured load data before showing an advisory score', () => {
    const result = calculateStandbyConfidence({
      route: 'SFO → HNL',
      routeConfidenceScore: 82,
      loadDataStatus: 'stale',
      seatsAvailable: 20,
      standbyCount: 2,
      recoveryStrength: 'Strong'
    }, { NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED: 'true' })

    assert.equal(result.status, 'needs-load')
    assert.equal(result.score, null)
    assert.equal(result.displayValue, 'Needs Load')
    assert.equal(result.confirmedClearance, false)
    assert.equal(result.standbyAvailabilityConfirmed, false)
    assert.match(result.reasons.join(' '), /requires trusted structured seat and standby counts/i)
    assertNoConfirmedStandbyClaims([...result.reasons, ...result.limitations].join(' '))
  })

  it('returns capped advisory planning confidence without confirmed standby availability', () => {
    const result = calculateStandbyConfidence({
      route: 'SFO → HNL',
      routeConfidenceScore: 94,
      loadDataStatus: 'verified',
      seatsAvailable: 28,
      standbyCount: 2,
      communityReportCount: 6,
      recoveryStrength: 'Strong',
      historicalReliabilityScore: 95
    }, { NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED: '1' })

    assert.equal(result.status, 'advisory')
    assert.equal(result.label, 'Advisory planning confidence')
    assert.equal(result.score, 88)
    assert.equal(result.displayValue, '88/100 advisory')
    assert.equal(result.confirmedClearance, false)
    assert.equal(result.standbyAvailabilityConfirmed, false)
    assert.equal(result.appliesToBookingDecision, false)
    assert.match(result.limitations.join(' '), /never confirms standby clearance/i)
    assertNoConfirmedStandbyClaims([...result.reasons, ...result.limitations, result.displayValue].join(' '))
  })

  it('aggregates missing provider interfaces as neutral diagnostics', () => {
    const result = aggregateStandbyConfidence({
      route: 'SFO → HNL',
      routeConfidenceScore: 80,
      loadDataStatus: 'verified',
      seatsAvailable: 12,
      standbyCount: 4,
      now: new Date('2026-07-07T18:10:00.000Z')
    }, { NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED: 'true' })

    assert.equal(result.status, 'advisory')
    assert.equal(result.diagnostics.generatedAt, '2026-07-07T18:10:00.000Z')
    assert.equal(result.diagnostics.missingProvidersNeutral, true)
    assert.equal(result.diagnostics.noFabricatedAvailability, true)
    assert.equal(result.diagnostics.noScraping, true)
    assert.equal(result.diagnostics.scoreWeightingChanged, false)
    assert.equal(result.diagnostics.itineraryGenerationChanged, false)

    const weather = result.diagnostics.signals.find((signal) => signal.source === 'weather')
    const historical = result.diagnostics.signals.find((signal) => signal.source === 'historical-reliability')
    const airport = result.diagnostics.signals.find((signal) => signal.source === 'airport-intelligence')
    const commercial = result.diagnostics.signals.find((signal) => signal.source === 'commercial-availability')

    assert.equal(weather?.status, 'missing')
    assert.equal(weather?.scoreImpact, 0)
    assert.equal(historical?.status, 'missing')
    assert.equal(historical?.scoreImpact, 0)
    assert.equal(airport?.status, 'missing')
    assert.equal(airport?.scoreImpact, 0)
    assert.equal(commercial?.status, 'missing')
    assert.equal(commercial?.scoreImpact, 0)
    assertNoConfirmedStandbyClaims([...result.reasons, ...result.limitations, ...result.diagnostics.signals.map((signal) => signal.message)].join(' '))
  })

  it('consumes existing provider result shapes without changing weather, airport, or commercial scoring', () => {
    const result = aggregateStandbyConfidence({
      route: 'SFO → HNL',
      routeConfidenceScore: 70,
      loadDataStatus: 'trusted',
      seatsAvailable: 8,
      standbyCount: 4,
      weather: {
        category: 'Moderate',
        level: 'watch',
        displayLabel: 'Watch',
        scoreImpact: 0,
        successProbabilityImpact: 0,
        routeRankingImpact: 0,
        source: 'Cached weather advisory',
        status: 'cached-advisory',
        details: [],
        diagnostics: []
      },
      historicalReliability: {
        onTimePercentage: 86,
        cancellationPercentage: 1.5,
        averageDepartureDelay: 8,
        averageArrivalDelay: 6,
        confidenceScore: 75,
        lastUpdated: '2026-07-07T17:55:00.000Z',
        providerName: 'TestHistoricalReliabilityProvider'
      },
      airportIntelligence: {
        airportCode: 'SFO',
        congestionLevel: 'moderate',
        connectionRisk: 'low',
        minimumConnectionMinutes: 45,
        customsImmigrationRisk: 'unknown',
        terminalTransferRisk: 'low',
        alternateAirportOptions: [],
        recoveryScore: 70,
        confidence: 60,
        providerName: 'TestAirportIntelligenceProvider',
        lastUpdated: '2026-07-07T17:50:00.000Z'
      },
      commercialAvailability: {
        carrier: 'UA',
        flightNumber: '1',
        origin: 'SFO',
        destination: 'HNL',
        departureDate: '2026-07-08',
        cabinAvailability: [],
        fareClassAvailability: [],
        observedPrice: 320,
        priceTrend: 'stable',
        sellableStatus: 'available',
        safeLabel: 'favorable',
        confidence: 'low',
        providerName: 'TestCommercialAvailabilityProvider',
        lastUpdated: '2026-07-07T17:45:00.000Z',
        limitations: ['Proxy only.']
      },
      now: new Date('2026-07-07T18:10:00.000Z')
    }, { NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED: 'true' })

    assert.equal(result.status, 'advisory')
    assert.equal(result.score, 61)

    const weather = result.diagnostics.signals.find((signal) => signal.source === 'weather')
    const historical = result.diagnostics.signals.find((signal) => signal.source === 'historical-reliability')
    const airport = result.diagnostics.signals.find((signal) => signal.source === 'airport-intelligence')
    const commercial = result.diagnostics.signals.find((signal) => signal.source === 'commercial-availability')

    assert.equal(weather?.status, 'present')
    assert.equal(weather?.scoreImpact, 0)
    assert.equal(airport?.status, 'present')
    assert.equal(airport?.scoreImpact, 0)
    assert.equal(commercial?.status, 'present')
    assert.equal(commercial?.scoreImpact, 0)
    assert.equal(commercial?.metadata.safeLabel, 'favorable')
    assert.equal(historical?.status, 'present')
    assert.equal(historical?.contribution, 'existing-historical-reliability-input')
    assert.equal(historical?.scoreImpact, 6)
    assertNoConfirmedStandbyClaims([...result.reasons, ...result.limitations, ...result.diagnostics.signals.map((signal) => signal.message)].join(' '))
  })
})

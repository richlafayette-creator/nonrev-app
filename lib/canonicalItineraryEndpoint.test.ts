import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { canonicalItineraryEndpointAudit, runCanonicalItineraryEndpoint, routingEngineVersion } from './canonicalItineraryEndpoint.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createDefaultScheduleProviderRegistry, createMockScheduleProvider } from './scheduleProviderRegistry.ts'

const rows = [
  { carrier: 'United', flightNumber: 'UA100', origin: 'SBP', destination: 'SFO', departureTime: '2026-07-10T13:00:00Z', arrivalTime: '2026-07-10T14:00:00Z', duration: '1h', aircraft: 'E75', status: 'Scheduled', source: 'mock-a', sourceCheckedAt: '2026-07-09T12:00:00Z' },
  { carrier: 'United', flightNumber: 'UA100', origin: 'SBP', destination: 'SFO', departureTime: '2026-07-10T13:00:00Z', arrivalTime: '2026-07-10T14:00:00Z', duration: '1h', aircraft: 'E75', status: 'Scheduled', source: 'mock-b', sourceCheckedAt: '2026-07-09T12:01:00Z' },
  { carrier: 'ANA', flightNumber: 'NH7', origin: 'SFO', destination: 'HND', departureTime: '2026-07-10T16:00:00Z', arrivalTime: '2026-07-11T04:00:00Z', duration: '12h', aircraft: '789', status: 'Scheduled', source: 'mock-a', sourceCheckedAt: '2026-07-09T12:00:00Z', marketingFlightNumbers: ['UA7914'] }
]

function registry() {
  return createDefaultScheduleProviderRegistry([
    createMockScheduleProvider([rows[0], rows[2]], { key: 'mock-a', priority: 10 }),
    createMockScheduleProvider([rows[1]], { key: 'mock-b', priority: 20 })
  ])
}

function params() {
  return new URLSearchParams({ origin: 'SBP', destination: 'HND', date: '2026-07-10', carrier: 'all', maxLegs: '3' })
}

function comparableDiagnostics(response: Awaited<ReturnType<typeof runCanonicalItineraryEndpoint>>) {
  return {
    ...response.debug,
    endpointConsistency: {
      ...response.debug.endpointConsistency,
      endpoint: '<endpoint>'
    },
    routingValidation: {
      ...response.debug.routingValidation,
      searchDurationMs: '<duration>'
    },
    providerDiagnostics: (response.debug.providerDiagnostics as Array<Record<string, unknown>>).map((diagnostic) => ({ ...diagnostic, queryTimeMs: '<duration>' })),
    providerRegistry: {
      ...response.debug.providerRegistry,
      diagnostics: response.debug.providerRegistry.diagnostics.map((diagnostic) => ({ ...diagnostic, queryTimeMs: '<duration>' })),
      health: response.debug.providerRegistry.health.map((health) => ({ ...health, responseTimeMs: '<duration>' })),
      providerMetrics: response.debug.providerRegistry.providerMetrics.map((metrics) => ({ ...metrics, responseLatencyMs: '<duration>' }))
    }
  }
}

describe('canonical itinerary endpoint pipeline', () => {
  it('audits itinerary-returning API endpoints and requires the registry as the provider entry point', () => {
    const audit = canonicalItineraryEndpointAudit()
    assert.deepEqual(audit.itineraryReturningEndpoints, ['GET /api/itinerary/search'])
    assert.equal(audit.providerEntryPoint, 'lib/scheduleProviderRegistry.createDefaultScheduleProviderRegistry')
    assert.equal(audit.directProviderAccessAllowedInEndpoints, false)
  })

  it('returns identical itineraries, diagnostics, provider usage, and duplicate merging through endpoint aliases', async () => {
    const first = await runCanonicalItineraryEndpoint({ endpoint: 'GET /api/itinerary/search', registry: registry(), searchParams: params() })
    const second = await runCanonicalItineraryEndpoint({ endpoint: 'GET /api/itinerary/preview', registry: registry(), searchParams: params() })

    assert.deepEqual(first.itineraries.map((itinerary) => itinerary.route), ['SBP → SFO → HND'])
    assert.deepEqual(first.itineraries, second.itineraries)
    assert.deepEqual(first.debug.providerRegistry.providersUsed, ['mock-a', 'mock-b'])
    assert.deepEqual(first.debug.providerRegistry.providersUsed, second.debug.providerRegistry.providersUsed)
    assert.equal(first.debug.endpointConsistency.routingEngineVersion, routingEngineVersion)
    assert.equal(first.debug.endpointConsistency.graphSize.flightLegs, 2)
    assert.equal(first.debug.endpointConsistency.itineraryCount, 1)
    assert.equal(first.debug.coverageTrust.resolvedOrigin, 'SBP')
    assert.equal(first.debug.coverageTrust.resolvedDestination, 'HND')
    assert.equal(first.debug.coverageTrust.uniqueFlightsAfterNormalization, 2)
    assert.equal(first.debug.coverageTrust.itinerariesAssembled, 1)
    assert.equal(first.debug.coverageTrust.resultSetCompleteness, 'partial')
    assert.equal(first.coverageStatus, 'Partial schedule coverage')
    assert.equal(first.debug.duplicateMerging.duplicateRowsMerged, 1)
    assert.deepEqual(first.debug.duplicateMerging, second.debug.duplicateMerging)
    assert.deepEqual(comparableDiagnostics(first), comparableDiagnostics(second))
  })

  it('keeps detailed diagnostics out of normal production responses unless debug mode is requested', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const normal = await runCanonicalItineraryEndpoint({ endpoint: 'GET /api/itinerary/search', registry: registry(), searchParams: params() })
      const debugParams = params()
      debugParams.set('debug', '1')
      const debug = await runCanonicalItineraryEndpoint({ endpoint: 'GET /api/itinerary/search', registry: registry(), searchParams: debugParams })

      assert.equal(normal.debug, undefined)
      assert.ok(normal.coverageStatus)
      assert.ok(debug.debug?.coverageTrust.providersQueried.includes('mock-a'))
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })
})

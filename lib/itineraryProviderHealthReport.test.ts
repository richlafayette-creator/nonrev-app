import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildItineraryProviderHealthMatrix, missingItineraryProviderEnvNames } from './itineraryProviderHealthReport.ts'
import type { UnifiedScheduleSearchResult } from './scheduleProviderRegistry'

function searchResult(overrides: Partial<UnifiedScheduleSearchResult> = {}): UnifiedScheduleSearchResult {
  return {
    rows: [],
    providerResults: [],
    providerHealth: [],
    providerCoverage: [],
    providerDiagnostics: [],
    comparison: { flightsUniqueToEachProvider: {}, missingAirports: {}, missingAirlines: {}, overlapPercentage: 0 },
    coverageReport: { byCountry: {}, byAirport: {}, byAirline: {}, knownDataGaps: [] },
    marketCoverage: { providerContributionPercent: {}, providerCoveragePercent: {}, airportsCovered: [], carriersCovered: [], scheduleFreshness: {}, missingCoverage: [], missingAirports: [], missingAirlines: [], missingDates: [], missingMarkets: [], supplementRequests: [], supplementReason: '', normalizedSchedulesCached: 0 },
    providerMetrics: [],
    providerInfrastructure: [],
    warnings: [],
    detail: '',
    ...overrides
  }
}

describe('itinerary provider health report', () => {
  it('reports missing credential names without exposing values', () => {
    assert.deepEqual(missingItineraryProviderEnvNames({}), [
      'FLIGHTAWARE_API_KEY',
      'AVIATIONSTACK_API_KEY',
      'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ])

    const matrix = buildItineraryProviderHealthMatrix({ env: {} })
    assert.equal(matrix.find((row) => row.provider === 'flightaware')?.credentialPresent, 'no')
    assert.equal(matrix.find((row) => row.provider === 'supabase-cache')?.productionReadiness, 'blocked by missing credential')
  })

  it('marks rate-limited providers separately from zero-row providers', () => {
    const matrix = buildItineraryProviderHealthMatrix({
      env: { FLIGHTAWARE_API_KEY: 'secret', AVIATIONSTACK_API_KEY: 'secret', NEXT_PUBLIC_SUPABASE_URL: 'url', SUPABASE_SERVICE_ROLE_KEY: 'secret' },
      search: searchResult({
        providerResults: [
          {
            provider: 'flightaware',
            rows: [],
            requestCount: 1,
            status: 'warning',
            warning: 'FlightAware rate limit reached; skipped this provider safely',
            health: { provider: 'flightaware', status: 'warning', responseTimeMs: 4, coverage: { flightCount: 0, airportCount: 0, airlineCount: 0, routeCount: 0 }, freshness: {}, errors: [] },
            coverage: { provider: 'flightaware', status: 'empty', airports: [], carriers: [], flightCount: 0, routeCount: 0 },
            capabilities: { futureSchedules: true, currentFlightStatus: true, routeSearch: true, flightNumberEnrichment: true },
            diagnostics: { providerUsed: 'flightaware', queryTimeMs: 4, cacheStatus: 'bypass', airportsSearched: ['SBP', 'LAX'], carriersSearched: [], itineraryCount: 0, providerFailures: [] }
          },
          {
            provider: 'aviationstack',
            rows: [],
            requestCount: 1,
            status: 'skipped',
            detail: 'Aviationstack returned no usable schedule rows.',
            health: { provider: 'aviationstack', status: 'skipped', responseTimeMs: 4, coverage: { flightCount: 0, airportCount: 0, airlineCount: 0, routeCount: 0 }, freshness: {}, errors: [] },
            coverage: { provider: 'aviationstack', status: 'empty', airports: [], carriers: [], flightCount: 0, routeCount: 0 },
            capabilities: { futureSchedules: true, currentFlightStatus: true, routeSearch: true, flightNumberEnrichment: false },
            diagnostics: { providerUsed: 'aviationstack', queryTimeMs: 4, cacheStatus: 'bypass', airportsSearched: ['SBP', 'LAX'], carriersSearched: [], itineraryCount: 0, providerFailures: [] }
          }
        ]
      })
    })

    assert.equal(matrix.find((row) => row.provider === 'flightaware')?.quotaRateLimitStatus, 'rate-limited or quota-blocked')
    assert.equal(matrix.find((row) => row.provider === 'aviationstack')?.rowsReturned, 0)
    assert.equal(matrix.find((row) => row.provider === 'aviationstack')?.quotaRateLimitStatus, 'not reported')
  })

  it('marks valid provider rows as production-ready for verified schedules', () => {
    const matrix = buildItineraryProviderHealthMatrix({
      env: { FLIGHTAWARE_API_KEY: 'secret' },
      search: searchResult({
        marketCoverage: { ...searchResult().marketCoverage, scheduleFreshness: { flightaware: { newestSourceCheckedAt: '2026-07-10T01:00:00.000Z' } } },
        providerResults: [
          {
            provider: 'flightaware',
            rows: [{ source_checked_at: '2026-07-10T01:00:00.000Z' } as never],
            requestCount: 1,
            status: 'success',
            detail: '1 FlightAware live schedule result returned.',
            health: { provider: 'flightaware', status: 'success', responseTimeMs: 4, coverage: { flightCount: 1, airportCount: 2, airlineCount: 1, routeCount: 1 }, freshness: { newestSourceCheckedAt: '2026-07-10T01:00:00.000Z' }, errors: [] },
            coverage: { provider: 'flightaware', status: 'covered', airports: ['SBP', 'LAX'], carriers: ['UA'], flightCount: 1, routeCount: 1 },
            capabilities: { futureSchedules: true, currentFlightStatus: true, routeSearch: true, flightNumberEnrichment: true },
            diagnostics: { providerUsed: 'flightaware', queryTimeMs: 4, cacheStatus: 'bypass', airportsSearched: ['SBP', 'LAX'], carriersSearched: [], itineraryCount: 1, providerFailures: [] }
          }
        ]
      })
    })

    const flightAware = matrix.find((row) => row.provider === 'flightaware')
    assert.equal(flightAware?.requestAttempted, 'yes')
    assert.equal(flightAware?.rowsReturned, 1)
    assert.equal(flightAware?.freshness, '2026-07-10T01:00:00.000Z')
    assert.equal(flightAware?.productionReadiness, 'ready for verified schedules')
  })
})


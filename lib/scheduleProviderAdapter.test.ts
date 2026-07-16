import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { defaultScheduleProviderCapabilities, defaultScheduleProviderCoverage, defaultScheduleProviderHealth, providerScheduleRowFromResult, providerScheduleRowsFromResults, quarantineMalformedScheduleResults, runScheduleProviderAdapter } from './scheduleProviderAdapter.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildScheduleProviderCoverageReport, compareScheduleProviders, mergeDuplicateScheduleRows } from './scheduleProviderDiagnostics.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createDefaultScheduleProviderRegistry, createMockScheduleProvider, createSupabaseCacheScheduleProvider } from './scheduleProviderRegistry.ts'
import type { NormalizedScheduleResult } from './liveScheduleProviders'

const normalized: NormalizedScheduleResult = {
  carrier: 'United',
  flightNumber: 'UA100',
  origin: 'SBP',
  destination: 'LAX',
  departureTime: '2026-07-04T12:00:00Z',
  arrivalTime: '2026-07-04T13:00:00Z',
  aircraft: 'E75',
  status: 'Scheduled',
  source: 'flightaware',
  sourceCheckedAt: '2026-07-04T11:00:00Z',
  operatingCarrier: 'UA',
  operatingFlightNumber: 'UA100',
  marketingFlightNumbers: ['NH7000'],
  duplicateCount: 2
}

function canonicalTestProvider(key: string, results: NormalizedScheduleResult[], priority = 1) {
  return {
    key,
    label: key,
    priority,
    async searchSchedules() {
      return { results, requestCount: 1, status: results.length ? 'success' as const : 'skipped' as const }
    },
    providerCoverage: (request, rows, status, warning) => defaultScheduleProviderCoverage(key, request, rows, status, warning),
    health: (rows, status, responseTimeMs, errors) => defaultScheduleProviderHealth(key, rows, status, responseTimeMs, errors),
    capabilities: () => defaultScheduleProviderCapabilities({ routeSearch: true })
  }
}

describe('schedule provider adapter', () => {
  it('converts normalized provider schedules into provider-agnostic flight rows', () => {
    const row = providerScheduleRowFromResult(normalized)

    assert.equal(row.source_provider, 'flightaware')
    assert.equal(row.schedule_source, 'flightaware')
    assert.deepEqual(row.schedule_sources, ['flightaware'])
    assert.deepEqual(row.providers, ['flightaware'])
    assert.equal(row.flight_number, 'UA100')
    assert.equal(row.airline, 'United')
    assert.equal(row.origin, 'SBP')
    assert.equal(row.destination, 'LAX')
    assert.equal(row.departure, '2026-07-04T12:00:00Z')
    assert.equal(row.arrival, '2026-07-04T13:00:00Z')
    assert.equal(row.operating_carrier, 'UA')
    assert.equal(row.marketing_carrier, 'UA')
    assert.deepEqual(row.marketing_flight_numbers, ['NH7000'])
    assert.deepEqual(row.codeshare_relationships, ['NH7000 marketed on UA100'])
    assert.equal(row.duplicate_count, 2)
    assert.equal(row.marketing_airline, 'United')
    assert.equal(row.operating_airline, 'UA')
    assert.equal(row.marketing_flight_number, 'UA100')
    assert.equal(row.provider_record_id, 'flightaware-UA100-SBP-LAX-2026-07-04T12:00:00Z')
    assert.equal(row.data_status, 'live')
    assert.equal(row.coverage_status, 'covered')
    assert.equal(row.missing_data_reason, undefined)
    assert.ok(row.confidence >= 80)
  })

  it('keeps provider-specific response shapes out of downstream rows', () => {
    const row = providerScheduleRowFromResult({
      ...normalized,
      source: 'aviationstack',
      status: 'Cancelled',
      // Simulates an adapter boundary: unknown provider-native fields are not carried forward.
      nativePayload: { flight: { iata: 'UA100' } }
    } as NormalizedScheduleResult & { nativePayload: unknown })

    assert.equal('nativePayload' in row, false)
    assert.equal(row.source_provider, 'aviationstack')
    assert.equal(row.score, 35)
  })

  it('maps result arrays with one shared checked-at fallback', () => {
    const row = providerScheduleRowsFromResults([{ ...normalized, sourceCheckedAt: undefined }], '2026-07-04T11:30:00Z')[0]

    assert.equal(row.source_checked_at, '2026-07-04T11:30:00Z')
    assert.equal(row.operating_carrier, 'UA')
  })

  it('quarantines malformed provider records before they can appear as complete live flights', async () => {
    const malformed = { ...normalized, flightNumber: 'Flight TBD', departureTime: 'Pending' }
    const quarantine = quarantineMalformedScheduleResults([normalized, malformed])

    assert.equal(quarantine.valid.length, 1)
    assert.equal(quarantine.quarantined.length, 1)
    assert.match(quarantine.quarantined[0].reason, /flight number/)
    assert.equal(providerScheduleRowsFromResults([malformed]).length, 0)

    const result = await runScheduleProviderAdapter(canonicalTestProvider('malformed-provider', [normalized, malformed]), { origin: 'SBP', destination: 'LAX' })
    assert.equal(result.rows.length, 1)
    assert.match(result.detail || '', /malformed provider row/)
    assert.ok(result.diagnostics.providerFailures.some((failure) => /quarantined/.test(failure)))
  })

  it('runs pluggable provider adapters through the full canonical interface', async () => {
    const result = await runScheduleProviderAdapter(canonicalTestProvider('mock-provider', [normalized]), { origin: 'SBP', destination: 'LAX' }, '2026-07-04T11:30:00Z')

    assert.equal(result.provider, 'mock-provider')
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].source_provider, 'flightaware')
    assert.equal(result.status, 'success')
    assert.equal(result.health.coverage.flightCount, 1)
    assert.equal(result.health.coverage.airportCount, 2)
    assert.equal(result.health.errors.length, 0)
    assert.equal(result.coverage.status, 'covered')
    assert.equal(result.capabilities.routeSearch, true)
    assert.equal(result.diagnostics.providerUsed, 'mock-provider')
  })

  it('merges duplicate flights across providers and reports comparison/coverage diagnostics', async () => {
    const flightAware = await runScheduleProviderAdapter(canonicalTestProvider('flightaware', [normalized]), { origin: 'SBP', destination: 'LAX' }, '2026-07-04T11:30:00Z')
    const aviationstack = await runScheduleProviderAdapter(canonicalTestProvider('aviationstack', [{ ...normalized, source: 'aviationstack', aircraft: 'E75', marketingFlightNumbers: ['UA100'] }], 2), { origin: 'SBP', destination: 'LAX' }, '2026-07-04T11:31:00Z')
    const merged = mergeDuplicateScheduleRows([...flightAware.rows, ...aviationstack.rows])
    const comparison = compareScheduleProviders([flightAware, aviationstack])
    const coverage = buildScheduleProviderCoverageReport(merged, [flightAware, aviationstack])

    assert.equal(merged.length, 1)
    assert.deepEqual(merged[0].schedule_sources.sort(), ['aviationstack', 'flightaware'])
    assert.deepEqual(merged[0].providers.sort(), ['aviationstack', 'flightaware'])
    assert.equal(merged[0].duplicate_count, 5)
    assert.equal(comparison.overlapPercentage, 100)
    assert.equal(coverage.byCountry.US.flights, 1)
    assert.ok(coverage.byAirport.SBP.providers.includes('flightaware'))
    assert.ok(coverage.byAirline.United.airports.includes('LAX'))
  })

  it('falls back to lower-priority providers when a higher-priority provider returns no rows', async () => {
    const registry = createDefaultScheduleProviderRegistry([
      createMockScheduleProvider([], { key: 'primary-empty', priority: 1, status: 'skipped' }),
      createMockScheduleProvider([{ ...normalized, source: 'fallback-provider' }], { key: 'fallback-provider', priority: 2 })
    ])

    const result = await registry.searchSchedules({ origin: 'SBP', destination: 'LAX', carrier: 'UA' })

    assert.deepEqual(registry.providerKeys(), ['primary-empty', 'fallback-provider'])
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].source_provider, 'fallback-provider')
    assert.equal(result.providerResults[0].status, 'skipped')
    assert.equal(result.providerResults[1].status, 'success')
  })

  it('records provider failures without blocking successful fallback providers', async () => {
    const registry = createDefaultScheduleProviderRegistry([
      createMockScheduleProvider([], { key: 'broken-provider', priority: 1, fail: true, warning: 'upstream exploded' }),
      createMockScheduleProvider([{ ...normalized, source: 'healthy-provider' }], { key: 'healthy-provider', priority: 2 })
    ])

    const result = await registry.searchSchedules({ origin: 'SBP', destination: 'LAX' })

    assert.equal(result.rows.length, 1)
    assert.equal(result.providerResults.find((item) => item.provider === 'broken-provider')?.status, 'error')
    assert.deepEqual(result.providerDiagnostics.find((item) => item.providerUsed === 'broken-provider')?.providerFailures, ['upstream exploded'])
    assert.ok(result.warnings.includes('upstream exploded'))
  })

  it('merges duplicate itineraries from multiple providers inside the registry', async () => {
    const registry = createDefaultScheduleProviderRegistry([
      createMockScheduleProvider([normalized], { key: 'flightaware', priority: 1 }),
      createMockScheduleProvider([{ ...normalized, source: 'aviationstack', marketingFlightNumbers: ['UA100'] }], { key: 'aviationstack', priority: 2 })
    ])

    const result = await registry.searchSchedules({ origin: 'SBP', destination: 'LAX' })

    assert.equal(result.rows.length, 1)
    assert.deepEqual(result.rows[0].schedule_sources.sort(), ['aviationstack', 'flightaware'])
    assert.equal(result.rows[0].duplicate_count, 5)
  })

  it('honors provider priority order before running the canonical search', () => {
    const registry = createDefaultScheduleProviderRegistry([
      createMockScheduleProvider([], { key: 'third', priority: 30 }),
      createMockScheduleProvider([], { key: 'first', priority: 10 }),
      createMockScheduleProvider([], { key: 'second', priority: 20 })
    ])

    assert.deepEqual(registry.providerKeys(), ['first', 'second', 'third'])
  })

  it('does not register placeholder providers in the default live search registry', () => {
    const registry = createDefaultScheduleProviderRegistry()

    assert.deepEqual(registry.providerKeys(), ['flightaware', 'aviationstack', 'supabase-cache'])
  })

  it('returns canonical diagnostics for empty provider responses', async () => {
    const registry = createDefaultScheduleProviderRegistry([
      createMockScheduleProvider([], { key: 'empty-provider', priority: 1, status: 'skipped', detail: 'No rows.' })
    ])

    const result = await registry.searchSchedules({ origin: 'SBP', destination: 'LAX', carrier: 'UA' })

    assert.equal(result.rows.length, 0)
    assert.equal(result.providerCoverage[0].status, 'empty')
    assert.equal(result.providerDiagnostics[0].itineraryCount, 0)
    assert.ok(result.providerDiagnostics[0].airportsSearched.includes('SBP'))
    assert.ok(result.providerDiagnostics[0].airportsSearched.includes('LAX'))
    assert.deepEqual(result.providerDiagnostics[0].carriersSearched, ['UA'])
    assert.ok(result.marketCoverage.supplementRequests.some((request) => request.scope === 'origin-departures'))
    assert.ok(result.marketCoverage.missingCoverage.some((message) => message.includes('empty-provider')))
    assert.ok(result.marketCoverage.missingAirports.includes('SBP'))
    assert.ok(result.marketCoverage.missingAirports.includes('LAX'))
    assert.ok(result.marketCoverage.missingAirlines.includes('UA'))
    assert.ok(result.marketCoverage.missingMarkets.includes('SBP-LAX'))
  })

  it('reports Supabase cache local fallback as degraded when the table is unreachable', async () => {
    const cacheProvider = createSupabaseCacheScheduleProvider({
      async storeNormalizedResults() {
        return { enabled: true, attempted: true, stored: 0, status: 'local-fallback', detail: 'not used' }
      },
      async findCachedResults() {
        return {
          table: 'provider_itinerary_results',
          storageMode: 'local-fallback',
          status: 'hit',
          records: [{
            source_provider: 'flightaware',
            source_checked_at: '2026-07-04T11:00:00Z',
            cached_at: '2026-07-04T11:01:00Z',
            search_timestamp: '2026-07-04T11:01:00Z',
            day_of_week: 6,
            month: 7,
            origin: 'SBP',
            destination: 'LAX',
            departure_time: '2026-07-04T12:00:00Z',
            arrival_time: '2026-07-04T13:00:00Z',
            flight_number: 'UA100',
            carrier: 'United',
            airline: 'United',
            aircraft: 'E75',
            status: 'Scheduled',
            provider_request_hash: 'hash',
            provider_request_scope: 'scope',
            result_fingerprint: 'fingerprint',
            provenance_version: 'provider-result-provenance-v1'
          }],
          detail: 'Supabase cache lookup failed (404); using 1 local fallback result.',
          freshness: 'current',
          staleRecordCount: 0,
          httpStatus: 404,
          quotaHeaders: {},
          authenticationFailure: false
        }
      }
    })

    const result = await runScheduleProviderAdapter(cacheProvider, { origin: 'SBP', destination: 'LAX', date: '2026-07-04' })

    assert.equal(result.status, 'warning')
    assert.equal(result.rows.length, 1)
    assert.match(result.warning || '', /Supabase cache lookup failed/)
    assert.equal(result.providerCallLogs?.[0]?.httpStatus, 404)
    assert.equal(result.providerCallLogs?.[0]?.cacheStatus, 'hit')
  })

  it('supplements incomplete market coverage and exposes contribution, coverage, freshness, airports, carriers, and cache diagnostics', async () => {
    const primaryOnlyExact = canonicalTestProvider('primary-exact', [{ ...normalized, source: 'primary-exact', origin: 'SBP', destination: 'SFO' }], 1)
    const supplementalHubProvider = {
      ...canonicalTestProvider('supplemental-hub', [], 2),
      async searchSchedules(request) {
        if (request.origin === 'SFO' && request.destination === 'HND') {
          return {
            results: [{ ...normalized, source: 'supplemental-hub', carrier: 'ANA', flightNumber: 'NH7', origin: 'SFO', destination: 'HND', departureTime: '2026-07-04T16:00:00Z', arrivalTime: '2026-07-05T04:00:00Z', sourceCheckedAt: '2026-07-04T11:10:00Z' }],
            requestCount: 1,
            status: 'success' as const,
            detail: 'Hub supplement returned.'
          }
        }
        return { results: [], requestCount: 1, status: 'skipped' as const, detail: 'No rows for this market.' }
      }
    }
    const registry = createDefaultScheduleProviderRegistry([primaryOnlyExact, supplementalHubProvider])

    const result = await registry.searchSchedules({ origin: 'SBP', destination: 'HND', date: '2026-07-04', carrier: 'all' })

    assert.equal(result.rows.length, 2)
    assert.ok(result.rows.some((row) => row.origin === 'SBP' && row.destination === 'SFO'))
    assert.ok(result.rows.some((row) => row.origin === 'SFO' && row.destination === 'HND'))
    assert.ok(result.marketCoverage.supplementRequests.some((request) => request.scope === 'origin-to-hub:SFO'))
    assert.ok(result.marketCoverage.supplementRequests.some((request) => request.scope === 'hub-to-destination:SFO'))
    assert.ok(result.marketCoverage.providerContributionPercent['primary-exact'] > 0)
    assert.ok(result.marketCoverage.providerCoveragePercent['supplemental-hub'] > 0)
    assert.deepEqual(result.marketCoverage.airportsCovered, ['HND', 'SBP', 'SFO'])
    assert.ok(result.marketCoverage.carriersCovered.includes('ANA'))
    assert.equal(result.marketCoverage.scheduleFreshness['supplemental-hub'].newestSourceCheckedAt, '2026-07-04T11:10:00Z')
    assert.ok(result.marketCoverage.missingAirports.includes('LAX'))
    assert.deepEqual(result.marketCoverage.missingDates, [])
    assert.ok(result.marketCoverage.missingMarkets.includes('SBP-HND'))
    assert.ok(result.marketCoverage.missingMarkets.includes('LAX-HND'))
    assert.ok(result.marketCoverage.missingCoverage.some((message) => message.includes('market:SBP-HND')))
    assert.equal(result.marketCoverage.normalizedSchedulesCached, 2)
  })
})

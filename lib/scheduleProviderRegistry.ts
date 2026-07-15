import { createAmadeusScheduleProvider, createAviationstackScheduleProvider, createCiriumOagScheduleProvider, createFlightAwareScheduleProvider, type LiveScheduleProvider, type NormalizedScheduleResult } from './liveScheduleProviders'
import { createProviderResultRepository, type ProviderResultRepository } from './providerResultRepository'
import {
  defaultScheduleProviderCapabilities,
  defaultScheduleProviderCoverage,
  defaultScheduleProviderHealth,
  runScheduleProviderAdapter,
  type ProviderAgnosticScheduleRow,
  type ScheduleProviderAdapter,
  type ScheduleProviderAdapterResult,
  type ScheduleProviderCapabilities,
  type ScheduleProviderCoverage,
  type ScheduleProviderDiagnostic,
  type ScheduleProviderHealth,
  type ScheduleProviderSearchRequest,
  type ScheduleProviderSearchResponse
} from './scheduleProviderAdapter'
import { buildScheduleProviderCoverageReport, compareScheduleProviders, mergeDuplicateScheduleRows, type ScheduleProviderComparisonDiagnostics, type ScheduleProviderCoverageReport } from './scheduleProviderDiagnostics'
import { providerInfrastructureSnapshot, type ProviderInfrastructureSnapshot } from './providerInfrastructure'

export type UnifiedScheduleProvider = ScheduleProviderAdapter

export type UnifiedScheduleSearchResult = {
  rows: ProviderAgnosticScheduleRow[]
  providerResults: ScheduleProviderAdapterResult[]
  providerHealth: ScheduleProviderHealth[]
  providerCoverage: ScheduleProviderCoverage[]
  providerDiagnostics: ScheduleProviderDiagnostic[]
  comparison: ScheduleProviderComparisonDiagnostics
  coverageReport: ScheduleProviderCoverageReport
  marketCoverage: MarketCoverageDiagnostics
  providerMetrics: ProviderMetricsDiagnostics[]
  providerInfrastructure: ProviderInfrastructureSnapshot[]
  warnings: string[]
  detail: string
}

export type ProviderMetricsDiagnostics = {
  provider: string
  coverage: ScheduleProviderHealth['coverage']
  freshness: ScheduleProviderHealth['freshness']
  responseLatencyMs: number
  failures: string[]
  cacheHitRate: number
}

export type MarketCoverageDiagnostics = {
  providerContributionPercent: Record<string, number>
  providerCoveragePercent: Record<string, number>
  airportsCovered: string[]
  carriersCovered: string[]
  scheduleFreshness: Record<string, { newestSourceCheckedAt?: string; oldestSourceCheckedAt?: string; freshnessHours?: number }>
  missingCoverage: string[]
  missingAirports: string[]
  missingAirlines: string[]
  missingDates: string[]
  missingMarkets: string[]
  supplementRequests: Array<{ scope: string; origin?: string; destination?: string; carrier?: string }>
  supplementReason: string
  normalizedSchedulesCached: number
}

export type ScheduleProviderRegistry = {
  providers: UnifiedScheduleProvider[]
  searchSchedules: (request: ScheduleProviderSearchRequest) => Promise<UnifiedScheduleSearchResult>
  providerKeys: () => string[]
}

function uniqueMessages(messages: Array<string | undefined>) {
  return [...new Set(messages.filter((message): message is string => Boolean(message?.trim())))]
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

const marketExpansionHubs = ['SFO', 'LAX', 'SEA', 'DEN', 'ORD', 'DFW', 'IAH', 'EWR', 'JFK', 'ATL', 'HND', 'NRT', 'HNL', 'OGG', 'SAN', 'PDX', 'PHX']

const regionalAirportNeighbors: Record<string, string[]> = {
  SBP: ['SFO', 'LAX', 'SAN', 'SEA', 'PDX'],
  SAN: ['LAX', 'SFO', 'SEA', 'PHX', 'DEN'],
  OGG: ['HNL', 'LAX', 'SFO', 'SEA'],
  PDX: ['SEA', 'SFO', 'LAX', 'DEN']
}

const secondaryInternationalNeighbors: Record<string, string[]> = {
  HND: ['NRT', 'SFO', 'LAX', 'SEA', 'HNL'],
  NRT: ['HND', 'SFO', 'LAX', 'SEA', 'HNL'],
  HNL: ['OGG', 'SFO', 'LAX', 'SEA', 'HND', 'NRT']
}

function marketHubsFor(request: ScheduleProviderSearchRequest) {
  return uniqueStrings([
    ...(request.origin ? regionalAirportNeighbors[request.origin] || [] : []),
    ...(request.destination ? regionalAirportNeighbors[request.destination] || [] : []),
    ...(request.origin ? secondaryInternationalNeighbors[request.origin] || [] : []),
    ...(request.destination ? secondaryInternationalNeighbors[request.destination] || [] : []),
    ...marketExpansionHubs
  ]).filter((airport) => airport !== request.origin && airport !== request.destination).slice(0, 2)
}

function supplementalSearchRequests(request: ScheduleProviderSearchRequest) {
  if (!request.origin || !request.destination) return [{ scope: 'requested-market', request }]
  const base = { date: request.date, carrier: request.carrier, maxResults: request.maxResults }
  const requests = [
    { scope: 'requested-market', request },
    { scope: 'origin-departures', request: { ...base, origin: request.origin } },
    { scope: 'destination-arrivals', request: { ...base, destination: request.destination } },
    ...marketHubsFor(request).flatMap((hub) => [
      { scope: `origin-to-hub:${hub}`, request: { ...base, origin: request.origin, destination: hub } },
      { scope: `hub-to-destination:${hub}`, request: { ...base, origin: hub, destination: request.destination } }
    ])
  ]
  const deduped = new Map<string, { scope: string; request: ScheduleProviderSearchRequest }>()
  requests.forEach((entry) => {
    const key = [entry.request.origin || '*', entry.request.destination || '*', entry.request.date || '*', entry.request.carrier || '*'].join('|')
    if (!deduped.has(key)) deduped.set(key, entry)
  })
  return [...deduped.values()]
}

function rowToNormalizedResult(row: ProviderAgnosticScheduleRow): NormalizedScheduleResult {
  return {
    carrier: row.carrier || row.airline,
    flightNumber: row.flight_number,
    origin: row.origin,
    destination: row.destination,
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    duration: row.duration,
    aircraft: row.aircraft,
    status: row.status,
    source: row.source_provider,
    sourceCheckedAt: row.source_checked_at,
    operatingCarrier: row.operating_carrier,
    operatingFlightNumber: row.operating_flight_number,
    marketingFlightNumbers: row.marketing_flight_numbers,
    duplicateCount: row.duplicate_count
  }
}

function providerRowMergeKey(row: ProviderAgnosticScheduleRow) {
  return [row.operating_flight_number || row.flight_number, row.origin, row.destination, row.departure_time, row.arrival_time].join('|')
}

function dedupeRowsFromSupplementalRequests(rows: ProviderAgnosticScheduleRow[]) {
  const deduped = new Map<string, ProviderAgnosticScheduleRow>()
  rows.forEach((row) => {
    const key = providerRowMergeKey(row)
    if (!deduped.has(key)) deduped.set(key, row)
  })
  return [...deduped.values()]
}

function aggregateProviderResults(results: ScheduleProviderAdapterResult[]): ScheduleProviderAdapterResult[] {
  const grouped = new Map<string, ScheduleProviderAdapterResult[]>()
  results.forEach((result) => grouped.set(result.provider, [...(grouped.get(result.provider) || []), result]))
  return [...grouped.entries()].map(([provider, items]) => {
    const first = items[0]
    const rows = dedupeRowsFromSupplementalRequests(items.flatMap((item) => item.rows))
    const warnings = uniqueMessages(items.map((item) => item.warning))
    const details = uniqueMessages(items.map((item) => item.detail))
    const status = items.some((item) => item.status === 'success') ? 'success'
      : items.some((item) => item.status === 'warning') ? 'warning'
      : items.some((item) => item.status === 'error') ? 'error'
      : 'skipped'
    const health = defaultScheduleProviderHealth(provider, rows, status, items.reduce((total, item) => total + item.health.responseTimeMs, 0), warnings)
    const coverage = defaultScheduleProviderCoverage(provider, undefined, rows, status, warnings.join(' · ') || undefined)
    const diagnostics: ScheduleProviderDiagnostic = {
      providerUsed: provider,
      queryTimeMs: items.reduce((total, item) => total + item.diagnostics.queryTimeMs, 0),
      cacheStatus: items.some((item) => item.diagnostics.cacheStatus === 'hit') ? 'hit' : items.some((item) => item.diagnostics.cacheStatus === 'unavailable') ? 'unavailable' : items.some((item) => item.diagnostics.cacheStatus === 'miss') ? 'miss' : 'bypass',
      airportsSearched: uniqueStrings(items.flatMap((item) => item.diagnostics.airportsSearched)),
      carriersSearched: uniqueStrings(items.flatMap((item) => item.diagnostics.carriersSearched)),
      itineraryCount: rows.length,
      providerFailures: uniqueMessages(items.flatMap((item) => item.diagnostics.providerFailures))
    }
    return {
      provider,
      rows,
      warning: warnings.join(' · ') || undefined,
      detail: details.join(' · ') || `${rows.length} normalized schedule rows returned across supplemented market searches.`,
      requestCount: items.reduce((total, item) => total + (item.requestCount || 0), 0),
      status,
      health,
      coverage,
      capabilities: first.capabilities,
      diagnostics
    }
  })
}

function freshnessHours(value?: string) {
  const parsed = Date.parse(value || '')
  if (!Number.isFinite(parsed)) return undefined
  return Math.round(((Date.now() - parsed) / 3600000) * 10) / 10
}

function buildMarketCoverageDiagnostics(rows: ProviderAgnosticScheduleRow[], providerResults: ScheduleProviderAdapterResult[], searchRequests: ReturnType<typeof supplementalSearchRequests>, normalizedSchedulesCached: number): MarketCoverageDiagnostics {
  const totalRows = rows.length || 1
  const airportsCovered = uniqueStrings(rows.flatMap((row) => [row.origin, row.destination])).sort()
  const carriersCovered = uniqueStrings(rows.map((row) => row.airline || row.carrier)).sort()
  const allAirports = uniqueStrings(providerResults.flatMap((result) => result.rows.flatMap((row) => [row.origin, row.destination]))).sort()
  const allCarriers = uniqueStrings(providerResults.flatMap((result) => result.rows.map((row) => row.airline || row.carrier))).sort()
  const providerContributionPercent = Object.fromEntries(providerResults.map((result) => [result.provider, Math.round((result.rows.length / totalRows) * 10000) / 100]))
  const providerCoveragePercent = Object.fromEntries(providerResults.map((result) => {
    const providerAirports = uniqueStrings(result.rows.flatMap((row) => [row.origin, row.destination]))
    const providerCarriers = uniqueStrings(result.rows.map((row) => row.airline || row.carrier))
    const airportCoverage = allAirports.length ? providerAirports.length / allAirports.length : result.rows.length ? 1 : 0
    const carrierCoverage = allCarriers.length ? providerCarriers.length / allCarriers.length : result.rows.length ? 1 : 0
    return [result.provider, Math.round(((airportCoverage + carrierCoverage) / 2) * 10000) / 100]
  }))
  const scheduleFreshness = Object.fromEntries(providerResults.map((result) => [result.provider, {
    newestSourceCheckedAt: result.health.freshness.newestSourceCheckedAt,
    oldestSourceCheckedAt: result.health.freshness.oldestSourceCheckedAt,
    freshnessHours: freshnessHours(result.health.freshness.newestSourceCheckedAt)
  }]))
  const requestedAirports = uniqueStrings(searchRequests.flatMap((entry) => [entry.request.origin, entry.request.destination])).sort()
  const requestedCarriers = uniqueStrings(searchRequests.map((entry) => entry.request.carrier === 'all' ? undefined : entry.request.carrier)).sort()
  const requestedDates = uniqueStrings(searchRequests.map((entry) => entry.request.date)).sort()
  const coveredDates = uniqueStrings(rows.map((row) => row.operating_date || row.departure_time?.slice(0, 10))).sort()
  const coveredMarkets = new Set(rows.map((row) => `${row.origin}-${row.destination}`))
  const requestedMarkets = uniqueStrings(searchRequests.map((entry) => entry.request.origin && entry.request.destination ? `${entry.request.origin}-${entry.request.destination}` : undefined)).sort()
  const missingAirports = requestedAirports.filter((airport) => !airportsCovered.includes(airport))
  const missingAirlines = requestedCarriers.filter((carrier) => !carriersCovered.some((covered) => covered.toLowerCase().includes(carrier.toLowerCase()) || carrier.toLowerCase().includes(covered.toLowerCase())))
  const missingDates = requestedDates.filter((date) => !coveredDates.includes(date))
  const missingMarkets = requestedMarkets.filter((market) => !coveredMarkets.has(market))
  const missingCoverage = uniqueMessages([
    ...providerResults.flatMap((result) => result.coverage.missingDataReason ? [`${result.provider}: ${result.coverage.missingDataReason}`] : []),
    ...providerResults.flatMap((result) => result.status !== 'success' ? [`${result.provider}: ${result.warning || result.detail || 'provider did not return successful schedule coverage'}`] : []),
    ...missingAirports.map((airport) => `airport:${airport}: no normalized schedule rows covered this requested or supplemental airport.`),
    ...missingAirlines.map((airline) => `airline:${airline}: no normalized schedule rows covered this requested carrier.`),
    ...missingDates.map((date) => `date:${date}: no normalized schedule rows covered this requested travel date.`),
    ...missingMarkets.map((market) => `market:${market}: no normalized schedule rows covered this requested or supplemental market.`)
  ])
  return {
    providerContributionPercent,
    providerCoveragePercent,
    airportsCovered,
    carriersCovered,
    scheduleFreshness,
    missingCoverage,
    missingAirports,
    missingAirlines,
    missingDates,
    missingMarkets,
    supplementRequests: searchRequests.map((entry) => ({ scope: entry.scope, origin: entry.request.origin, destination: entry.request.destination, carrier: entry.request.carrier })),
    supplementReason: searchRequests.length > 1 ? 'Requested market was supplemented with origin departures, destination arrivals, and hub markets to improve regional, secondary-international, mixed-carrier, overnight, and multi-alliance itinerary discovery.' : 'Only the requested market was searched because origin or destination was unavailable.',
    normalizedSchedulesCached
  }
}

function buildProviderMetrics(providerResults: ScheduleProviderAdapterResult[]): ProviderMetricsDiagnostics[] {
  return providerResults.map((result) => ({
    provider: result.provider,
    coverage: result.health.coverage,
    freshness: result.health.freshness,
    responseLatencyMs: result.health.responseTimeMs,
    failures: uniqueMessages([...(result.health.errors || []), ...(result.diagnostics.providerFailures || [])]),
    cacheHitRate: result.diagnostics.cacheStatus === 'hit' ? 100 : result.diagnostics.cacheStatus === 'miss' ? 0 : result.diagnostics.cacheStatus === 'unavailable' ? 0 : 0
  }))
}

function canonicalProviderAdapter(options: {
  key: string
  label: string
  priority: number
  capabilities: ScheduleProviderCapabilities
  searchSchedules: (request: ScheduleProviderSearchRequest) => Promise<ScheduleProviderSearchResponse>
  providerCoverage?: ScheduleProviderAdapter['providerCoverage']
  health?: ScheduleProviderAdapter['health']
}): UnifiedScheduleProvider {
  return {
    key: options.key,
    label: options.label,
    priority: options.priority,
    searchSchedules: options.searchSchedules,
    providerCoverage: options.providerCoverage || ((request, rows, status, warning) => defaultScheduleProviderCoverage(options.key, request, rows, status, warning)),
    health: options.health || ((rows, status, responseTimeMs, errors) => defaultScheduleProviderHealth(options.key, rows, status, responseTimeMs, errors)),
    capabilities: () => options.capabilities
  }
}

function liveProviderAdapter(provider: LiveScheduleProvider, priority: number): UnifiedScheduleProvider {
  return canonicalProviderAdapter({
    key: provider.key,
    label: provider.label,
    priority,
    capabilities: defaultScheduleProviderCapabilities(provider.capabilities),
    async searchSchedules(request) {
      const response = await provider.searchSchedules(request)
      return {
        results: response.results,
        warning: response.warning,
        detail: response.detail,
        requestCount: response.requestCount,
        status: response.status,
        cacheStatus: 'bypass'
      }
    }
  })
}

function cacheRecordToNormalizedResult(record: Record<string, unknown>): NormalizedScheduleResult {
  const source = String(record.source_provider || 'provider-cache')
  return {
    carrier: String(record.carrier || record.airline || 'Unknown Airline'),
    flightNumber: String(record.flight_number || 'Flight TBD'),
    origin: String(record.origin || 'TBD'),
    destination: String(record.destination || 'TBD'),
    departureTime: String(record.departure_time || 'Pending'),
    arrivalTime: String(record.arrival_time || 'Pending'),
    duration: String(record.duration || 'Not provided'),
    aircraft: String(record.aircraft || 'Unknown'),
    status: String(record.status || (record.cache_freshness === 'stale' ? 'Stale cached provider result' : 'Cached provider result')),
    source: source.startsWith('provider-cache') ? source : `provider-cache:${source}`,
    sourceCheckedAt: String(record.source_checked_at || record.cached_at || new Date().toISOString()),
    dataStatus: 'cached',
    dataFreshness: String(record.cache_freshness || 'current-cache'),
    retrievalTimestamp: String(record.cached_at || record.source_checked_at || new Date().toISOString()),
    operatingCarrier: String(record.operating_carrier || record.carrier || record.airline || 'Unknown Airline'),
    operatingFlightNumber: String(record.operating_flight_number || record.flight_number || 'Flight TBD'),
    marketingFlightNumbers: Array.isArray(record.marketing_flight_numbers) ? record.marketing_flight_numbers.map(String) : []
  }
}

export function createSupabaseCacheScheduleProvider(repository: ProviderResultRepository = createProviderResultRepository()): UnifiedScheduleProvider {
  return canonicalProviderAdapter({
    key: 'supabase-cache',
    label: 'Supabase provider cache',
    priority: 10,
    capabilities: defaultScheduleProviderCapabilities({ futureSchedules: true, routeSearch: true, cacheRead: true }),
    async searchSchedules(request) {
      const lookup = await repository.findCachedResults({
        origin: request.origin,
        destination: request.destination,
        date: request.date,
        carrier: request.carrier,
        maxAgeHours: 72,
        limit: request.maxResults || 500,
        allowStaleOnMiss: true
      })
      const results = lookup.records.map((record) => cacheRecordToNormalizedResult({ ...(record as unknown as Record<string, unknown>), cache_freshness: lookup.freshness }))
      return {
        results,
        detail: lookup.detail,
        requestCount: 1,
        status: lookup.status === 'hit' ? lookup.freshness === 'stale' ? 'warning' : 'success' : lookup.status === 'miss' ? 'skipped' : 'warning',
        warning: lookup.status === 'unavailable' || lookup.freshness === 'stale' ? lookup.detail : undefined,
        cacheStatus: lookup.status === 'hit' ? 'hit' : lookup.status === 'miss' ? 'miss' : 'unavailable'
      }
    }
  })
}

export function createMockScheduleProvider(results: NormalizedScheduleResult[] = [], options: Partial<{ key: string; label: string; priority: number; status: ScheduleProviderSearchResponse['status']; warning: string; detail: string; fail: boolean }> = {}): UnifiedScheduleProvider {
  const key = options.key || 'mock-provider'
  return canonicalProviderAdapter({
    key,
    label: options.label || 'Mock schedule provider',
    priority: options.priority ?? 100,
    capabilities: defaultScheduleProviderCapabilities({ futureSchedules: true, currentFlightStatus: true, routeSearch: true, flightNumberEnrichment: true, mockData: true }),
    async searchSchedules() {
      if (options.fail) throw new Error(options.warning || `${key} failed`)
      return {
        results,
        warning: options.warning,
        detail: options.detail || `${results.length} mock schedule row${results.length === 1 ? '' : 's'} returned.`,
        requestCount: 1,
        status: options.status || (results.length ? 'success' : 'skipped'),
        cacheStatus: 'bypass'
      }
    }
  })
}

export function createDefaultScheduleProviderRegistry(providers: UnifiedScheduleProvider[] = [
  createSupabaseCacheScheduleProvider(),
  liveProviderAdapter(createFlightAwareScheduleProvider(), 20),
  liveProviderAdapter(createAviationstackScheduleProvider(), 30)
]): ScheduleProviderRegistry {
  const sortedProviders = [...providers].sort((a, b) => a.priority - b.priority)
  return {
    providers: sortedProviders,
    providerKeys: () => sortedProviders.map((provider) => provider.key),
    async searchSchedules(request) {
      const searchRequests = supplementalSearchRequests(request)
      const providerResults = aggregateProviderResults(await Promise.all(sortedProviders.flatMap((provider) => searchRequests.map((entry) => runScheduleProviderAdapter(provider, entry.request)))))
      const rows = mergeDuplicateScheduleRows(providerResults.flatMap((result) => result.rows))
      const cacheResult = await createProviderResultRepository().storeNormalizedResults(rows.map(rowToNormalizedResult))
      const comparison = compareScheduleProviders(providerResults)
      const coverageReport = buildScheduleProviderCoverageReport(rows, providerResults)
      const marketCoverage = buildMarketCoverageDiagnostics(rows, providerResults, searchRequests, cacheResult.stored)
      const providerMetrics = buildProviderMetrics(providerResults)
      return {
        rows,
        providerResults,
        providerHealth: providerResults.map((result) => result.health),
        providerCoverage: providerResults.map((result) => result.coverage),
        providerDiagnostics: providerResults.map((result) => result.diagnostics),
        comparison,
        coverageReport,
        marketCoverage,
        providerMetrics,
        providerInfrastructure: providerInfrastructureSnapshot(),
        warnings: uniqueMessages(providerResults.map((result) => result.warning)),
        detail: `${providerResults.map((result) => `${result.provider}: ${result.detail || result.status}`).join(' · ')} · ${cacheResult.detail}`
      }
    }
  }
}

export function unifiedRowsToFlightRecords(rows: ProviderAgnosticScheduleRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    source_provider: row.source_provider,
    schedule_sources: row.schedule_sources,
    providers: row.providers?.length ? row.providers : row.schedule_sources,
    confidence: row.confidence,
    coverage_status: row.coverage_status,
    missing_data_reason: row.missing_data_reason
  }))
}

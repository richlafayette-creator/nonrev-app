import { createAviationstackScheduleProvider, createFlightAwareScheduleProvider, type LiveScheduleProvider, type NormalizedScheduleResult } from './liveScheduleProviders'
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

export type UnifiedScheduleProvider = ScheduleProviderAdapter

export type UnifiedScheduleSearchResult = {
  rows: ProviderAgnosticScheduleRow[]
  providerResults: ScheduleProviderAdapterResult[]
  providerHealth: ScheduleProviderHealth[]
  providerCoverage: ScheduleProviderCoverage[]
  providerDiagnostics: ScheduleProviderDiagnostic[]
  comparison: ScheduleProviderComparisonDiagnostics
  coverageReport: ScheduleProviderCoverageReport
  warnings: string[]
  detail: string
}

export type ScheduleProviderRegistry = {
  providers: UnifiedScheduleProvider[]
  searchSchedules: (request: ScheduleProviderSearchRequest) => Promise<UnifiedScheduleSearchResult>
  providerKeys: () => string[]
}

function uniqueMessages(messages: Array<string | undefined>) {
  return [...new Set(messages.filter((message): message is string => Boolean(message?.trim())))]
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
    status: String(record.status || 'Cached provider result'),
    source: source.startsWith('provider-cache') ? source : `provider-cache:${source}`,
    sourceCheckedAt: String(record.source_checked_at || record.cached_at || new Date().toISOString()),
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
        limit: request.maxResults || 500
      })
      const results = lookup.records.map((record) => cacheRecordToNormalizedResult(record as unknown as Record<string, unknown>))
      return {
        results,
        detail: lookup.detail,
        requestCount: 1,
        status: lookup.status === 'hit' ? 'success' : lookup.status === 'miss' ? 'skipped' : 'warning',
        warning: lookup.status === 'unavailable' ? lookup.detail : undefined,
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
      const providerResults = await Promise.all(sortedProviders.map((provider) => runScheduleProviderAdapter(provider, request)))
      const rows = mergeDuplicateScheduleRows(providerResults.flatMap((result) => result.rows))
      const comparison = compareScheduleProviders(providerResults)
      const coverageReport = buildScheduleProviderCoverageReport(rows, providerResults)
      return {
        rows,
        providerResults,
        providerHealth: providerResults.map((result) => result.health),
        providerCoverage: providerResults.map((result) => result.coverage),
        providerDiagnostics: providerResults.map((result) => result.diagnostics),
        comparison,
        coverageReport,
        warnings: uniqueMessages(providerResults.map((result) => result.warning)),
        detail: providerResults.map((result) => `${result.provider}: ${result.detail || result.status}`).join(' · ')
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

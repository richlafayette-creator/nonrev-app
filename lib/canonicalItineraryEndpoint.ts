import { enforceItineraryListEndpointIntegrity } from './itineraryIntegrity'
import { buildAllItinerariesFromFlights, normalizeItineraryRequest, summarizeRouteMatching, validateRoutingEngineCoverage, type ItineraryResult, type ParsedItineraryRequest, type RoutingValidationReport } from './itinerarySearch'
import { createDefaultScheduleProviderRegistry, unifiedRowsToFlightRecords, type ScheduleProviderRegistry, type UnifiedScheduleSearchResult } from './scheduleProviderRegistry'

export const routingEngineVersion = 'canonical-routing-v2'

export type EndpointConsistencyDiagnostics = {
  endpoint: string
  registryProvidersUsed: string[]
  routingEngineVersion: string
  graphSize: {
    airports: number
    flightLegs: number
    legalConnections: number
  }
  itineraryCount: number
}

export type CanonicalItineraryEndpointDebug = {
  endpointConsistency: EndpointConsistencyDiagnostics
  routingValidation: RoutingValidationReport
  providerRegistry: {
    providersConfigured: string[]
    providersUsed: string[]
    rowsReturned: number
    warnings: string[]
    detail: string
    diagnostics: UnifiedScheduleSearchResult['providerDiagnostics']
    health: UnifiedScheduleSearchResult['providerHealth']
    coverage: UnifiedScheduleSearchResult['providerCoverage']
    comparison: UnifiedScheduleSearchResult['comparison']
    coverageReport: UnifiedScheduleSearchResult['coverageReport']
    marketCoverage: UnifiedScheduleSearchResult['marketCoverage']
    providerMetrics: UnifiedScheduleSearchResult['providerMetrics']
    providerInfrastructure: UnifiedScheduleSearchResult['providerInfrastructure']
  }
  duplicateMerging: {
    duplicateRowsMerged: number
    duplicateItinerariesMerged: number
  }
  [key: string]: unknown
}

export type CanonicalItineraryEndpointResponse = {
  ok: boolean
  request: ParsedItineraryRequest
  source: string
  sourceLabel: string
  dataMode: string
  source_provider: string
  source_checked_at?: string
  statusMessage: string
  enrichedWithFlightAware: boolean
  providerBadges: string[]
  warnings: string[]
  debug: CanonicalItineraryEndpointDebug
  count: number
  scheduledFlightLegCount: number
  itineraries: ItineraryResult[]
}

export type CanonicalItineraryEndpointOptions = {
  endpoint: string
  registry?: ScheduleProviderRegistry
  searchParams: URLSearchParams
}

function uniqueMessages(messages: Array<string | undefined>) {
  return [...new Set(messages.filter((message): message is string => Boolean(message?.trim())))]
}

function booleanParam(searchParams: URLSearchParams, key: string) {
  return ['1', 'true', 'yes', 'on'].includes(String(searchParams.get(key) || '').toLowerCase())
}

function providerKeysUsed(search: UnifiedScheduleSearchResult) {
  return search.providerResults
    .filter((result) => result.rows.length > 0 || result.status === 'success')
    .map((result) => result.provider)
}

function sourceCheckedAt(itineraries: ItineraryResult[]) {
  return itineraries
    .flatMap((itinerary) => [itinerary.sourceCheckedAt, ...itinerary.legs.map((leg) => leg.sourceCheckedAt)])
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0]
}

function dataModeFor(providersUsed: string[]) {
  if (providersUsed.some((provider) => provider.includes('flightaware') || provider.includes('aviationstack'))) return 'live'
  if (providersUsed.some((provider) => provider.includes('cache') || provider.includes('supabase'))) return 'provider-cache'
  return 'no-current-live-data'
}

export async function runCanonicalItineraryEndpoint(options: CanonicalItineraryEndpointOptions): Promise<CanonicalItineraryEndpointResponse> {
  const registry = options.registry || createDefaultScheduleProviderRegistry()
  const parsedRequest = normalizeItineraryRequest(options.searchParams)
  const maxResults = Number(options.searchParams.get('maxResults') || options.searchParams.get('limit') || 500) || 500
  const search = parsedRequest.origin && parsedRequest.destination
    ? await registry.searchSchedules({
      origin: parsedRequest.origin,
      destination: parsedRequest.destination,
      date: parsedRequest.date,
      carrier: parsedRequest.carrier,
      maxResults
    })
    : await Promise.resolve({
      rows: [],
      providerResults: [],
      providerHealth: [],
      providerCoverage: [],
      providerDiagnostics: [],
      comparison: { flightsUniqueToEachProvider: {}, missingAirports: {}, missingAirlines: {}, overlapPercentage: 0 },
      coverageReport: { byCountry: {}, byAirport: {}, byAirline: {}, knownDataGaps: ['Search skipped because origin or destination was missing.'] },
      marketCoverage: { providerContributionPercent: {}, providerCoveragePercent: {}, airportsCovered: [], carriersCovered: [], scheduleFreshness: {}, missingCoverage: ['Search skipped because origin or destination was missing.'], supplementRequests: [], supplementReason: 'Search skipped because origin or destination was missing.', normalizedSchedulesCached: 0 },
      providerMetrics: [],
      providerInfrastructure: [],
      warnings: ['Search skipped because origin or destination was missing.'],
      detail: 'Search skipped because origin or destination was missing.'
    } satisfies UnifiedScheduleSearchResult)

  const flights = unifiedRowsToFlightRecords(search.rows)
  const itineraries = enforceItineraryListEndpointIntegrity(buildAllItinerariesFromFlights(flights, parsedRequest), parsedRequest)
  const routingValidation = validateRoutingEngineCoverage(flights, parsedRequest, { expectedItineraries: itineraries.map((itinerary) => itinerary.route) })
  const providersUsed = providerKeysUsed(search)
  const endpointConsistency: EndpointConsistencyDiagnostics = {
    endpoint: options.endpoint,
    registryProvidersUsed: providersUsed,
    routingEngineVersion,
    graphSize: {
      airports: routingValidation.graph.airports.length,
      flightLegs: routingValidation.graph.flightLegs.length,
      legalConnections: routingValidation.graph.legalConnections.length
    },
    itineraryCount: itineraries.length
  }
  const warnings = uniqueMessages([
    ...search.warnings,
    ...routingValidation.graph.exclusionLog.filter((entry) => entry.includes('missing') || entry.includes('outside legal window')).slice(0, 8),
    search.coverageReport.knownDataGaps.length ? `Provider coverage incomplete: ${search.coverageReport.knownDataGaps.join('; ')}` : undefined
  ])
  const providerStatuses = search.providerResults.map((result) => ({
    provider: result.provider,
    label: result.provider,
    state: result.status === 'success' ? 'success' : result.status === 'warning' ? 'warning' : result.status === 'error' ? 'error' : 'skipped',
    detail: result.detail || result.warning || result.status
  }))
  const apiResponseCounts = {
    providerCacheFetched: search.rows.filter((row) => row.source_provider.includes('cache') || row.source_provider.includes('supabase')).length,
    providerCacheItineraries: itineraries.filter((itinerary) => /cache|supabase/i.test(itinerary.source)).length,
    flightAwareScheduleRequests: search.providerResults.filter((result) => result.provider.includes('flightaware')).reduce((total, result) => total + (result.requestCount || 0), 0),
    flightAwareRequested: search.providerResults.filter((result) => result.provider.includes('flightaware')).reduce((total, result) => total + (result.requestCount || 0), 0),
    flightAwareScheduleFetched: search.rows.filter((row) => row.source_provider.includes('flightaware')).length,
    flightAwareScheduleItineraries: itineraries.filter((itinerary) => /flightaware/i.test(itinerary.source)).length,
    flightAwareEnriched: 0,
    supabaseFetched: search.rows.filter((row) => row.source_provider.includes('supabase')).length,
    supabaseMatchedFlights: search.rows.filter((row) => row.source_provider.includes('supabase')).length,
    supabaseItineraries: itineraries.filter((itinerary) => /supabase/i.test(itinerary.source)).length,
    aviationstackRequests: search.providerResults.filter((result) => result.provider.includes('aviationstack')).reduce((total, result) => total + (result.requestCount || 0), 0),
    aviationstackFetched: search.rows.filter((row) => row.source_provider.includes('aviationstack')).length,
    aviationstackItineraries: itineraries.filter((itinerary) => /aviationstack/i.test(itinerary.source)).length,
    finalItineraries: itineraries.length
  }
  const routeMatching = summarizeRouteMatching(flights, parsedRequest)
  const trueLiveDataAvailable = itineraries.some((itinerary) => /flightaware|aviationstack/i.test(itinerary.source))

  return {
    ok: true,
    request: parsedRequest,
    source: 'canonical-provider-registry',
    sourceLabel: 'Canonical provider registry',
    dataMode: dataModeFor(providersUsed),
    source_provider: 'provider-registry',
    source_checked_at: sourceCheckedAt(itineraries),
    statusMessage: `${itineraries.length} complete itinerary${itineraries.length === 1 ? '' : 'ies'} assembled by ${routingEngineVersion} from ${flights.length} canonical schedule leg${flights.length === 1 ? '' : 's'}.`,
    enrichedWithFlightAware: providersUsed.some((provider) => provider.includes('flightaware')),
    providerBadges: providersUsed.length ? providersUsed : registry.providerKeys(),
    warnings,
    debug: {
      endpointConsistency,
      routingValidation,
      apiResponseCounts,
      routeMatching,
      providerStatuses,
      providerReliabilityChecks: [],
      scheduleProviderReadiness: [],
      providerDiagnostics: search.providerDiagnostics,
      providerExplanation: registry.providerKeys().map((provider, index) => `${index + 1}. ${provider} via canonical provider registry`),
      dataFreshnessExplanation: warnings.length ? warnings : ['Canonical provider registry search completed.'],
      safeErrors: warnings,
      trueLiveDataAvailable,
      trueLiveDataUnavailableReason: trueLiveDataAvailable ? '' : 'No live provider row represented the assembled itinerary set; results may be cached or unavailable.',
      parserConfidence: parsedRequest.parserConfidence,
      parserExplanation: parsedRequest.parserExplanation,
      testDataModeEnabled: false,
      deduplicationNotes: search.rows.some((row) => row.duplicate_count) ? [`Canonical duplicate merging removed ${search.rows.reduce((total, row) => total + (row.duplicate_count || 0), 0)} duplicate provider row${search.rows.reduce((total, row) => total + (row.duplicate_count || 0), 0) === 1 ? '' : 's'}.`] : [],
      deduplicatedRowsRemoved: search.rows.reduce((total, row) => total + (row.duplicate_count || 0), 0),
      normalizedFlightAwareItinerarySample: undefined,
      providerRegistry: {
        providersConfigured: registry.providerKeys(),
        providersUsed,
        rowsReturned: search.rows.length,
        warnings: search.warnings,
        detail: search.detail,
        diagnostics: search.providerDiagnostics,
        health: search.providerHealth,
        coverage: search.providerCoverage,
        comparison: search.comparison,
        coverageReport: search.coverageReport,
        marketCoverage: search.marketCoverage,
        providerMetrics: search.providerMetrics,
        providerInfrastructure: search.providerInfrastructure
      },
      duplicateMerging: {
        duplicateRowsMerged: search.rows.reduce((total, row) => total + (row.duplicate_count || 0), 0),
        duplicateItinerariesMerged: routingValidation.duplicateMerges
      }
    },
    count: itineraries.length,
    scheduledFlightLegCount: flights.length,
    itineraries
  }
}

export function canonicalItineraryEndpointAudit() {
  return {
    auditedEndpointFiles: ['app/api/itinerary/search/route.ts'],
    itineraryReturningEndpoints: ['GET /api/itinerary/search'],
    providerEntryPoint: 'lib/scheduleProviderRegistry.createDefaultScheduleProviderRegistry',
    directProviderAccessAllowedInEndpoints: false
  }
}

import { enforceItineraryListEndpointIntegrity } from './itineraryIntegrity'
import { buildItineraryProviderHealthMatrix } from './itineraryProviderHealthReport'
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

export type ItineraryCoverageTrustDiagnostics = {
  resolvedOrigin?: string
  resolvedDestination?: string
  resolvedTravelDate?: string
  providersQueried: string[]
  providerSuccesses: string[]
  providerFailures: Array<{ provider: string; reason: string }>
  cacheHits: string[]
  cacheMisses: string[]
  flightsReceivedFromEachProvider: Record<string, number>
  uniqueFlightsAfterNormalization: number
  airportsExplored: string[]
  graphEdgesExplored: number
  validConnectionsFound: number
  itinerariesAssembled: number
  itinerariesExcluded: number
  exactExclusionReasons: Array<{ route: string; reason: string }>
  duplicateItinerariesMerged: number
  searchDurationMs: number
  dataFreshness: UnifiedScheduleSearchResult['marketCoverage']['scheduleFreshness']
  knownMarketGaps: string[]
  resultSetCompleteness: 'complete' | 'partial' | 'indeterminate'
  conciseStatus: string
}

export type CanonicalItineraryEndpointDebug = {
  endpointConsistency: EndpointConsistencyDiagnostics
  routingValidation: RoutingValidationReport
  coverageTrust: ItineraryCoverageTrustDiagnostics
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
    providerCallLogs: UnifiedScheduleSearchResult['providerCallLogs']
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
  resultSetCompleteness: 'complete' | 'partial' | 'indeterminate'
  coverageStatus: string
  enrichedWithFlightAware: boolean
  providerBadges: string[]
  warnings: string[]
  debug?: CanonicalItineraryEndpointDebug
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


function coverageTrustDiagnostics(search: UnifiedScheduleSearchResult, parsedRequest: ParsedItineraryRequest, routingValidation: RoutingValidationReport, itineraries: ItineraryResult[]): ItineraryCoverageTrustDiagnostics {
  const providerSuccesses = search.providerResults.filter((result) => result.status === 'success').map((result) => result.provider)
  const providerFailures = search.providerResults
    .filter((result) => result.status === 'error' || result.warning)
    .map((result) => ({ provider: result.provider, reason: result.warning || result.detail || 'provider did not return successful coverage' }))
  const cacheHits = search.providerDiagnostics.filter((diagnostic) => diagnostic.cacheStatus === 'hit').map((diagnostic) => diagnostic.providerUsed)
  const cacheMisses = search.providerDiagnostics.filter((diagnostic) => diagnostic.cacheStatus === 'miss').map((diagnostic) => diagnostic.providerUsed)
  const knownMarketGaps = uniqueMessages([...search.coverageReport.knownDataGaps, ...search.marketCoverage.missingCoverage])
  const resultSetCompleteness: ItineraryCoverageTrustDiagnostics['resultSetCompleteness'] = knownMarketGaps.length || providerFailures.length || routingValidation.safetyCapHit
    ? itineraries.length ? 'partial' : 'indeterminate'
    : 'complete'
  const hasLiveItineraries = itineraries.some((itinerary) => /flightaware|aviationstack/i.test(itinerary.source))
  const usesCache = cacheHits.length > 0 || itineraries.some((itinerary) => /cache|supabase/i.test(itinerary.source))
  const cacheBackedItineraries = itineraries.some((itinerary) => /cache|supabase/i.test(itinerary.source))
  const liveLoadUnavailable = 'Itinerary complete; standby load data unavailable'
  let conciseStatus = liveLoadUnavailable
  if (!itineraries.length) {
    conciseStatus = 'No itinerary found in currently available provider data'
  } else if (resultSetCompleteness === 'complete') {
    conciseStatus = 'Comprehensive schedule coverage confirmed'
  } else if (hasLiveItineraries) {
    conciseStatus = liveLoadUnavailable
  } else if (cacheBackedItineraries || usesCache) {
    conciseStatus = 'Cached schedule data'
  } else if (providerFailures.length === search.providerResults.length && search.providerResults.length > 0) {
    conciseStatus = 'Provider unavailable'
  } else if (knownMarketGaps.length) {
    conciseStatus = 'Partial schedule coverage'
  }
  return {
    resolvedOrigin: parsedRequest.origin,
    resolvedDestination: parsedRequest.destination,
    resolvedTravelDate: parsedRequest.date,
    providersQueried: search.providerResults.map((result) => result.provider),
    providerSuccesses,
    providerFailures,
    cacheHits,
    cacheMisses,
    flightsReceivedFromEachProvider: Object.fromEntries(search.providerResults.map((result) => [result.provider, result.rows.length])),
    uniqueFlightsAfterNormalization: search.rows.length,
    airportsExplored: routingValidation.airportsExplored,
    graphEdgesExplored: routingValidation.edgesExplored,
    validConnectionsFound: routingValidation.legalConnectionsFound,
    itinerariesAssembled: itineraries.length,
    itinerariesExcluded: routingValidation.itinerariesFiltered,
    exactExclusionReasons: routingValidation.discardedItineraries,
    duplicateItinerariesMerged: routingValidation.duplicateMerges,
    searchDurationMs: routingValidation.searchDurationMs,
    dataFreshness: search.marketCoverage.scheduleFreshness,
    knownMarketGaps,
    resultSetCompleteness,
    conciseStatus
  }
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
      marketCoverage: { providerContributionPercent: {}, providerCoveragePercent: {}, airportsCovered: [], carriersCovered: [], scheduleFreshness: {}, missingCoverage: ['Search skipped because origin or destination was missing.'], missingAirports: [], missingAirlines: [], missingDates: [], missingMarkets: [], supplementRequests: [], supplementReason: 'Search skipped because origin or destination was missing.', normalizedSchedulesCached: 0 },
      providerMetrics: [],
      providerInfrastructure: [],
      providerCallLogs: [],
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
    !itineraries.length && search.providerDiagnostics.some((diagnostic) => diagnostic.providerUsed.includes('cache') && diagnostic.cacheStatus === 'hit')
      ? 'Supabase cache returned rows, but none assembled into the exact requested itinerary; unrelated cached legs were not displayed.'
      : undefined,
    !itineraries.length && search.providerDiagnostics.some((diagnostic) => diagnostic.providerUsed.includes('cache') && diagnostic.cacheStatus === 'miss')
      ? 'Supabase cache fallback was checked and had no matching rows for the requested route/date.'
      : undefined,
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
  const coverageTrust = coverageTrustDiagnostics(search, parsedRequest, routingValidation, itineraries)
  const debugEnabled = booleanParam(options.searchParams, 'debug') || process.env.NODE_ENV !== 'production'

  return {
    ok: true,
    request: parsedRequest,
    source: 'canonical-provider-registry',
    sourceLabel: 'Canonical provider registry',
    dataMode: dataModeFor(providersUsed),
    source_provider: 'provider-registry',
    source_checked_at: sourceCheckedAt(itineraries),
    statusMessage: coverageTrust.conciseStatus,
    resultSetCompleteness: coverageTrust.resultSetCompleteness,
    coverageStatus: coverageTrust.conciseStatus,
    enrichedWithFlightAware: providersUsed.some((provider) => provider.includes('flightaware')),
    providerBadges: providersUsed.length ? providersUsed : registry.providerKeys(),
    warnings,
    debug: debugEnabled ? {
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
      coverageTrust,
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
        providerInfrastructure: search.providerInfrastructure,
        providerCallLogs: search.providerCallLogs
      },
      providerHealthMatrix: buildItineraryProviderHealthMatrix({ search }),
      duplicateMerging: {
        duplicateRowsMerged: search.rows.reduce((total, row) => total + (row.duplicate_count || 0), 0),
        duplicateItinerariesMerged: routingValidation.duplicateMerges
      }
    } : undefined,
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

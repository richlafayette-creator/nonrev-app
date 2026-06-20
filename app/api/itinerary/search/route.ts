import { NextResponse } from 'next/server'
import { airportScaffoldFor } from '../../../../lib/airportMapScaffold'
import { buildItinerariesFromFlights, closestAvailableFlightDates, flightMatchesRequest, normalizeFlightRouteForDiagnostics, normalizeItineraryRequest, summarizeRouteMatching, type ItineraryResult, type ParsedItineraryRequest, type RouteMatchingSummary } from '../../../../lib/itinerarySearch'
import { mvpRouteSeedDate, mvpRouteSeedFlightsForRequest } from '../../../../lib/mvpRouteSeedData'
import { createAviationstackScheduleProvider, createFlightAwareScheduleProvider, getLiveScheduleProviderReadiness, scheduleResultsToFlightRecords, type ScheduleProviderReadiness } from '../../../../lib/liveScheduleProviders'
import { createProviderResultRepository, providerResultTableName, type ProviderCacheLookupResult, type ProviderResultRecord } from '../../../../lib/providerResultRepository'
import { applyRouteCoverageLookupResult, buildRouteCoverageFallbackSuggestions, destinationAirportGroup, positioningHubsForOrigin, type RouteCoverageLookupStatus, type RouteCoverageSuggestion } from '../../../../lib/routeCoverageFallback'
import { blendRecoveryIntoItineraryScores, buildRecoveryIntelligence, type RecoveryIntelligence } from '../../../../lib/recoveryIntelligence'
import { buildHistoricalRouteIntelligence, blendHistoricalIntelligenceIntoItineraryScores, type HistoricalRouteIntelligence } from '../../../../lib/historicalIntelligence'
import { listAccountBetaRecords } from '../../../../lib/accountBetaStore'
import { persistentUserId } from '../../../../lib/apiIdentity'
import { findServerCommunityLoadReports } from '../../../../lib/communityLoadServerStore'
import type { TripOutcome } from '../../../../lib/outcomeRepository'

export const dynamic = 'force-dynamic'

type FlightRecord = Record<string, unknown>
type ProviderKey = 'supabase' | 'aviationstack' | 'flightaware' | 'planning'
type ProviderState = 'pending' | 'success' | 'skipped' | 'warning' | 'error'

type ProviderStatus = {
  provider: ProviderKey
  label: string
  state: ProviderState
  detail: string
}

type ApiResponseCounts = {
  providerCacheFetched: number
  providerCacheItineraries: number
  flightAwareScheduleRequests: number
  flightAwareScheduleFetched: number
  flightAwareScheduleItineraries: number
  supabaseFetched: number
  supabaseMatchedFlights: number
  supabaseItineraries: number
  aviationstackRequests: number
  aviationstackFetched: number
  aviationstackItineraries: number
  flightAwareRequested: number
  flightAwareEnriched: number
  finalItineraries: number
}

type SupabaseQueryDiagnostics = {
  attemptedPath: string
  usedPath: string
  directCount: number
  connectionCandidateCount: number
  routeCoverageCount: number
  targetedCount: number
  recentCount: number
}

type ProviderCacheFreshnessBand = 'none' | 'current-0-6h' | 'reduced-6-24h' | 'yellow-1-3d' | 'historical-over-3d'

type ProviderCacheDebug = {
  table: string
  storageMode: ProviderCacheLookupResult['storageMode']
  status: ProviderCacheLookupResult['status']
  fetched: number
  usableItineraries: number
  freshnessBand: ProviderCacheFreshnessBand
  detail: string
}

type SafeNormalizedItinerarySample = {
  provider: string
  sourceCheckedAt: string
  flightNumber: string
  carrier: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
  duration: string
  aircraft: string
  status: string
}

type ItineraryDebugMetadata = {
  parsedOrigin?: string
  parsedDestination?: string
  parsedDate?: string
  parserConfidence: number
  parserExplanation: string
  parserFallbackApplied: boolean
  selectedCarrier: string
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
  apiResponseCounts: ApiResponseCounts
  routeMatching: RouteMatchingSummary
  supabaseQueryPath: SupabaseQueryDiagnostics
  providerCache: ProviderCacheDebug
  providerFallbackOrder: string[]
  emptyResults: string[]
  rateLimits: string[]
  invalidAirportCodes: string[]
  unsupportedAirportCodes: string[]
  invalidDates: string[]
  providerExplanation: string[]
  providerStatuses: ProviderStatus[]
  trueLiveDataAvailable: boolean
  trueLiveDataUnavailableReason: string
  activeDataMode: 'production-safe' | 'test-data'
  testDataModeEnabled: boolean
  dataFreshnessMode: 'live-current-api' | 'provider-cache' | 'stored-supabase' | 'nearest-date-testing' | 'demo-fallback' | 'mvp-test-data' | 'no-current-live-data'
  dataFreshnessExplanation: string[]
  scheduleProviderReadiness: ScheduleProviderReadiness[]
  safeErrors: string[]
  deduplicationNotes: string[]
  deduplicatedRowsRemoved: number
  routeCoverageSuggestions: RouteCoverageSuggestion[]
  recoveryIntelligence?: RecoveryIntelligence
  historicalIntelligence?: HistoricalRouteIntelligence
  normalizedFlightAwareItinerarySample?: SafeNormalizedItinerarySample
}

type AviationstackFlight = {
  flight_date?: string
  flight_status?: string
  departure?: {
    airport?: string
    timezone?: string
    iata?: string
    icao?: string
    terminal?: string
    gate?: string
    scheduled?: string
    estimated?: string
    actual?: string
  }
  arrival?: {
    airport?: string
    timezone?: string
    iata?: string
    icao?: string
    terminal?: string
    gate?: string
    scheduled?: string
    estimated?: string
    actual?: string
  }
  airline?: {
    name?: string
    iata?: string
    icao?: string
  }
  flight?: {
    number?: string
    iata?: string
    icao?: string
  }
  aircraft?: {
    registration?: string
    iata?: string
    icao?: string
    icao24?: string
  }
}

const carrierIataCodes: Record<string, string[]> = {
  united: ['UA'],
  delta: ['DL'],
  'alaska-group': ['AS', 'HA']
}

const providerLabels: Record<ProviderKey, string> = {
  supabase: 'Stored Supabase flight data',
  aviationstack: 'Live provider API: Aviationstack',
  flightaware: 'Live provider API: FlightAware',
  planning: 'Demo fallback data'
}

const providerFallbackOrder = [
  '1. Recent provider cache (Supabase provider_itinerary_results, then local fallback)',
  '2. FlightAware live schedules (route/date schedule search)',
  '3. Stored Supabase flight data (targeted route/date query, then recent-row safety query)',
  '4. Aviationstack live provider API fallback (only when quota/account health allows usable results)',
  '5. Nearby airport / positioning route intelligence',
  '6. Demo fallback cards (only if no live API or stored provider data returns itinerary data)'
]

const productionSafeProviderFallbackOrder = [
  '1. Recent provider cache (Supabase provider_itinerary_results, then local fallback)',
  '2. FlightAware live schedules (route/date schedule search)',
  '3. Stored Supabase flight data (strict exact requested-date rows only)',
  '4. Aviationstack live provider API fallback (only when quota/account health allows usable results)',
  '5. Nearby airport / positioning route intelligence',
  '6. Demo fallback and nearest-date testing cards are disabled unless NONREVY_TEST_DATA_MODE=true'
]

const providerTimeoutMs = 7000

const fallbackProviderStatuses: ProviderStatus[] = [
  {
    provider: 'flightaware',
    label: providerLabels.flightaware,
    state: 'pending',
    detail: 'FlightAware live route/date schedule search is checked first.'
  },
  {
    provider: 'supabase',
    label: providerLabels.supabase,
    state: 'pending',
    detail: 'Stored Supabase flight data is checked after FlightAware live schedules.'
  },
  {
    provider: 'aviationstack',
    label: providerLabels.aviationstack,
    state: 'pending',
    detail: 'Aviationstack fallback is queried only when FlightAware and Supabase have no usable matching itineraries.'
  },
  {
    provider: 'planning',
    label: providerLabels.planning,
    state: 'pending',
    detail: 'Demo fallback cards are used only when no live API or stored provider data returns itinerary data.'
  }
]

function flightIdent(flight: FlightRecord) {
  const ident = flight.flight_number || flight.ident || flight.fa_flight_id
  return ident ? String(ident).replace(/\s+/g, '') : ''
}

function aviationstackCarrierCodes(carrier?: string) {
  if (!carrier || carrier === 'all') return [undefined]
  return carrierIataCodes[carrier] || [carrier.toUpperCase()]
}

function uniqueMessages(messages: Array<string | undefined>) {
  return [...new Set(messages.filter((message): message is string => Boolean(message?.trim())))]
}

function emptyCounts(): ApiResponseCounts {
  return {
    providerCacheFetched: 0,
    providerCacheItineraries: 0,
    flightAwareScheduleRequests: 0,
    flightAwareScheduleFetched: 0,
    flightAwareScheduleItineraries: 0,
    supabaseFetched: 0,
    supabaseMatchedFlights: 0,
    supabaseItineraries: 0,
    aviationstackRequests: 0,
    aviationstackFetched: 0,
    aviationstackItineraries: 0,
    flightAwareRequested: 0,
    flightAwareEnriched: 0,
    finalItineraries: 0
  }
}

function isValidAirportCode(value?: string | null) {
  return !value || /^[A-Za-z]{3}$/.test(value.trim())
}

function requestedAirportCodes(request: ReturnType<typeof normalizeItineraryRequest>) {
  return [...new Set([request.origin, request.destination].filter((code): code is string => Boolean(code)))]
}

function unsupportedAirportCodeMessages(request: ReturnType<typeof normalizeItineraryRequest>) {
  return requestedAirportCodes(request)
    .filter((code) => !airportScaffoldFor(code))
    .map((code) => `${code} is not in the local airport intelligence scaffold; configured providers were still queried, but maps and airport guidance may be limited.`)
}

function isValidIsoDate(value?: string) {
  if (!value) return true
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function rateLimitMessage(provider: string, status?: number, message = '') {
  const lower = message.toLowerCase()
  if (status === 429 || lower.includes('rate limit') || lower.includes('usage limit') || lower.includes('quota') || lower.includes('monthly')) {
    return `${provider}: ${message || 'rate or quota limit reached'}`
  }
  return undefined
}

function providerStatus(provider: ProviderKey, state: ProviderState, detail: string): ProviderStatus {
  return {
    provider,
    label: providerLabels[provider],
    state,
    detail
  }
}

function mergeProviderStatuses(overrides: ProviderStatus[]) {
  return fallbackProviderStatuses.map((status) => overrides.find((override) => override.provider === status.provider) || status)
}

function providerBadgesForSource(source: string, enriched: boolean) {
  const badges: string[] = []
  const lowerSource = source.toLowerCase()
  if (lowerSource.includes('mvp-route-seed') || lowerSource.includes('test-data')) badges.push('MVP test data')
  else if (source.includes('flightaware')) badges.push(providerLabels.flightaware)
  else if (source.includes('aviationstack')) badges.push(providerLabels.aviationstack)
  else badges.push(providerLabels.supabase)
  if (enriched && !badges.includes(providerLabels.flightaware)) badges.push(providerLabels.flightaware)
  return badges
}

function safeDisplayValue(value?: string) {
  return value && value.trim() ? value : 'Not provided'
}

function safeNormalizedItinerarySample(itinerary?: ItineraryResult): SafeNormalizedItinerarySample | undefined {
  const leg = itinerary?.legs[0]
  if (!itinerary || !leg) return undefined
  return {
    provider: safeDisplayValue(leg.sourceProvider || itinerary.sourceProvider || itinerary.source),
    sourceCheckedAt: safeDisplayValue(leg.sourceCheckedAt || itinerary.sourceCheckedAt),
    flightNumber: safeDisplayValue(leg.flightNumber),
    carrier: safeDisplayValue(leg.carrier),
    origin: safeDisplayValue(leg.origin),
    destination: safeDisplayValue(leg.destination),
    departureTime: safeDisplayValue(leg.departureTime),
    arrivalTime: safeDisplayValue(leg.arrivalTime),
    duration: safeDisplayValue(leg.duration || itinerary.duration),
    aircraft: safeDisplayValue(leg.aircraft),
    status: safeDisplayValue(leg.status)
  }
}

type FreshnessAnnotation = Pick<ItineraryResult, 'dataFreshnessLabel' | 'dataFreshnessDetail' | 'dataFreshnessRule' | 'dataFreshnessWarning' | 'requestedDate' | 'matchedDate' | 'productionAvailability'>

function providerCacheRecordToFlightRecord(record: ProviderResultRecord): FlightRecord {
  return {
    id: `provider-cache-${record.source_provider}-${record.flight_number}-${record.origin}-${record.destination}-${record.departure_time}`,
    source_provider: `provider-cache:${record.source_provider}`,
    source_checked_at: record.source_checked_at,
    cached_at: record.cached_at,
    flight_number: record.flight_number,
    carrier: record.carrier,
    airline: record.airline,
    origin: record.origin,
    destination: record.destination,
    departure_time: record.departure_time,
    arrival_time: record.arrival_time,
    aircraft: record.aircraft,
    status: record.status,
    score: 68
  }
}

function providerCacheRecordsToFlightRecords(records: ProviderResultRecord[]) {
  return uniqueFlights(records.map(providerCacheRecordToFlightRecord))
}

function sourceCheckedAtAgeHours(value?: string) {
  const parsed = Date.parse(value || '')
  if (!Number.isFinite(parsed)) return Infinity
  return Math.max(0, (Date.now() - parsed) / 3600000)
}

function providerCacheFreshnessBand(records: ProviderResultRecord[]): ProviderCacheFreshnessBand {
  if (!records.length) return 'none'
  const newestHours = Math.min(...records.map((record) => sourceCheckedAtAgeHours(record.source_checked_at || record.cached_at)))
  if (newestHours <= 6) return 'current-0-6h'
  if (newestHours <= 24) return 'reduced-6-24h'
  if (newestHours <= 72) return 'yellow-1-3d'
  return 'historical-over-3d'
}

function providerCacheFreshnessAnnotation(band: ProviderCacheFreshnessBand, request: ParsedItineraryRequest): FreshnessAnnotation {
  if (band === 'current-0-6h') return {
    dataFreshnessLabel: 'Recent cached provider data',
    dataFreshnessDetail: 'Provider result was cached within 0–6 hours. Treat as cached provider data, not a fresh live API response.',
    dataFreshnessRule: 'cached-provider-current',
    requestedDate: request.date,
    matchedDate: request.date,
    productionAvailability: false
  }
  if (band === 'reduced-6-24h') return {
    dataFreshnessLabel: 'Cached provider data',
    dataFreshnessDetail: 'Provider result was cached within 6–24 hours. Confidence is slightly reduced and this is not current live availability.',
    dataFreshnessRule: 'cached-provider-reduced',
    dataFreshnessWarning: 'Cached provider result: checked 6–24 hours ago, not current live availability.',
    requestedDate: request.date,
    matchedDate: request.date,
    productionAvailability: false
  }
  if (band === 'yellow-1-3d') return {
    dataFreshnessLabel: 'Older cached route data',
    dataFreshnessDetail: 'Provider result was cached within 1–3 days. Confidence is yellow/conservative; verify live loads before acting.',
    dataFreshnessRule: 'cached-provider-yellow',
    dataFreshnessWarning: 'Older cached route data: not current live availability.',
    requestedDate: request.date,
    matchedDate: request.date,
    productionAvailability: false
  }
  return {
    dataFreshnessLabel: 'Historical route data',
    dataFreshnessDetail: 'Provider result is older than 3 days. It can inform route intelligence only, not itinerary availability.',
    dataFreshnessRule: 'cached-provider-historical',
    dataFreshnessWarning: 'Historical route data only — not current availability.',
    requestedDate: request.date,
    matchedDate: request.date,
    productionAvailability: false
  }
}

function applyProviderCacheConfidence(itineraries: ItineraryResult[], band: ProviderCacheFreshnessBand) {
  const reduction = band === 'reduced-6-24h' ? 4 : band === 'yellow-1-3d' ? 14 : band === 'historical-over-3d' ? 28 : 0
  return itineraries.map((itinerary) => ({
    ...itinerary,
    score: Math.max(1, itinerary.score - reduction),
    legs: itinerary.legs.map((leg) => ({ ...leg, score: Math.max(1, leg.score - reduction) }))
  }))
}

function providerCacheDebug(result?: ProviderCacheLookupResult, fetched = 0, usableItineraries = 0, freshnessBand: ProviderCacheFreshnessBand = 'none'): ProviderCacheDebug {
  return {
    table: providerResultTableName,
    storageMode: result?.storageMode || 'disabled',
    status: result?.status || 'miss',
    fetched,
    usableItineraries,
    freshnessBand,
    detail: result?.detail || 'Provider cache lookup not attempted.'
  }
}

type HistoricalContext = {
  outcomes: TripOutcome[]
  communityLoadReports: ReturnType<typeof findServerCommunityLoadReports>
  detail: string
}

function emptyHistoricalContext(): HistoricalContext {
  return { outcomes: [], communityLoadReports: [], detail: 'Historical context unavailable; using conservative neutral scoring.' }
}

async function historicalContextForRequest(apiRequest: Request, parsedRequest: ParsedItineraryRequest): Promise<HistoricalContext> {
  const outcomeResult = await listAccountBetaRecords('outcomes', persistentUserId(apiRequest), 500)
  const communityLoadReports = findServerCommunityLoadReports({
    origin: parsedRequest.origin,
    destination: parsedRequest.destination,
    date: parsedRequest.date,
    carrier: parsedRequest.carrier
  })
  return {
    outcomes: outcomeResult.data,
    communityLoadReports,
    detail: `${outcomeResult.detail} ${communityLoadReports.length} server community load report${communityLoadReports.length === 1 ? '' : 's'} matched this route/date.`
  }
}

function applyRouteIntelligenceToResults({
  request,
  itineraries,
  historicalContext = emptyHistoricalContext(),
  providerRecords = [],
  routeCoverageSuggestions = [],
  exactFlightCount = 0,
  candidateFlightCount = 0,
  providerCacheCount = 0,
  historicalAvailabilityCount = 0
}: {
  request: ParsedItineraryRequest
  itineraries: ItineraryResult[]
  historicalContext?: HistoricalContext
  providerRecords?: ProviderResultRecord[]
  routeCoverageSuggestions?: RouteCoverageSuggestion[]
  exactFlightCount?: number
  candidateFlightCount?: number
  providerCacheCount?: number
  historicalAvailabilityCount?: number
}) {
  const recoveryIntelligence = buildRecoveryIntelligence({
    request,
    itineraries,
    routeCoverageSuggestions,
    exactFlightCount,
    candidateFlightCount,
    providerCacheCount,
    historicalAvailabilityCount,
    communityReportCount: historicalContext.communityLoadReports.length
  })
  const recoveryItineraries = blendRecoveryIntoItineraryScores(itineraries, recoveryIntelligence)
  const historicalIntelligence = buildHistoricalRouteIntelligence({
    request,
    itineraries: recoveryItineraries,
    providerRecords,
    outcomes: historicalContext.outcomes,
    communityLoadReports: historicalContext.communityLoadReports,
    recoveryIntelligence
  })
  return {
    recoveryIntelligence,
    historicalIntelligence,
    itineraries: blendHistoricalIntelligenceIntoItineraryScores(recoveryItineraries, historicalIntelligence)
      .sort((a, b) => (b.compositeRouteScore || b.score) - (a.compositeRouteScore || a.score))
      .slice(0, 5)
  }
}

const routeFrameworkHubProfiles: Record<string, { carrier: string; score: number }> = {
  LAX: { carrier: 'United / Alaska / Delta hub routing', score: 82 },
  SFO: { carrier: 'United hub routing', score: 84 },
  SEA: { carrier: 'Alaska / Delta hub routing', score: 80 },
  DEN: { carrier: 'United hub routing', score: 78 },
  PHX: { carrier: 'American / Alaska partner routing', score: 72 },
  ORD: { carrier: 'United / American hub routing', score: 76 },
  ATL: { carrier: 'Delta hub routing', score: 82 },
  MSP: { carrier: 'Delta hub routing', score: 76 },
  CLT: { carrier: 'American partner hub routing', score: 74 },
  IAD: { carrier: 'United hub routing', score: 76 },
  DFW: { carrier: 'American / Alaska partner routing', score: 74 }
}

const destinationHubPatterns: Record<string, string[]> = {
  BOS: ['LAX', 'SFO', 'SEA', 'DEN', 'ORD', 'ATL'],
  JFK: ['LAX', 'SFO', 'SEA', 'DEN', 'ATL'],
  EWR: ['SFO', 'LAX', 'DEN', 'ORD'],
  HND: ['SFO', 'LAX', 'SEA'],
  NRT: ['SFO', 'LAX', 'SEA'],
  HNL: ['LAX', 'SFO', 'SEA'],
  OGG: ['LAX', 'SFO', 'SEA']
}

function routeFrameworkClamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function uniqueAirportCodes(codes: string[]) {
  return [...new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code)))]
}

function routeFrameworkProviderEvidence(records: ProviderResultRecord[], from: string, to: string) {
  return records.filter((record) => record.origin === from && record.destination === to)
}

function historicalPatternHubs(records: ProviderResultRecord[], origin: string, destination: string) {
  return uniqueAirportCodes([
    ...records.filter((record) => record.origin === origin && record.destination !== destination).map((record) => record.destination),
    ...records.filter((record) => record.destination === destination && record.origin !== origin).map((record) => record.origin)
  ]).filter((hub) => hub !== origin && hub !== destination)
}

function routeFrameworkPaths(request: ParsedItineraryRequest, suggestions: RouteCoverageSuggestion[], records: ProviderResultRecord[]) {
  const origin = request.origin
  const destination = request.destination
  if (!origin || !destination) return []
  const destinationOptions = destinationAirportGroup(destination).filter((code) => code !== origin)
  const primaryDestination = destinationOptions.includes(destination) ? destination : destinationOptions[0] || destination
  const suggestionPaths = suggestions
    .filter((suggestion) => suggestion.origin === origin && (suggestion.via || suggestion.destination))
    .map((suggestion) => suggestion.via ? [origin, suggestion.via, suggestion.destination] : [suggestion.origin, suggestion.destination])
  const hubs = uniqueAirportCodes([
    ...positioningHubsForOrigin(origin),
    ...(destinationHubPatterns[destination] || []),
    ...historicalPatternHubs(records, origin, destination)
  ]).filter((hub) => hub !== origin && hub !== primaryDestination)
  const hubPaths = hubs.map((hub) => [origin, hub, primaryDestination])
  const destinationAlternatePaths = destinationOptions
    .filter((code) => code !== primaryDestination)
    .flatMap((alternate) => hubs.slice(0, 3).map((hub) => [origin, hub, alternate]))
  return [...new Map([...suggestionPaths, ...hubPaths, ...destinationAlternatePaths].map((path) => [path.join(' → '), path])).values()]
}

function routeFrameworkLeg(path: string[], index: number, records: ProviderResultRecord[]): ItineraryResult['legs'][number] {
  const origin = path[index]
  const destination = path[index + 1]
  const record = routeFrameworkProviderEvidence(records, origin, destination).sort((a, b) => Date.parse(b.source_checked_at || b.cached_at) - Date.parse(a.source_checked_at || a.cached_at))[0]
  const hubProfile = routeFrameworkHubProfiles[destination] || routeFrameworkHubProfiles[origin]
  return {
    id: record ? `${record.flight_number}-${origin}-${destination}` : `framework-${origin}-${destination}`,
    route: `${origin} → ${destination}`,
    origin,
    destination,
    carrier: record?.airline || record?.carrier || hubProfile?.carrier || 'Alliance partner routing',
    flightNumber: record?.flight_number || 'Flight numbers unavailable',
    operatingFlightNumber: record?.flight_number || undefined,
    marketingFlightNumbers: [],
    departureTime: record?.departure_time || 'Pending live schedule',
    arrivalTime: record?.arrival_time || 'Pending live schedule',
    duration: record ? 'Stored provider timing' : 'Live availability unavailable',
    aircraft: record?.aircraft || 'Unknown until live schedule returns',
    status: record ? 'Stored provider route evidence' : 'Waiting for live loads',
    score: 50,
    risk: 'Medium',
    source: record ? 'provider-cache-route-evidence' : 'route-framework',
    sourceProvider: record?.source_provider || 'route-framework',
    sourceCheckedAt: record?.source_checked_at
  }
}

function routeFrameworkItinerary({ path, score, historical, community, sampleSize, recovery, basis, records }: { path: string[]; score: number; historical: number; community: number; sampleSize: number; recovery: number; basis: string; records: ProviderResultRecord[] }): ItineraryResult {
  const legs = path.slice(0, -1).map((_, index) => routeFrameworkLeg(path, index, records))
  const knownFlightNumbers = legs.map((leg) => leg.operatingFlightNumber).filter(Boolean) as string[]
  return {
    id: `route-framework-${path.join('-')}`.toLowerCase(),
    route: path.join(' → '),
    legs,
    carrier: routeFrameworkHubProfiles[path[1]]?.carrier || 'Alliance partner routing',
    flightNumber: knownFlightNumbers.length ? knownFlightNumbers.join(' / ') : 'Flight numbers unavailable',
    operatingFlightNumber: knownFlightNumbers.length ? knownFlightNumbers.join(' / ') : undefined,
    marketingFlightNumbers: [],
    departureTime: legs[0]?.departureTime || 'Pending live schedule',
    arrivalTime: legs[legs.length - 1]?.arrivalTime || 'Pending live schedule',
    duration: legs.every((leg) => leg.duration === 'Stored provider timing') ? 'Stored provider timing' : 'Live availability unavailable',
    aircraft: [...new Set(legs.map((leg) => leg.aircraft))].join(' + '),
    status: 'Live availability unavailable. Waiting for live loads.',
    score,
    risk: score >= 72 ? 'Medium-Low' : score >= 55 ? 'Medium' : 'High',
    source: 'route-framework',
    sourceProvider: 'route-framework',
    providerBadges: ['Route framework only', 'Live availability unavailable'],
    dataFreshnessLabel: 'Live availability unavailable',
    dataFreshnessDetail: basis,
    dataFreshnessRule: 'route-framework',
    dataFreshnessWarning: 'Route framework only. Flight numbers, times, and loads are shown only when provider data returns them.',
    productionAvailability: false,
    recoveryStrength: recovery,
    recoveryExplanation: basis,
    historicalSuccessScore: historical,
    historicalConfidence: routeFrameworkClamp(Math.min(sampleSize, 12) * 7),
    historicalSampleSize: sampleSize,
    communityLoadTrustScore: community,
    compositeRouteScore: score,
    historicalFactors: { liveAvailabilityScore: 18, historicalSuccessScore: historical, communityLoadScore: community, recoveryStrength: recovery, sampleSizeScore: routeFrameworkClamp(Math.min(sampleSize, 12) * 7), basis }
  }
}

function buildCompleteRouteFrameworkItineraries({ request, routeCoverageSuggestions = [], providerRecords = [], recoveryIntelligence, historicalIntelligence, limit = 5 }: { request: ParsedItineraryRequest; routeCoverageSuggestions?: RouteCoverageSuggestion[]; providerRecords?: ProviderResultRecord[]; recoveryIntelligence?: RecoveryIntelligence; historicalIntelligence?: HistoricalRouteIntelligence; limit?: number }) {
  const historical = historicalIntelligence?.historicalSuccess.score || 50
  const sampleSize = historicalIntelligence?.historicalSuccess.sampleSize || 0
  const community = historicalIntelligence?.loadReportTrust.score || 50
  const recovery = recoveryIntelligence?.recoveryStrength || 45
  return routeFrameworkPaths(request, routeCoverageSuggestions, providerRecords)
    .map((path) => {
      const suggestion = routeCoverageSuggestions.find((item) => item.searchQuery === path.join(' → ') || (item.via && path.includes(item.via)))
      const hubScore = routeFrameworkHubProfiles[path[1]]?.score || 64
      const providerEvidence = path.slice(0, -1).reduce((total, airport, index) => total + routeFrameworkProviderEvidence(providerRecords, airport, path[index + 1]).length, 0)
      const routeConfidence = routeFrameworkClamp(hubScore + Math.min(providerEvidence * 3, 12) + (suggestion?.lookupStatus === 'provider_rows_found' ? 8 : 0) - Math.max(0, path.length - 2) * 4, 35, 92)
      const sampleSizeScore = routeFrameworkClamp(Math.min(sampleSize, 12) * 7 + (historicalIntelligence?.historicalSuccess.confidence || 8) * 0.25, 8, 100)
      const liveAvailabilityScore = suggestion?.lookupStatus === 'provider_rows_found' ? routeFrameworkClamp(45 + Math.min(suggestion.providerResultCount, 8) * 4) : 18
      const score = routeFrameworkClamp(liveAvailabilityScore * 0.2 + historical * 0.25 + routeConfidence * 0.22 + community * 0.13 + recovery * 0.12 + sampleSizeScore * 0.08, 20, 92)
      const basis = [
        routeFrameworkHubProfiles[path[1]]?.carrier || 'Alliance partner routing',
        suggestion?.basis,
        'Live availability unavailable; waiting for live loads before showing flight numbers or seat availability.'
      ].filter(Boolean).join(' · ')
      return routeFrameworkItinerary({ path, score, historical, community, sampleSize, recovery, basis, records: providerRecords })
    })
    .sort((a, b) => (b.compositeRouteScore || b.score) - (a.compositeRouteScore || a.score) || a.route.localeCompare(b.route))
    .slice(0, limit)
}

function addProviderBadges(itineraries: ItineraryResult[], source: 'flightaware' | 'supabase' | 'aviationstack', enriched: boolean, freshness: FreshnessAnnotation = {}) {
  return itineraries.map((itinerary) => ({
    ...itinerary,
    dataFreshnessLabel: freshness.dataFreshnessLabel,
    dataFreshnessDetail: freshness.dataFreshnessDetail,
    dataFreshnessRule: freshness.dataFreshnessRule,
    dataFreshnessWarning: freshness.dataFreshnessWarning,
    requestedDate: freshness.requestedDate,
    matchedDate: freshness.matchedDate,
    productionAvailability: freshness.productionAvailability,
    providerBadges: [
      ...providerBadgesForSource(itinerary.source || source, enriched || itinerary.source.includes('flightaware')),
      ...(freshness.dataFreshnessLabel ? [freshness.dataFreshnessLabel] : [])
    ]
  }))
}


function deduplicationSummary(itineraries: ItineraryResult[], providerLabel: string) {
  const removed = itineraries.reduce((total, itinerary) => total + (itinerary.duplicateCount || 0), 0)
  const codeshares = itineraries.flatMap((itinerary) => itinerary.marketingFlightNumbers || [])
  const notes = removed > 0
    ? [`Deduplication removed ${removed} duplicate/codeshare ${providerLabel} row${removed === 1 ? '' : 's'} by operating flight, route, departure time, and arrival time.`]
    : []
  if (codeshares.length) notes.push(`Codeshare/marketing flight number${codeshares.length === 1 ? '' : 's'} kept in expanded details: ${[...new Set(codeshares)].join(', ')}.`)
  return { removed, notes }
}

function freshnessRuleExplanation(rule: NonNullable<ItineraryResult['dataFreshnessRule']>) {
  if (rule === 'exact-requested-date') return 'Exact requested date: itinerary rows match the requested travel date. Stored Supabase rows remain stored data, not live provider API availability.'
  if (rule === 'cached-provider-current') return 'Recent provider cache: cached provider rows were checked within 0–6 hours. These are cached provider results, not a fresh live API response.'
  if (rule === 'cached-provider-reduced') return 'Recent provider cache: cached provider rows were checked within 6–24 hours. Confidence is slightly reduced and the data is not presented as current live availability.'
  if (rule === 'cached-provider-yellow') return 'Older provider cache: cached provider rows were checked within 1–3 days. Confidence is yellow/conservative and the data is not current live availability.'
  if (rule === 'cached-provider-historical') return 'Historical provider cache: cached provider rows are older than 3 days. They can inform route intelligence only, not itinerary availability.'
  if (rule === 'nearest-date-testing-match') return 'Nearest-date testing match: Personal Testing Mode substituted the nearest available stored/test date. These cards are blocked from production availability claims.'
  if (rule === 'stored-historical-data') return 'Stored historical data: itinerary cards come from persisted data outside a strict requested-date live provider response.'
  if (rule === 'route-framework') return 'Route framework: no live itinerary availability was available, so NONREVY is returning ranked complete route frameworks only. Flight numbers, times, and loads remain unavailable until provider data returns them.'
  return 'Demo fallback: no usable live provider API or stored itinerary rows were available, so scaffold/demo guidance is shown.'
}

function freshnessExplanationsForItineraries(itineraries: ItineraryResult[], fallbackRule: NonNullable<ItineraryResult['dataFreshnessRule']>) {
  const rules = new Set<NonNullable<ItineraryResult['dataFreshnessRule']>>(itineraries.map((itinerary) => itinerary.dataFreshnessRule || fallbackRule))
  return [...rules].map(freshnessRuleExplanation)
}

function trueLiveUnavailableReason(source: 'flightaware' | 'supabase' | 'aviationstack' | 'planning' | 'mvp-test-data', routeMatching?: RouteMatchingSummary) {
  if (source === 'flightaware') return ''
  if (source === 'aviationstack') return ''
  if (source === 'supabase') {
    if (routeMatching?.dateCoverage.nearestDateApplied) return `Live provider API data was unavailable; using stored Supabase rows from nearest available date ${routeMatching.dateCoverage.effectiveMatchDate} for requested date ${routeMatching.dateCoverage.requestedSearchDate}.`
    return 'FlightAware live schedules were unavailable or returned no usable itinerary, so stored Supabase rows produced itinerary cards; these rows are persisted database records, not a current provider API response.'
  }
  if (source === 'mvp-test-data') return 'Live provider API data was unavailable from FlightAware/Supabase/Aviationstack, so static MVP test data is being used.'
  return 'Live provider API data was unavailable from configured providers and stored schedules had no usable itinerary, so ranked complete route frameworks are being shown without flight availability claims.'
}

function safeProviderMessage(provider: string, status: number, fallback: string) {
  if (rateLimitMessage(provider, status, fallback)) return `${provider} rate limit reached; skipped this provider safely`
  if (status === 401 || status === 403) return `${provider} credentials rejected or endpoint not available for this key`
  if (status === 404 || status === 405 || status === 410 || status === 501) return `${provider} endpoint unsupported or unavailable for this request`
  if (status >= 500) return `${provider} service unavailable (${status}); skipped safely`
  return fallback
}

function safeMessage(value: unknown) {
  if (!value) return ''
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : 'Request failed'
  return raw
    .replace(/access_key=[^&\s]+/gi, 'access_key=[hidden]')
    .replace(/apikey[=:]\s*[^&\s]+/gi, 'apikey=[hidden]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [hidden]')
    .replace(/x-apikey[=:]\s*[^&\s]+/gi, 'x-apikey=[hidden]')
    .slice(0, 220)
}

async function readJsonSafely(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    const data = await readJsonSafely(response)
    return { response, data }
  } finally {
    clearTimeout(timeout)
  }
}

function nextIsoDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return undefined
  parsed.setUTCDate(parsed.getUTCDate() + 1)
  return parsed.toISOString().slice(0, 10)
}

function dayDistance(a?: string, b?: string) {
  if (!a || !b) return Infinity
  const left = Date.parse(`${a}T00:00:00.000Z`)
  const right = Date.parse(`${b}T00:00:00.000Z`)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Infinity
  return Math.abs(Math.round((left - right) / 86400000))
}

function booleanParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key)?.toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on' || value === 'personal'
}

function testDataModeEnabled() {
  return process.env.NONREVY_TEST_DATA_MODE === 'true'
}

function activeDataModeLabel(enabled: boolean) {
  return enabled ? 'test-data' as const : 'production-safe' as const
}

function nearestDateTolerance(searchParams: URLSearchParams) {
  const configured = Number(searchParams.get('nearestDateToleranceDays') || process.env.PERSONAL_TESTING_NEAREST_DATE_TOLERANCE_DAYS || '45')
  return Number.isFinite(configured) ? Math.max(0, Math.min(365, Math.round(configured))) : 45
}

function availableDatesForFlights(flights: FlightRecord[]) {
  return [...new Set(flights.map((flight) => normalizeFlightRouteForDiagnostics(flight).date).filter(Boolean) as string[])].sort()
}

function nearestDateRequestForPersonalTesting(flights: FlightRecord[], request: ParsedItineraryRequest, toleranceDays: number) {
  if (!request.date) return { request, nearestDateApplied: false, closestAvailableDates: [] as string[] }
  const routeAndCarrierRequest = { ...request, date: undefined }
  const routeAndCarrierFlights = flights.filter((flight) => flightMatchesRequest(flight, routeAndCarrierRequest))
  const scopedDates = availableDatesForFlights(routeAndCarrierFlights.length ? routeAndCarrierFlights : flights)
  const closestAvailableDates = closestAvailableFlightDates(scopedDates, request.date, 5)
  const nearestDate = closestAvailableDates[0]
  const withinTolerance = nearestDate ? dayDistance(nearestDate, request.date) <= toleranceDays : false
  if (!withinTolerance) return { request, nearestDateApplied: false, closestAvailableDates }
  return {
    request: { ...request, date: nearestDate },
    nearestDateApplied: nearestDate !== request.date,
    closestAvailableDates
  }
}

function supabaseQueryUrl(supabaseUrl: string, request: ReturnType<typeof normalizeItineraryRequest>, mode: 'direct' | 'connection' | 'routeCoverage' | 'recent') {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: mode === 'recent' ? '300' : mode === 'routeCoverage' ? '300' : '600'
  })

  if (mode === 'direct') {
    if (request.origin) params.set('origin', `eq.${request.origin}`)
    if (request.destination) params.set('destination', `eq.${request.destination}`)
    if (request.date) {
      const nextDate = nextIsoDate(request.date)
      params.append('departure_time', `gte.${request.date}`)
      if (nextDate) params.append('departure_time', `lt.${nextDate}`)
    }
  }

  if (mode === 'connection') {
    if (request.origin && request.destination) params.set('or', `(origin.eq.${request.origin},destination.eq.${request.destination})`)
    else if (request.origin) params.set('origin', `eq.${request.origin}`)
    else if (request.destination) params.set('destination', `eq.${request.destination}`)

    if (request.date) {
      const nextDate = nextIsoDate(request.date)
      params.append('departure_time', `gte.${request.date}`)
      if (nextDate) params.append('departure_time', `lt.${nextDate}`)
    }
  }

  if (mode === 'routeCoverage') {
    if (request.origin && request.destination) params.set('or', `(origin.eq.${request.origin},destination.eq.${request.destination})`)
    else if (request.origin) params.set('origin', `eq.${request.origin}`)
    else if (request.destination) params.set('destination', `eq.${request.destination}`)
  }

  return `${supabaseUrl}/rest/v1/flights?${params.toString()}`
}

function uniqueFlights(flights: FlightRecord[]) {
  const seen = new Set<string>()
  return flights.filter((flight, index) => {
    const key = [flight.id, flight.flight_number || flight.ident || flight.fa_flight_id, flight.origin, flight.destination, flight.departure_time || flight.scheduled_departure || flight.flight_date].filter(Boolean).join('|') || `row-${index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function fetchSupabaseFlights(request: ReturnType<typeof normalizeItineraryRequest>) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const queryDiagnostics: SupabaseQueryDiagnostics = {
    attemptedPath: 'not configured',
    usedPath: 'not configured',
    directCount: 0,
    connectionCandidateCount: 0,
    routeCoverageCount: 0,
    targetedCount: 0,
    recentCount: 0
  }

  if (!supabaseUrl || !supabaseKey) {
    return { flights: [] as FlightRecord[], warning: 'Supabase environment variables missing; skipped Supabase safely', queryDiagnostics }
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`
  }
  const shouldTryTargeted = Boolean(request.origin || request.destination || request.date)
  const warnings: string[] = []
  let directFlights: FlightRecord[] = []
  let targetedFlights: FlightRecord[] = []
  let routeCoverageFlights: FlightRecord[] = []
  let recentFlights: FlightRecord[] = []

  if (shouldTryTargeted) {
    queryDiagnostics.attemptedPath = request.origin && request.destination ? 'direct route/date query + connection-candidate query' : 'targeted route/date query'
    try {
      const { response, data } = await fetchJsonWithTimeout(supabaseQueryUrl(supabaseUrl, request, 'direct'), { headers })
      if (!response.ok) {
        warnings.push(safeProviderMessage('Supabase', response.status, safeMessage(data?.message || data?.error || `Supabase direct route request failed with ${response.status}`)))
      } else {
        directFlights = Array.isArray(data) ? data as FlightRecord[] : []
        queryDiagnostics.directCount = directFlights.length
      }
    } catch (error) {
      warnings.push(`Supabase direct route request failed; trying broader candidates (${safeMessage(error) || 'request aborted'})`)
    }

    const shouldTryConnections = request.origin && request.destination
    if (shouldTryConnections) {
      try {
        const { response, data } = await fetchJsonWithTimeout(supabaseQueryUrl(supabaseUrl, request, 'connection'), { headers })
        if (!response.ok) {
          warnings.push(safeProviderMessage('Supabase', response.status, safeMessage(data?.message || data?.error || `Supabase connection-candidate request failed with ${response.status}`)))
        } else {
          targetedFlights = Array.isArray(data) ? data as FlightRecord[] : []
          queryDiagnostics.connectionCandidateCount = targetedFlights.length
          queryDiagnostics.targetedCount = directFlights.length + targetedFlights.length
        }
      } catch (error) {
        warnings.push(`Supabase connection-candidate request failed; trying recent-row safety query (${safeMessage(error) || 'request aborted'})`)
      }
    } else {
      targetedFlights = directFlights
      queryDiagnostics.targetedCount = targetedFlights.length
    }
  } else {
    queryDiagnostics.attemptedPath = 'recent-row safety query'
  }

  const routeCandidateCount = directFlights.length + targetedFlights.length
  const targetedHasMatches = [...directFlights, ...targetedFlights].some((flight) => flightMatchesRequest(flight, request))
  const needsRouteCoverageQuery = Boolean(request.origin || request.destination) && (routeCandidateCount === 0 || !targetedHasMatches)
  if (needsRouteCoverageQuery) {
    try {
      const { response, data } = await fetchJsonWithTimeout(supabaseQueryUrl(supabaseUrl, request, 'routeCoverage'), { headers })
      if (!response.ok) {
        warnings.push(safeProviderMessage('Supabase', response.status, safeMessage(data?.message || data?.error || `Supabase route-coverage request failed with ${response.status}`)))
      } else {
        routeCoverageFlights = Array.isArray(data) ? data as FlightRecord[] : []
        queryDiagnostics.routeCoverageCount = routeCoverageFlights.length
      }
    } catch (error) {
      warnings.push(`Supabase route-coverage request failed; trying recent-row safety query (${safeMessage(error) || 'request aborted'})`)
    }
  }

  const needsRecentSafetyQuery = !shouldTryTargeted || routeCandidateCount === 0 || !targetedHasMatches
  if (needsRecentSafetyQuery) {
    try {
      const { response, data } = await fetchJsonWithTimeout(supabaseQueryUrl(supabaseUrl, request, 'recent'), { headers })
      if (!response.ok) {
        warnings.push(safeProviderMessage('Supabase', response.status, safeMessage(data?.message || data?.error || `Supabase recent flights request failed with ${response.status}`)))
      } else {
        recentFlights = Array.isArray(data) ? data as FlightRecord[] : []
        queryDiagnostics.recentCount = recentFlights.length
      }
    } catch (error) {
      warnings.push(`Supabase recent flights request failed (${safeMessage(error) || 'request aborted'})`)
    }
  }

  const flights = uniqueFlights([...directFlights, ...targetedFlights, ...routeCoverageFlights, ...recentFlights])
  queryDiagnostics.targetedCount = directFlights.length + targetedFlights.length
  if (directFlights.length && targetedFlights.length && !needsRecentSafetyQuery) {
    queryDiagnostics.usedPath = 'direct route/date query + connection-candidate query'
  } else if (directFlights.length && !needsRecentSafetyQuery) {
    queryDiagnostics.usedPath = 'direct route/date query'
  } else if (targetedFlights.length && !needsRecentSafetyQuery) {
    queryDiagnostics.usedPath = 'connection-candidate query'
  } else if (routeCoverageFlights.length && recentFlights.length) {
    queryDiagnostics.usedPath = 'route coverage query + recent-row safety query'
  } else if (routeCoverageFlights.length) {
    queryDiagnostics.usedPath = 'route coverage query'
  } else if ((directFlights.length || targetedFlights.length) && recentFlights.length) {
    queryDiagnostics.usedPath = 'route/date candidate query + recent-row safety query'
  } else if (directFlights.length || targetedFlights.length) {
    queryDiagnostics.usedPath = 'route/date candidate query + empty recent-row safety query'
  } else if (recentFlights.length) {
    queryDiagnostics.usedPath = 'recent-row safety query'
  } else if (shouldTryTargeted) {
    queryDiagnostics.usedPath = 'route/date candidate query + empty recent-row safety query'
  } else {
    queryDiagnostics.usedPath = 'recent-row safety query'
  }

  return {
    flights,
    warning: warnings.length ? uniqueMessages(warnings).join(' · ') : flights.length ? undefined : 'Supabase flights table returned no rows',
    queryDiagnostics
  }
}

async function enrichWithFlightAware(flights: FlightRecord[]) {
  const apiKey = process.env.FLIGHTAWARE_API_KEY
  if (!apiKey) {
    return {
      enrichments: {} as Record<string, FlightRecord>,
      warning: 'FlightAware API key missing; enrichment skipped safely',
      status: 'not configured',
      requestedCount: 0
    }
  }

  const enrichments: Record<string, FlightRecord> = {}
  const idents = [...new Set(flights.map(flightIdent).filter(Boolean))].slice(0, 8)
  const warnings: string[] = []

  if (idents.length === 0) {
    return { enrichments, warning: undefined, status: 'no known flight numbers to enrich', requestedCount: 0 }
  }

  await Promise.all(idents.map(async (ident) => {
    try {
      const { response, data } = await fetchJsonWithTimeout(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}?max_pages=1`, {
        headers: { 'x-apikey': apiKey }
      })
      if (response.ok && Array.isArray(data?.flights) && data.flights[0]) {
        enrichments[ident] = data.flights[0]
        return
      }
      if (!response.ok) {
        warnings.push(safeProviderMessage('FlightAware', response.status, safeMessage(data?.title || data?.error || data?.message || `FlightAware request failed with ${response.status}`)))
      }
    } catch {
      warnings.push('FlightAware enrichment request failed; kept base provider results')
    }
  }))

  return {
    enrichments,
    warning: warnings.length ? uniqueMessages(warnings).join(' · ') : undefined,
    status: `${Object.keys(enrichments).length} of ${idents.length} known flight numbers enriched`,
    requestedCount: idents.length
  }
}

async function fetchAviationstackFlights(request: ReturnType<typeof normalizeItineraryRequest>) {
  const provider = createAviationstackScheduleProvider()
  const response = await provider.searchSchedules({
    origin: request.origin,
    destination: request.destination,
    date: request.date,
    carrier: request.carrier,
    maxResults: 50
  })

  return {
    flights: uniqueFlights(scheduleResultsToFlightRecords(response.results)),
    warning: response.warning,
    requestCount: response.requestCount
  }
}

async function fetchFlightAwareScheduleFlights(request: ReturnType<typeof normalizeItineraryRequest>) {
  const provider = createFlightAwareScheduleProvider()
  const response = await provider.searchSchedules({
    origin: request.origin,
    destination: request.destination,
    date: request.date,
    carrier: request.carrier,
    maxResults: 50
  })

  const flights = scheduleResultsToFlightRecords(response.results).map((flight) => ({
    ...flight,
    flight_date: request.date,
    origin: flight.origin === 'Not provided' ? request.origin || flight.origin : flight.origin,
    destination: flight.destination === 'Not provided' ? request.destination || flight.destination : flight.destination
  }))

  return {
    flights: uniqueFlights(flights),
    warning: response.warning,
    requestCount: response.requestCount,
    detail: response.detail,
    status: response.status
  }
}

async function routeCoverageFallbackGuidance(request: ReturnType<typeof normalizeItineraryRequest>, rateLimits: string[]) {
  const baseSuggestions = buildRouteCoverageFallbackSuggestions(request)
  if (!baseSuggestions.length) return []
  if (rateLimits.some((message) => message.toLowerCase().includes('flightaware'))) {
    return baseSuggestions.map((suggestion) => applyRouteCoverageLookupResult(suggestion, {
      status: 'skipped_rate_limited',
      providerDetail: 'FlightAware quota/rate-limit already affected the exact search, so alternate route lookups were not retried.'
    }))
  }

  const provider = createFlightAwareScheduleProvider()
  const providerCache = createProviderResultRepository()
  const lookupSuggestions = baseSuggestions.slice(0, 6)
  const lookupResults = await Promise.all(lookupSuggestions.map(async (suggestion) => {
    try {
      const cached = await providerCache.findCachedResults({
        origin: suggestion.via || suggestion.origin,
        destination: suggestion.destination,
        date: request.date,
        carrier: request.carrier,
        maxAgeHours: 72,
        limit: 5
      })
      if (cached.records.length) {
        return applyRouteCoverageLookupResult(suggestion, {
          status: 'provider_rows_found',
          providerResultCount: cached.records.length,
          providerDetail: `${cached.records.length} cached provider row${cached.records.length === 1 ? '' : 's'} found for this alternate route; verify live availability before acting.`
        })
      }

      const historical = await providerCache.findCachedResults({
        origin: suggestion.via || suggestion.origin,
        destination: suggestion.destination,
        date: request.date,
        carrier: request.carrier,
        maxAgeHours: 24 * 365,
        limit: 5
      })
      const historicalRecords = historical.records.filter((record) => sourceCheckedAtAgeHours(record.source_checked_at || record.cached_at) > 72)

      const response = await provider.searchSchedules({
        origin: suggestion.via || suggestion.origin,
        destination: suggestion.destination,
        date: request.date,
        carrier: request.carrier,
        maxResults: 5
      })
      const warning = response.warning || ''
      const status: RouteCoverageLookupStatus = response.results.length
        ? 'provider_rows_found'
        : rateLimitMessage('FlightAware', undefined, warning)
          ? 'skipped_rate_limited'
          : response.status === 'warning' || response.status === 'error'
            ? 'provider_warning'
            : 'provider_no_rows'
      return applyRouteCoverageLookupResult(suggestion, {
        status,
        providerResultCount: response.results.length,
        providerDetail: [
          response.detail || warning || 'FlightAware alternate route lookup completed.',
          historicalRecords.length ? `${historicalRecords.length} historical provider cache row${historicalRecords.length === 1 ? '' : 's'} also support this as route intelligence only.` : undefined
        ].filter(Boolean).join(' ')
      })
    } catch {
      return applyRouteCoverageLookupResult(suggestion, {
        status: 'provider_warning',
        providerDetail: 'Alternate route lookup failed safely; keep this as route guidance only.'
      })
    }
  }))

  const checkedIds = new Set(lookupResults.map((suggestion) => suggestion.id))
  return [
    ...lookupResults,
    ...baseSuggestions.filter((suggestion) => !checkedIds.has(suggestion.id))
  ]
}

function skippedSupabaseDiagnostics(reason: string): SupabaseQueryDiagnostics {
  return {
    attemptedPath: reason,
    usedPath: reason,
    directCount: 0,
    connectionCandidateCount: 0,
    routeCoverageCount: 0,
    targetedCount: 0,
    recentCount: 0
  }
}

function normalizeAviationstackFlight(flight: AviationstackFlight): FlightRecord {
  const flightNumber = flight.flight?.iata || flight.flight?.icao || flight.flight?.number || 'Flight TBD'
  const origin = flight.departure?.iata || flight.departure?.icao || 'TBD'
  const destination = flight.arrival?.iata || flight.arrival?.icao || 'TBD'
  const aircraft = flight.aircraft?.iata || flight.aircraft?.icao || flight.aircraft?.registration || 'Unknown'

  return {
    id: `aviationstack-${flightNumber}-${origin}-${destination}-${flight.departure?.scheduled || flight.flight_date || 'pending'}`,
    source_provider: 'aviationstack',
    source_checked_at: new Date().toISOString(),
    flight_date: flight.flight_date,
    flight_number: flightNumber,
    carrier: flight.airline?.name || flight.airline?.iata || flight.airline?.icao || 'Unknown Airline',
    airline: flight.airline?.name,
    origin,
    destination,
    departure_time: flight.departure?.scheduled || flight.departure?.estimated || flight.departure?.actual || 'Pending',
    arrival_time: flight.arrival?.scheduled || flight.arrival?.estimated || flight.arrival?.actual || 'Pending',
    aircraft,
    status: flight.flight_status || 'Unknown',
    departure_gate: flight.departure?.gate,
    arrival_gate: flight.arrival?.gate,
    departure_terminal: flight.departure?.terminal,
    arrival_terminal: flight.arrival?.terminal,
    score: flight.flight_status?.toLowerCase().includes('cancel') ? 35 : 68
  }
}

function sourceLabel(source: 'flightaware' | 'supabase' | 'aviationstack' | 'planning', enriched: boolean) {
  if (source === 'planning') return providerLabels.planning
  if (source === 'flightaware') return providerLabels.flightaware
  if (source === 'aviationstack') return enriched ? 'Live provider API: Aviationstack + FlightAware enrichment' : providerLabels.aviationstack
  return enriched ? 'Stored Supabase flight data + FlightAware enrichment' : providerLabels.supabase
}

function buildDebugMetadata({
  parsedRequest,
  supabaseResultCount,
  aviationstackFallbackStatus,
  flightAwareEnrichmentStatus,
  finalItineraryCount,
  apiResponseCounts,
  routeMatching,
  supabaseQueryPath,
  providerCache = providerCacheDebug(),
  providerFallbackOrder,
  emptyResults,
  rateLimits,
  invalidAirportCodes,
  unsupportedAirportCodes,
  invalidDates,
  providerStatuses,
  trueLiveDataAvailable,
  trueLiveDataUnavailableReason,
  testDataModeEnabled,
  dataFreshnessMode,
  dataFreshnessExplanation,
  safeErrors,
  deduplicationNotes = [],
  deduplicatedRowsRemoved = 0,
  routeCoverageSuggestions = [],
  recoveryIntelligence,
  historicalIntelligence,
  normalizedFlightAwareItinerarySample
}: {
  parsedRequest: ReturnType<typeof normalizeItineraryRequest>
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
  apiResponseCounts: ApiResponseCounts
  routeMatching: RouteMatchingSummary
  supabaseQueryPath: SupabaseQueryDiagnostics
  providerCache?: ProviderCacheDebug
  providerFallbackOrder: string[]
  emptyResults: string[]
  rateLimits: string[]
  invalidAirportCodes: string[]
  unsupportedAirportCodes: string[]
  invalidDates: string[]
  providerStatuses: ProviderStatus[]
  trueLiveDataAvailable: boolean
  trueLiveDataUnavailableReason: string
  testDataModeEnabled: boolean
  dataFreshnessMode: ItineraryDebugMetadata['dataFreshnessMode']
  dataFreshnessExplanation: string[]
  safeErrors: string[]
  deduplicationNotes?: string[]
  deduplicatedRowsRemoved?: number
  routeCoverageSuggestions?: RouteCoverageSuggestion[]
  recoveryIntelligence?: RecoveryIntelligence
  historicalIntelligence?: HistoricalRouteIntelligence
  normalizedFlightAwareItinerarySample?: SafeNormalizedItinerarySample
}): ItineraryDebugMetadata {
  const mergedProviderStatuses = mergeProviderStatuses(providerStatuses)
  return {
    parsedOrigin: parsedRequest.origin,
    parsedDestination: parsedRequest.destination,
    parsedDate: parsedRequest.date,
    parserConfidence: parsedRequest.parserConfidence,
    parserExplanation: parsedRequest.parserExplanation,
    parserFallbackApplied: parsedRequest.parserFallbackApplied,
    selectedCarrier: parsedRequest.carrier || 'all',
    supabaseResultCount,
    aviationstackFallbackStatus,
    flightAwareEnrichmentStatus,
    finalItineraryCount,
    apiResponseCounts,
    routeMatching,
    supabaseQueryPath,
    providerCache,
    providerFallbackOrder,
    emptyResults,
    rateLimits,
    invalidAirportCodes,
    unsupportedAirportCodes,
    invalidDates,
    providerExplanation: mergedProviderStatuses.map((status, index) => `${index + 1}. ${status.label}: ${status.detail}`),
    providerStatuses: mergedProviderStatuses,
    trueLiveDataAvailable,
    trueLiveDataUnavailableReason,
    activeDataMode: activeDataModeLabel(testDataModeEnabled),
    testDataModeEnabled,
    dataFreshnessMode,
    dataFreshnessExplanation,
    scheduleProviderReadiness: getLiveScheduleProviderReadiness(),
    safeErrors,
    deduplicationNotes,
    deduplicatedRowsRemoved,
    routeCoverageSuggestions,
    recoveryIntelligence,
    historicalIntelligence,
    normalizedFlightAwareItinerarySample
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsedRequest = normalizeItineraryRequest(searchParams)
  const envTestDataModeEnabled = testDataModeEnabled()
  const personalTestingMode = envTestDataModeEnabled && (booleanParam(searchParams, 'personalTestingMode') || booleanParam(searchParams, 'testingMode'))
  const activeProviderFallbackOrder = envTestDataModeEnabled ? providerFallbackOrder : productionSafeProviderFallbackOrder
  const personalTestingToleranceDays = nearestDateTolerance(searchParams)
  const invalidAirportCodes = [
    !isValidAirportCode(searchParams.get('origin')) ? `origin=${searchParams.get('origin')}` : undefined,
    !isValidAirportCode(searchParams.get('destination')) ? `destination=${searchParams.get('destination')}` : undefined
  ].filter((message): message is string => Boolean(message))
  const invalidDates = parsedRequest.date && !isValidIsoDate(parsedRequest.date)
    ? [`${parsedRequest.date} is not a valid YYYY-MM-DD date; provider search ignored this date filter to avoid hiding available flights.`]
    : []
  const effectiveRequest = invalidDates.length ? { ...parsedRequest, date: undefined } : parsedRequest
  const unsupportedAirportCodes = unsupportedAirportCodeMessages(effectiveRequest)
  const warnings: string[] = []
  const emptyResults: string[] = []
  const rateLimits: string[] = []
  const counts = emptyCounts()

  if (invalidAirportCodes.length) warnings.push(`Invalid airport code input ignored: ${invalidAirportCodes.join(', ')}`)
  if (unsupportedAirportCodes.length) warnings.push(...unsupportedAirportCodes)
  if (invalidDates.length) warnings.push(...invalidDates)
  if (!envTestDataModeEnabled && (booleanParam(searchParams, 'personalTestingMode') || booleanParam(searchParams, 'testingMode'))) {
    warnings.push('Personal Testing Mode was requested, but NONREVY_TEST_DATA_MODE is not true; production-safe strict data mode is active.')
  }

  if (effectiveRequest.parserFallbackApplied) {
    const noRouteMessage = envTestDataModeEnabled
      ? 'Parser could not determine a complete origin and destination. Showing safe fallback demo guidance instead of running a broad provider search.'
      : 'Parser could not determine a complete origin and destination. Production-safe mode is active, so demo fallback cards are hidden until a complete route is provided.'
    const finalWarnings = uniqueMessages([...warnings, noRouteMessage])
    const supabaseQueryPath: SupabaseQueryDiagnostics = {
      attemptedPath: 'skipped; parser route incomplete',
      usedPath: 'skipped; parser route incomplete',
      directCount: 0,
      connectionCandidateCount: 0,
      routeCoverageCount: 0,
      targetedCount: 0,
      recentCount: 0
    }
    emptyResults.push('Provider search skipped because the normalized request did not contain both origin and destination.')
    const debug = buildDebugMetadata({
      parsedRequest: effectiveRequest,
      supabaseResultCount: 0,
      aviationstackFallbackStatus: 'skipped; parser route incomplete',
      flightAwareEnrichmentStatus: 'skipped; no known live flight numbers available to enrich',
      finalItineraryCount: 0,
      apiResponseCounts: counts,
      routeMatching: summarizeRouteMatching([], effectiveRequest),
      supabaseQueryPath,
      emptyResults,
      rateLimits,
      invalidAirportCodes,
      unsupportedAirportCodes,
      invalidDates,
      providerStatuses: [
        providerStatus('supabase', 'skipped', 'Skipped to avoid an unrestricted stored-data search without a complete parsed route.'),
        providerStatus('aviationstack', 'skipped', 'Skipped to avoid an unrestricted fallback-provider search without a complete parsed route.'),
        providerStatus('flightaware', 'skipped', 'Skipped because the parser did not produce a complete route for live schedule search.'),
        providerStatus('planning', envTestDataModeEnabled ? 'success' : 'skipped', envTestDataModeEnabled
          ? 'Clearly marked demo fallback cards are active in the UI until the route is complete.'
          : 'Demo fallback cards are disabled because NONREVY_TEST_DATA_MODE is not true.')
      ],
      providerFallbackOrder: activeProviderFallbackOrder,
      trueLiveDataAvailable: false,
      trueLiveDataUnavailableReason: envTestDataModeEnabled ? trueLiveUnavailableReason('planning') : 'No current live data is shown because production-safe mode is active and the route is incomplete.',
      dataFreshnessMode: envTestDataModeEnabled ? 'demo-fallback' : 'no-current-live-data',
      dataFreshnessExplanation: envTestDataModeEnabled
        ? [freshnessRuleExplanation('demo-fallback')]
        : ['Production-safe mode: nearest-date testing and demo fallback cards are hidden unless NONREVY_TEST_DATA_MODE=true.'],
      testDataModeEnabled: envTestDataModeEnabled,
      safeErrors: finalWarnings
    })

    return NextResponse.json({
      ok: true,
      request: effectiveRequest,
      source: 'parser-safe-planning-fallback',
      sourceLabel: envTestDataModeEnabled ? sourceLabel('planning', false) : 'No current live data',
      dataMode: envTestDataModeEnabled ? 'fallback' : 'no-current-live-data',
      source_provider: envTestDataModeEnabled ? 'demo' : 'none',
      source_checked_at: undefined,
      statusMessage: noRouteMessage,
      errorMessage: noRouteMessage,
      enrichedWithFlightAware: false,
      providerBadges: envTestDataModeEnabled ? [providerLabels.planning] : ['Production-safe mode'],
      warnings: finalWarnings,
      debug,
      count: 0,
      itineraries: []
    })
  }

  const historicalContext = await historicalContextForRequest(request, effectiveRequest)

  const providerCacheLookup = await createProviderResultRepository().findCachedResults({
    origin: effectiveRequest.origin,
    destination: effectiveRequest.destination,
    date: effectiveRequest.date,
    carrier: effectiveRequest.carrier,
    maxAgeHours: 72,
    limit: 100
  })
  const providerCacheFreshness = providerCacheFreshnessBand(providerCacheLookup.records)
  const providerCacheFlights = providerCacheRecordsToFlightRecords(providerCacheLookup.records)
  counts.providerCacheFetched = providerCacheFlights.length
  const providerCacheRouteMatching = summarizeRouteMatching(providerCacheFlights, effectiveRequest)
  const providerCacheItineraries = buildItinerariesFromFlights(providerCacheFlights, effectiveRequest)
  counts.providerCacheItineraries = providerCacheItineraries.length
  if (providerCacheLookup.status === 'unavailable') warnings.push(providerCacheLookup.detail)
  if (providerCacheLookup.status === 'miss') emptyResults.push('Recent provider cache returned no matching rows.')
  if (providerCacheFlights.length > 0 && providerCacheItineraries.length === 0) emptyResults.push('Recent provider cache returned rows, but none matched itinerary assembly rules.')

  if (providerCacheItineraries.length > 0 && providerCacheFreshness !== 'historical-over-3d') {
    const cacheFreshness = providerCacheFreshnessAnnotation(providerCacheFreshness, effectiveRequest)
    const cacheItineraries = addProviderBadges(applyProviderCacheConfidence(providerCacheItineraries, providerCacheFreshness), 'supabase', false, cacheFreshness)
      .map((itinerary) => ({
        ...itinerary,
        source: itinerary.source || 'provider-cache',
        sourceProvider: 'provider-cache',
        providerBadges: ['Cached provider data', cacheFreshness.dataFreshnessLabel || 'Provider cache']
      }))
    const recoveryApplied = applyRouteIntelligenceToResults({
      request: effectiveRequest,
      itineraries: cacheItineraries,
      historicalContext,
      providerRecords: providerCacheLookup.records,
      exactFlightCount: providerCacheFlights.length,
      candidateFlightCount: providerCacheFlights.length,
      providerCacheCount: providerCacheFlights.length,
      historicalAvailabilityCount: providerCacheFlights.length
    })
    const itineraries = recoveryApplied.itineraries
    counts.finalItineraries = itineraries.length
    const cacheDeduplication = deduplicationSummary(itineraries, 'provider cache')
    if (cacheDeduplication.notes.length) warnings.push(...cacheDeduplication.notes)
    const skippedSupabaseQueryPath = skippedSupabaseDiagnostics('skipped; recent provider cache returned itinerary results')
    const debug = buildDebugMetadata({
      parsedRequest: effectiveRequest,
      supabaseResultCount: 0,
      aviationstackFallbackStatus: 'skipped; recent provider cache returned itinerary results',
      flightAwareEnrichmentStatus: 'skipped; recent provider cache returned itinerary results before live provider calls',
      finalItineraryCount: itineraries.length,
      apiResponseCounts: counts,
      routeMatching: providerCacheRouteMatching,
      supabaseQueryPath: skippedSupabaseQueryPath,
      providerCache: providerCacheDebug(providerCacheLookup, providerCacheFlights.length, itineraries.length, providerCacheFreshness),
      emptyResults,
      rateLimits,
      invalidAirportCodes,
      unsupportedAirportCodes,
      invalidDates,
      providerFallbackOrder: activeProviderFallbackOrder,
      providerStatuses: [
        providerStatus('supabase', 'success', `${itineraries.length} itinerary result${itineraries.length === 1 ? '' : 's'} found in recent provider cache table ${providerResultTableName}; live provider calls skipped.`),
        providerStatus('flightaware', 'skipped', 'Skipped because recent provider cache produced itinerary results.'),
        providerStatus('aviationstack', 'skipped', 'Skipped because recent provider cache produced itinerary results.'),
        providerStatus('planning', 'skipped', 'Skipped because cached provider results are available.')
      ],
      trueLiveDataAvailable: false,
      trueLiveDataUnavailableReason: 'Recent provider cache produced route results; these are cached provider rows, not a fresh live API response.',
      dataFreshnessMode: 'provider-cache',
      dataFreshnessExplanation: freshnessExplanationsForItineraries(itineraries, cacheFreshness.dataFreshnessRule || 'cached-provider-current'),
      testDataModeEnabled: envTestDataModeEnabled,
      safeErrors: uniqueMessages(warnings),
      deduplicationNotes: cacheDeduplication.notes,
      deduplicatedRowsRemoved: cacheDeduplication.removed,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      historicalIntelligence: recoveryApplied.historicalIntelligence
    })

    return NextResponse.json({
      ok: true,
      request: effectiveRequest,
      source: 'provider-cache-first',
      sourceLabel: 'Cached provider route data',
      dataMode: 'provider-cache',
      source_provider: 'provider-cache',
      source_checked_at: itineraries[0]?.sourceCheckedAt,
      statusMessage: `${itineraries.length} cached route result${itineraries.length === 1 ? '' : 's'} found.`,
      enrichedWithFlightAware: false,
      providerBadges: ['Cached provider data'],
      warnings: uniqueMessages(warnings),
      debug,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      historicalIntelligence: recoveryApplied.historicalIntelligence,
      count: itineraries.length,
      itineraries
    })
  }

  const { flights: flightAwareScheduleFlights, warning: flightAwareScheduleWarning, requestCount: flightAwareScheduleRequestCount, detail: flightAwareScheduleDetail } = await fetchFlightAwareScheduleFlights(effectiveRequest)
  counts.flightAwareScheduleRequests = flightAwareScheduleRequestCount
  counts.flightAwareScheduleFetched = flightAwareScheduleFlights.length
  counts.flightAwareRequested = flightAwareScheduleRequestCount
  if (flightAwareScheduleWarning) warnings.push(flightAwareScheduleWarning)
  const flightAwareScheduleLimit = rateLimitMessage('FlightAware', undefined, flightAwareScheduleWarning)
  if (flightAwareScheduleLimit) rateLimits.push(flightAwareScheduleLimit)
  if (flightAwareScheduleRequestCount > 0 && flightAwareScheduleFlights.length === 0) emptyResults.push('FlightAware live schedule search returned zero usable flight rows.')

  const flightAwareRouteMatching = summarizeRouteMatching(flightAwareScheduleFlights, effectiveRequest)
  const flightAwareItineraries = buildItinerariesFromFlights(flightAwareScheduleFlights, effectiveRequest)
  counts.flightAwareScheduleItineraries = flightAwareItineraries.length
  if (flightAwareScheduleFlights.length > 0 && flightAwareItineraries.length === 0) emptyResults.push('FlightAware returned live schedule rows, but none matched itinerary assembly rules.')
  if (flightAwareItineraries.length > 0) {
    const flightAwareScoredItineraries = addProviderBadges(flightAwareItineraries, 'flightaware', false, {
      dataFreshnessLabel: 'Live provider API data',
      dataFreshnessDetail: effectiveRequest.date ? `FlightAware live provider API schedule result checked for requested date ${effectiveRequest.date}.` : 'FlightAware live provider API schedule result checked for the current schedule window.',
      dataFreshnessRule: 'exact-requested-date',
      requestedDate: effectiveRequest.date,
      matchedDate: effectiveRequest.date,
      productionAvailability: true
    })
    const recoveryApplied = applyRouteIntelligenceToResults({
      request: effectiveRequest,
      itineraries: flightAwareScoredItineraries,
      historicalContext,
      providerRecords: providerCacheLookup.records,
      exactFlightCount: flightAwareScheduleFlights.length,
      candidateFlightCount: flightAwareScheduleFlights.length,
      providerCacheCount: providerCacheFlights.length,
      historicalAvailabilityCount: providerCacheFlights.length
    })
    const itineraries = recoveryApplied.itineraries
    counts.finalItineraries = itineraries.length
    const flightAwareDeduplication = deduplicationSummary(itineraries, 'FlightAware')
    if (flightAwareDeduplication.notes.length) warnings.push(...flightAwareDeduplication.notes)
    const skippedSupabaseQueryPath = skippedSupabaseDiagnostics('skipped; FlightAware live schedules returned itinerary results')
    const debug = buildDebugMetadata({
      parsedRequest: effectiveRequest,
      supabaseResultCount: 0,
      aviationstackFallbackStatus: 'skipped; FlightAware live schedules returned itinerary results',
      flightAwareEnrichmentStatus: flightAwareScheduleDetail || `${flightAwareItineraries.length} FlightAware live itinerary result${flightAwareItineraries.length === 1 ? '' : 's'} returned`,
      finalItineraryCount: itineraries.length,
      apiResponseCounts: counts,
      routeMatching: flightAwareRouteMatching,
      supabaseQueryPath: skippedSupabaseQueryPath,
      emptyResults,
      rateLimits,
      invalidAirportCodes,
      unsupportedAirportCodes,
      invalidDates,
      providerFallbackOrder: activeProviderFallbackOrder,
      providerStatuses: [
        providerStatus('flightaware', 'success', `${flightAwareItineraries.length} itinerary result${flightAwareItineraries.length === 1 ? '' : 's'} found from ${flightAwareScheduleFlights.length} live FlightAware schedule row${flightAwareScheduleFlights.length === 1 ? '' : 's'}.`),
        providerStatus('supabase', 'skipped', 'Skipped because FlightAware live schedules produced itinerary results.'),
        providerStatus('aviationstack', 'skipped', 'Skipped because FlightAware live schedules produced itinerary results.'),
        providerStatus('planning', 'skipped', 'Skipped because live provider results are available.')
      ],
      trueLiveDataAvailable: true,
      trueLiveDataUnavailableReason: '',
      dataFreshnessMode: 'live-current-api',
      dataFreshnessExplanation: freshnessExplanationsForItineraries(itineraries, 'exact-requested-date'),
      testDataModeEnabled: envTestDataModeEnabled,
      safeErrors: uniqueMessages(warnings),
      deduplicationNotes: flightAwareDeduplication.notes,
      deduplicatedRowsRemoved: flightAwareDeduplication.removed,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      normalizedFlightAwareItinerarySample: safeNormalizedItinerarySample(itineraries[0])
    })

    return NextResponse.json({
      ok: true,
      request: effectiveRequest,
      source: 'flightaware-live-schedules-first',
      sourceLabel: sourceLabel('flightaware', false),
      dataMode: 'live',
      source_provider: 'flightaware',
      source_checked_at: itineraries[0]?.sourceCheckedAt,
      statusMessage: `${itineraries.length} live itinerary result${itineraries.length === 1 ? '' : 's'} found through FlightAware.`,
      enrichedWithFlightAware: true,
      providerBadges: [providerLabels.flightaware],
      warnings: uniqueMessages(warnings),
      debug,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      historicalIntelligence: recoveryApplied.historicalIntelligence,
      count: itineraries.length,
      itineraries
    })
  }

  const { flights: supabaseFlights, warning: supabaseWarning, queryDiagnostics: supabaseQueryPath } = await fetchSupabaseFlights(effectiveRequest)
  counts.supabaseFetched = supabaseFlights.length
  const nearestDateMatch = personalTestingMode
    ? nearestDateRequestForPersonalTesting(supabaseFlights, effectiveRequest, personalTestingToleranceDays)
    : { request: effectiveRequest, nearestDateApplied: false, closestAvailableDates: [] as string[] }
  const matchingRequest = nearestDateMatch.request
  const routeMatching = summarizeRouteMatching(supabaseFlights, matchingRequest, {
    requestedDate: effectiveRequest.date,
    effectiveMatchDate: matchingRequest.date,
    nearestDateApplied: nearestDateMatch.nearestDateApplied,
    nearestDateToleranceDays: personalTestingMode ? personalTestingToleranceDays : undefined
  })
  const supabaseMatchedFlights = supabaseFlights.filter((flight) => flightMatchesRequest(flight, matchingRequest))
  counts.supabaseMatchedFlights = supabaseMatchedFlights.length
  if (supabaseWarning) warnings.push(supabaseWarning)
  if (routeMatching.dateCoverage.warning) warnings.push(routeMatching.dateCoverage.warning)
  if (routeMatching.dateCoverage.nearestDateApplied) warnings.push(`Personal Testing Mode matched nearest available date ${routeMatching.dateCoverage.effectiveMatchDate} within ${personalTestingToleranceDays} days of requested date ${routeMatching.dateCoverage.requestedSearchDate}; not a production strict-date result.`)
  if (supabaseFlights.length === 0) emptyResults.push('Supabase returned zero flight rows.')
  if (supabaseFlights.length > 0 && supabaseMatchedFlights.length === 0) emptyResults.push(routeMatching.matchExplanation)

  const supabaseItineraries = buildItinerariesFromFlights(supabaseFlights, matchingRequest)
  counts.supabaseItineraries = supabaseItineraries.length
  const supabaseAllowedInActiveMode = envTestDataModeEnabled || Boolean(effectiveRequest.date && !routeMatching.dateCoverage.nearestDateApplied)
  if (supabaseItineraries.length > 0 && !supabaseAllowedInActiveMode) {
    const strictDateMessage = effectiveRequest.date
      ? 'Stored Supabase rows were not exact requested-date matches, so production-safe mode hid them from itinerary availability.'
      : 'Stored Supabase rows require an exact requested date in production-safe mode, so flexible-date stored results are hidden from itinerary availability.'
    warnings.push(strictDateMessage)
    emptyResults.push(strictDateMessage)
  }
  if (supabaseItineraries.length > 0 && supabaseAllowedInActiveMode) {
    const itineraryFlightIdents = new Set(supabaseItineraries.flatMap((itinerary) => itinerary.legs.map((leg) => leg.flightNumber.replace(/\s+/g, '')).filter(Boolean)))
    const supabaseFlightsToEnrich = supabaseFlights
      .filter((flight) => {
        const ident = flightIdent(flight)
        return flightMatchesRequest(flight, matchingRequest) || (ident ? itineraryFlightIdents.has(ident) : false)
      })
      .slice(0, 8)
    const { enrichments, warning: flightAwareWarning, status: flightAwareStatus, requestedCount } = await enrichWithFlightAware(supabaseFlightsToEnrich)
    counts.flightAwareRequested = requestedCount
    counts.flightAwareEnriched = Object.keys(enrichments).length
    if (flightAwareWarning) warnings.push(flightAwareWarning)
    const flightAwareLimit = rateLimitMessage('FlightAware', undefined, flightAwareWarning)
    if (flightAwareLimit) rateLimits.push(flightAwareLimit)
    const enrichedItineraries = buildItinerariesFromFlights(supabaseFlights, matchingRequest, enrichments)
    const enriched = Object.keys(enrichments).length > 0
    const supabaseFreshness = routeMatching.dateCoverage.nearestDateApplied
      ? {
          dataFreshnessLabel: 'Nearest-date testing data',
          dataFreshnessDetail: `Requested ${routeMatching.dateCoverage.requestedSearchDate}; matched stored Supabase date ${routeMatching.dateCoverage.effectiveMatchDate}. This is nearest-date testing data, not live provider API data.`,
          dataFreshnessRule: 'nearest-date-testing-match' as const,
          dataFreshnessWarning: `Not production availability: requested ${routeMatching.dateCoverage.requestedSearchDate}, showing nearest available stored Supabase date ${routeMatching.dateCoverage.effectiveMatchDate}.`,
          requestedDate: routeMatching.dateCoverage.requestedSearchDate,
          matchedDate: routeMatching.dateCoverage.effectiveMatchDate,
          productionAvailability: false
        }
      : effectiveRequest.date
        ? {
          dataFreshnessLabel: 'Exact requested date',
          dataFreshnessDetail: `Stored Supabase flight row matches requested date ${effectiveRequest.date}; still stored data, not a current provider API response.`,
          dataFreshnessRule: 'exact-requested-date' as const,
          requestedDate: effectiveRequest.date,
          matchedDate: routeMatching.dateCoverage.effectiveMatchDate || effectiveRequest.date,
          productionAvailability: false
        }
      : {
          dataFreshnessLabel: 'Stored historical data',
          dataFreshnessDetail: 'Stored Supabase flight row; no strict requested date was supplied. Treat this as historical stored data, not production availability.',
          dataFreshnessRule: 'stored-historical-data' as const,
          requestedDate: undefined,
          matchedDate: routeMatching.dateCoverage.effectiveMatchDate,
          productionAvailability: false
        }
    const supabaseScoredItineraries = addProviderBadges(enrichedItineraries.length ? enrichedItineraries : supabaseItineraries, 'supabase', enriched, supabaseFreshness)
    const recoveryApplied = applyRouteIntelligenceToResults({
      request: effectiveRequest,
      itineraries: supabaseScoredItineraries,
      historicalContext,
      providerRecords: providerCacheLookup.records,
      exactFlightCount: supabaseMatchedFlights.length,
      candidateFlightCount: supabaseFlights.length,
      providerCacheCount: providerCacheFlights.length,
      historicalAvailabilityCount: Math.max(providerCacheFlights.length, supabaseMatchedFlights.length)
    })
    const itineraries = recoveryApplied.itineraries
    counts.finalItineraries = itineraries.length
    const supabaseDeduplication = deduplicationSummary(itineraries, 'Supabase')
    if (supabaseDeduplication.notes.length) warnings.push(...supabaseDeduplication.notes)
    const debug = buildDebugMetadata({
      parsedRequest: effectiveRequest,
      supabaseResultCount: supabaseItineraries.length,
      aviationstackFallbackStatus: 'not needed; Supabase returned matching flights',
      flightAwareEnrichmentStatus: flightAwareStatus,
      finalItineraryCount: itineraries.length,
      apiResponseCounts: counts,
      routeMatching,
      supabaseQueryPath,
      emptyResults,
      rateLimits,
      invalidAirportCodes,
      unsupportedAirportCodes,
      invalidDates,
      providerFallbackOrder: activeProviderFallbackOrder,
      providerStatuses: [
        providerStatus('supabase', 'success', supabaseMatchedFlights.length > 0
          ? `${supabaseItineraries.length} itinerary result${supabaseItineraries.length === 1 ? '' : 's'} found from ${supabaseMatchedFlights.length} exact matched Supabase flight record${supabaseMatchedFlights.length === 1 ? '' : 's'} via ${supabaseQueryPath.usedPath}.`
          : `${supabaseItineraries.length} connecting itinerary result${supabaseItineraries.length === 1 ? '' : 's'} assembled from Supabase candidate rows, but no single direct row matched the normalized route. ${routeMatching.matchExplanation}`),
        providerStatus('aviationstack', 'skipped', 'Skipped because stored Supabase data produced itinerary results.'),
        providerStatus('flightaware', enriched ? 'success' : flightAwareScheduleWarning ? 'warning' : 'skipped', `${flightAwareScheduleDetail}; stored-result enrichment status: ${flightAwareStatus}.`),
        providerStatus('planning', 'skipped', 'Skipped because stored provider results are available.')
      ],
      trueLiveDataAvailable: false,
      trueLiveDataUnavailableReason: trueLiveUnavailableReason('supabase', routeMatching),
      dataFreshnessMode: routeMatching.dateCoverage.nearestDateApplied ? 'nearest-date-testing' : 'stored-supabase',
      dataFreshnessExplanation: freshnessExplanationsForItineraries(itineraries, routeMatching.dateCoverage.nearestDateApplied ? 'nearest-date-testing-match' : effectiveRequest.date ? 'exact-requested-date' : 'stored-historical-data'),
      testDataModeEnabled: envTestDataModeEnabled,
      safeErrors: uniqueMessages(warnings),
      deduplicationNotes: supabaseDeduplication.notes,
      deduplicatedRowsRemoved: supabaseDeduplication.removed,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      historicalIntelligence: recoveryApplied.historicalIntelligence
    })
    return NextResponse.json({
      ok: true,
      request: effectiveRequest,
      source: 'supabase-flights-first',
      sourceLabel: sourceLabel('supabase', enriched),
      dataMode: routeMatching.dateCoverage.nearestDateApplied ? 'nearest-date-testing' : 'stored-supabase',
      source_provider: 'supabase',
      source_checked_at: itineraries[0]?.sourceCheckedAt,
      statusMessage: routeMatching.dateCoverage.nearestDateApplied
        ? `${itineraries.length} nearest-date testing itinerary result${itineraries.length === 1 ? '' : 's'} found in stored Supabase data for ${routeMatching.dateCoverage.effectiveMatchDate}; requested ${routeMatching.dateCoverage.requestedSearchDate}.`
        : `${itineraries.length} itinerary result${itineraries.length === 1 ? '' : 's'} found in stored Supabase data.`,
      enrichedWithFlightAware: enriched,
      providerBadges: enriched ? [providerLabels.supabase, providerLabels.flightaware] : [providerLabels.supabase],
      warnings: uniqueMessages(warnings),
      debug,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      historicalIntelligence: recoveryApplied.historicalIntelligence,
      count: itineraries.length,
      itineraries
    })
  }

  warnings.push('No matching FlightAware live API or stored Supabase flights found; trying Aviationstack fallback')
  const { flights: aviationstackFlights, warning: aviationstackWarning, requestCount: aviationstackRequestCount } = await fetchAviationstackFlights(effectiveRequest)
  counts.aviationstackRequests = aviationstackRequestCount
  counts.aviationstackFetched = aviationstackFlights.length
  if (aviationstackWarning) warnings.push(aviationstackWarning)
  const aviationstackLimit = rateLimitMessage('Aviationstack', undefined, aviationstackWarning)
  if (aviationstackLimit) rateLimits.push(aviationstackLimit)
  if (aviationstackFlights.length === 0) emptyResults.push('Aviationstack fallback returned zero usable flight rows.')

  const aviationstackItineraries = buildItinerariesFromFlights(aviationstackFlights, effectiveRequest)
  counts.aviationstackItineraries = aviationstackItineraries.length
  if (aviationstackFlights.length > 0 && aviationstackItineraries.length === 0) emptyResults.push('Aviationstack returned rows, but none matched itinerary assembly rules.')
  if (aviationstackItineraries.length > 0) {
    const { enrichments, warning: flightAwareWarning, status: flightAwareStatus, requestedCount } = await enrichWithFlightAware(aviationstackFlights)
    counts.flightAwareRequested = requestedCount
    counts.flightAwareEnriched = Object.keys(enrichments).length
    if (flightAwareWarning) warnings.push(flightAwareWarning)
    const flightAwareLimit = rateLimitMessage('FlightAware', undefined, flightAwareWarning)
    if (flightAwareLimit) rateLimits.push(flightAwareLimit)
    const enrichedItineraries = buildItinerariesFromFlights(aviationstackFlights, effectiveRequest, enrichments)
    const enriched = Object.keys(enrichments).length > 0
    const aviationstackScoredItineraries = addProviderBadges(enrichedItineraries.length ? enrichedItineraries : aviationstackItineraries, 'aviationstack', enriched, {
      dataFreshnessLabel: 'Live provider API data',
      dataFreshnessDetail: effectiveRequest.date ? `Aviationstack live provider API fallback result for requested date ${effectiveRequest.date}.` : 'Aviationstack live provider API fallback result; no strict requested date was supplied.',
      dataFreshnessRule: 'exact-requested-date',
      requestedDate: effectiveRequest.date,
      matchedDate: effectiveRequest.date,
      productionAvailability: true
    })
    const recoveryApplied = applyRouteIntelligenceToResults({
      request: effectiveRequest,
      itineraries: aviationstackScoredItineraries,
      historicalContext,
      providerRecords: providerCacheLookup.records,
      exactFlightCount: aviationstackFlights.length,
      candidateFlightCount: aviationstackFlights.length,
      providerCacheCount: providerCacheFlights.length,
      historicalAvailabilityCount: providerCacheFlights.length
    })
    const itineraries = recoveryApplied.itineraries
    counts.finalItineraries = itineraries.length
    const aviationstackDeduplication = deduplicationSummary(itineraries, 'Aviationstack')
    if (aviationstackDeduplication.notes.length) warnings.push(...aviationstackDeduplication.notes)
    const aviationstackFallbackStatus = `queried; ${aviationstackFlights.length} flight record${aviationstackFlights.length === 1 ? '' : 's'} returned`
    const debug = buildDebugMetadata({
      parsedRequest: effectiveRequest,
      supabaseResultCount: 0,
      providerFallbackOrder: activeProviderFallbackOrder,
      aviationstackFallbackStatus,
      flightAwareEnrichmentStatus: flightAwareStatus,
      finalItineraryCount: itineraries.length,
      apiResponseCounts: counts,
      routeMatching,
      supabaseQueryPath,
      emptyResults,
      rateLimits,
      invalidAirportCodes,
      unsupportedAirportCodes,
      invalidDates,
      providerStatuses: [
        providerStatus('supabase', supabaseWarning ? 'warning' : 'skipped', supabaseWarning || 'No Supabase itineraries matched this request.'),
        providerStatus('aviationstack', 'success', `${aviationstackItineraries.length} matching itinerary result${aviationstackItineraries.length === 1 ? '' : 's'} found through fallback.`),
        providerStatus('flightaware', enriched ? 'success' : flightAwareScheduleWarning ? 'warning' : 'skipped', `${flightAwareScheduleDetail}; Aviationstack-result enrichment status: ${flightAwareStatus}.`),
        providerStatus('planning', 'skipped', 'Skipped because Aviationstack produced itinerary results.')
      ],
      trueLiveDataAvailable: true,
      trueLiveDataUnavailableReason: '',
      dataFreshnessMode: 'live-current-api',
      dataFreshnessExplanation: freshnessExplanationsForItineraries(itineraries, 'exact-requested-date'),
      testDataModeEnabled: envTestDataModeEnabled,
      safeErrors: uniqueMessages(warnings),
      deduplicationNotes: aviationstackDeduplication.notes,
      deduplicatedRowsRemoved: aviationstackDeduplication.removed,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      historicalIntelligence: recoveryApplied.historicalIntelligence
    })

    return NextResponse.json({
      ok: true,
      request: effectiveRequest,
      source: 'aviationstack-fallback',
      sourceLabel: sourceLabel('aviationstack', enriched),
      dataMode: 'live',
      source_provider: 'aviationstack',
      source_checked_at: itineraries[0]?.sourceCheckedAt,
      statusMessage: `${itineraries.length} itinerary result${itineraries.length === 1 ? '' : 's'} found through Aviationstack fallback.`,
      enrichedWithFlightAware: enriched,
      providerBadges: enriched ? [providerLabels.aviationstack, providerLabels.flightaware] : [providerLabels.aviationstack],
      warnings: uniqueMessages(warnings),
      debug,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      historicalIntelligence: recoveryApplied.historicalIntelligence,
      count: itineraries.length,
      itineraries
    })
  }

  const aviationstackFallbackStatus = aviationstackFlights.length
    ? `queried; ${aviationstackFlights.length} flight record${aviationstackFlights.length === 1 ? '' : 's'} returned but no itineraries matched`
    : aviationstackWarning ? 'queried; no usable flight records returned' : 'queried; no matching flights returned'

  const seedNearestDateMatch = envTestDataModeEnabled && personalTestingMode
    ? nearestDateRequestForPersonalTesting(mvpRouteSeedFlightsForRequest({ ...effectiveRequest, date: undefined }), effectiveRequest, personalTestingToleranceDays)
    : { request: effectiveRequest, nearestDateApplied: false, closestAvailableDates: [] as string[] }
  const mvpSeedFlights = envTestDataModeEnabled ? mvpRouteSeedFlightsForRequest(seedNearestDateMatch.request) : []
  const mvpSeedItineraries = envTestDataModeEnabled ? buildItinerariesFromFlights(mvpSeedFlights, seedNearestDateMatch.request) : []
  if (envTestDataModeEnabled && mvpSeedItineraries.length > 0) {
    const seedRouteMatching = summarizeRouteMatching(mvpSeedFlights, seedNearestDateMatch.request, {
      requestedDate: effectiveRequest.date,
      effectiveMatchDate: seedNearestDateMatch.request.date,
      nearestDateApplied: seedNearestDateMatch.nearestDateApplied,
      nearestDateToleranceDays: personalTestingMode ? personalTestingToleranceDays : undefined
    })
    const seedScoredItineraries = addProviderBadges(mvpSeedItineraries, 'supabase', false, {
      dataFreshnessLabel: seedRouteMatching.dateCoverage.nearestDateApplied ? 'Nearest-date testing data' : 'Demo fallback data',
      dataFreshnessDetail: seedRouteMatching.dateCoverage.nearestDateApplied
        ? `Requested ${seedRouteMatching.dateCoverage.requestedSearchDate}; matched static test-data date ${seedRouteMatching.dateCoverage.effectiveMatchDate}. This is nearest-date testing data, not live provider API data.`
        : `Static MVP seed date ${mvpRouteSeedDate}; demo fallback data, not live provider API data.`,
      dataFreshnessRule: seedRouteMatching.dateCoverage.nearestDateApplied ? 'nearest-date-testing-match' : 'demo-fallback',
      dataFreshnessWarning: seedRouteMatching.dateCoverage.nearestDateApplied
        ? `Not production availability: requested ${seedRouteMatching.dateCoverage.requestedSearchDate}, showing nearest static test-data date ${seedRouteMatching.dateCoverage.effectiveMatchDate}.`
        : 'Demo fallback data is not production availability.',
      requestedDate: seedRouteMatching.dateCoverage.requestedSearchDate,
      matchedDate: seedRouteMatching.dateCoverage.effectiveMatchDate || mvpRouteSeedDate,
      productionAvailability: false
    })
    const recoveryApplied = applyRouteIntelligenceToResults({
      request: effectiveRequest,
      itineraries: seedScoredItineraries,
      historicalContext,
      providerRecords: providerCacheLookup.records,
      exactFlightCount: 0,
      candidateFlightCount: mvpSeedFlights.length,
      providerCacheCount: providerCacheFlights.length,
      historicalAvailabilityCount: providerCacheFlights.length
    })
    const itineraries = recoveryApplied.itineraries
    counts.finalItineraries = itineraries.length
    const seedMessage = seedRouteMatching.dateCoverage.nearestDateApplied
      ? `Showing ${itineraries.length} MVP test-data nearest-date itinerary card${itineraries.length === 1 ? '' : 's'} for ${seedRouteMatching.dateCoverage.effectiveMatchDate}; requested ${seedRouteMatching.dateCoverage.requestedSearchDate}. These static seed rows are not live flight data.`
      : `Showing ${itineraries.length} MVP test-data itinerary card${itineraries.length === 1 ? '' : 's'} for personal testing. These are static seed rows dated ${mvpRouteSeedDate}, not live flight data.`
    const finalWarnings = uniqueMessages([...warnings, seedRouteMatching.dateCoverage.warning, seedMessage].filter(Boolean) as string[])
    const debug = buildDebugMetadata({
      parsedRequest: effectiveRequest,
      supabaseResultCount: 0,
      providerFallbackOrder: activeProviderFallbackOrder,
      aviationstackFallbackStatus,
      flightAwareEnrichmentStatus: 'skipped; MVP route seed data is static test data',
      finalItineraryCount: itineraries.length,
      apiResponseCounts: counts,
      routeMatching: seedRouteMatching,
      supabaseQueryPath,
      emptyResults,
      rateLimits,
      invalidAirportCodes,
      unsupportedAirportCodes,
      invalidDates,
      providerStatuses: [
        providerStatus('supabase', supabaseWarning ? 'warning' : 'skipped', supabaseWarning || 'No Supabase itineraries matched this request.'),
        providerStatus('aviationstack', aviationstackWarning ? 'warning' : 'skipped', aviationstackFallbackStatus),
        providerStatus('flightaware', flightAwareScheduleWarning ? 'warning' : 'skipped', `${flightAwareScheduleDetail}; skipped enrichment because MVP seed rows are static test data.`),
        providerStatus('planning', 'success', 'MVP route seed test-data cards are active for personal testing.')
      ],
      trueLiveDataAvailable: false,
      trueLiveDataUnavailableReason: trueLiveUnavailableReason('mvp-test-data'),
      dataFreshnessMode: seedRouteMatching.dateCoverage.nearestDateApplied ? 'nearest-date-testing' : 'mvp-test-data',
      dataFreshnessExplanation: freshnessExplanationsForItineraries(itineraries, seedRouteMatching.dateCoverage.nearestDateApplied ? 'nearest-date-testing-match' : 'demo-fallback'),
      testDataModeEnabled: envTestDataModeEnabled,
      safeErrors: finalWarnings
    })

    return NextResponse.json({
      ok: true,
      request: effectiveRequest,
      source: 'mvp-route-seed-test-data',
      sourceLabel: 'MVP route seed test data',
      dataMode: seedRouteMatching.dateCoverage.nearestDateApplied ? 'nearest-date-testing' : 'test-data',
      source_provider: 'demo',
      source_checked_at: undefined,
      statusMessage: seedMessage,
      errorMessage: seedMessage,
      enrichedWithFlightAware: false,
      providerBadges: ['MVP test data'],
      warnings: finalWarnings,
      debug,
      recoveryIntelligence: recoveryApplied.recoveryIntelligence,
      historicalIntelligence: recoveryApplied.historicalIntelligence,
      count: itineraries.length,
      itineraries
    })
  }

  const routeCoverageSuggestions = await routeCoverageFallbackGuidance(effectiveRequest, rateLimits)
  const recoveryIntelligence = buildRecoveryIntelligence({
    request: effectiveRequest,
    itineraries: [],
    routeCoverageSuggestions,
    exactFlightCount: 0,
    candidateFlightCount: supabaseFlights.length + aviationstackFlights.length + flightAwareScheduleFlights.length,
    providerCacheCount: providerCacheFlights.length,
    historicalAvailabilityCount: Math.max(providerCacheFlights.length, routeCoverageSuggestions.reduce((total, suggestion) => total + suggestion.providerResultCount, 0)),
    communityReportCount: historicalContext.communityLoadReports.length
  })
  const historicalIntelligence = buildHistoricalRouteIntelligence({
    request: effectiveRequest,
    itineraries: [],
    providerRecords: providerCacheLookup.records,
    outcomes: historicalContext.outcomes,
    communityLoadReports: historicalContext.communityLoadReports,
    recoveryIntelligence
  })
  const routeFrameworkItineraries = buildCompleteRouteFrameworkItineraries({
    request: effectiveRequest,
    routeCoverageSuggestions,
    providerRecords: providerCacheLookup.records,
    recoveryIntelligence,
    historicalIntelligence,
    limit: 5
  })
  counts.finalItineraries = routeFrameworkItineraries.length
  const routeCoverageMessage = routeFrameworkItineraries.length
    ? `${routeFrameworkItineraries.length} complete route framework${routeFrameworkItineraries.length === 1 ? '' : 's'} ranked for ${effectiveRequest.origin} → ${effectiveRequest.destination}. Live availability unavailable.`
    : undefined
  const noResultsMessage = routeFrameworkItineraries.length
    ? 'Top route frameworks currently available'
    : envTestDataModeEnabled
      ? 'No live provider API, stored Supabase, fallback-provider flights, or complete route frameworks found for this search.'
      : 'No current live itinerary availability or complete route frameworks found for this search.'
  const finalWarnings = uniqueMessages([...warnings, routeCoverageMessage, routeFrameworkItineraries.length ? undefined : noResultsMessage])
  const debug = buildDebugMetadata({
    parsedRequest: effectiveRequest,
    supabaseResultCount: 0,
    aviationstackFallbackStatus,
    flightAwareEnrichmentStatus: 'skipped; no known live flight numbers available to enrich',
    finalItineraryCount: routeFrameworkItineraries.length,
    apiResponseCounts: counts,
    routeMatching,
    supabaseQueryPath,
    emptyResults,
    rateLimits,
    invalidAirportCodes,
    unsupportedAirportCodes,
    invalidDates,
    providerStatuses: [
      providerStatus('supabase', supabaseWarning ? 'warning' : 'skipped', supabaseWarning || 'No Supabase itineraries matched this request.'),
      providerStatus('aviationstack', aviationstackWarning ? 'warning' : 'skipped', aviationstackFallbackStatus),
      providerStatus('flightaware', flightAwareScheduleWarning ? 'warning' : 'skipped', `${flightAwareScheduleDetail}; no later provider returned known flight numbers to enrich.`),
      providerStatus('planning', routeFrameworkItineraries.length ? 'success' : envTestDataModeEnabled ? 'success' : 'skipped', routeFrameworkItineraries.length
        ? `${routeFrameworkItineraries.length} complete route framework${routeFrameworkItineraries.length === 1 ? '' : 's'} returned as planning guidance without live availability claims.`
        : envTestDataModeEnabled
          ? 'Clearly marked demo fallback cards are active in the UI for personal testing.'
          : 'Demo fallback cards are disabled because NONREVY_TEST_DATA_MODE is not true.')
    ],
    providerFallbackOrder: activeProviderFallbackOrder,
    trueLiveDataAvailable: false,
    trueLiveDataUnavailableReason: routeFrameworkItineraries.length
      ? 'No exact live itinerary availability was available; route solution planner returned complete ranked route frameworks without displaying unavailable flights.'
      : envTestDataModeEnabled ? trueLiveUnavailableReason('planning') : 'No current live provider API or exact-date stored Supabase data was available; production-safe mode hid nearest-date testing and demo fallback availability.',
    dataFreshnessMode: routeFrameworkItineraries.length ? 'no-current-live-data' : envTestDataModeEnabled ? 'demo-fallback' : 'no-current-live-data',
    dataFreshnessExplanation: routeFrameworkItineraries.length
      ? [freshnessRuleExplanation('route-framework')]
      : envTestDataModeEnabled
        ? [freshnessRuleExplanation('demo-fallback')]
        : ['Production-safe mode: no live provider API or exact requested-date stored Supabase itinerary was available, so nearest-date testing and demo fallback cards are hidden.'],
    testDataModeEnabled: envTestDataModeEnabled,
    safeErrors: finalWarnings,
    routeCoverageSuggestions,
    recoveryIntelligence,
    historicalIntelligence
  })

  return NextResponse.json({
    ok: true,
    request: effectiveRequest,
    source: 'planning-fallback',
    sourceLabel: routeFrameworkItineraries.length ? 'Complete route frameworks' : envTestDataModeEnabled ? sourceLabel('planning', false) : 'No current live data',
    dataMode: routeFrameworkItineraries.length ? 'route-frameworks' : envTestDataModeEnabled ? 'fallback' : 'no-current-live-data',
    source_provider: routeFrameworkItineraries.length ? 'route-framework' : envTestDataModeEnabled ? 'demo' : 'none',
    source_checked_at: undefined,
    statusMessage: noResultsMessage,
    errorMessage: noResultsMessage,
    enrichedWithFlightAware: false,
    providerBadges: routeFrameworkItineraries.length ? ['Route framework only', 'Live availability unavailable'] : envTestDataModeEnabled ? [providerLabels.planning] : ['Production-safe mode'],
    warnings: finalWarnings,
    debug,
    routeCoverageSuggestions,
    recoveryIntelligence,
    historicalIntelligence,
    count: routeFrameworkItineraries.length,
    itineraries: routeFrameworkItineraries
  })
}

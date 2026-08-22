import { type SearchTripType } from './searchPipeline'
import { type TripMission } from './tripMission'
import { type TravelerProfileScaffold } from './travelerProfile'
import {
  createLegacyExecutionProviderAdapter,
  ProviderManager,
  type ProviderHealth,
  type ProviderManagerRunResult
} from './providerManager'

export type SearchExecutionProviderReadiness = {
  enabled: boolean
  status: 'ready' | 'disabled' | 'credential_missing' | 'unavailable' | 'configured' | 'degraded' | 'rate_limited' | 'quota_exhausted' | 'invalid_key' | 'network_failure' | 'provider_unavailable' | 'timed_out' | 'unsupported_request'
  message?: string
}

export type SearchExecutionProviderCapabilities = {
  schedules?: boolean
  flightStatus?: boolean
  carrierIdentity?: boolean
  providerTimestamps?: boolean
  airportMetadata?: boolean
  aircraftMetadata?: boolean
  loads?: boolean
  fares?: boolean
  zedEligibility?: boolean
  weather?: boolean
  routeSearch?: boolean
}

export type SearchExecutionProviderAttribution = {
  providerId: string
  providerName: string
  providerRecordIds?: string[]
  fetchedAt?: string
  fields?: string[]
  freshnessAgeMs?: number
}

export type SearchExecutionSegment = {
  origin: string
  destination: string
  transportType: 'flight' | 'rail' | 'ferry' | 'car' | 'surface'
  carrier?: string
  airlineCode?: string
  airlineName?: string
  flightNumber?: string
  departureTime?: string
  arrivalTime?: string
  scheduledDeparture?: string
  scheduledArrival?: string
  scheduledDepartureUtc?: string
  scheduledArrivalUtc?: string
  departureTimeZone?: string
  arrivalTimeZone?: string
  departureAirportTimeZone?: string
  arrivalAirportTimeZone?: string
  estimatedDeparture?: string
  estimatedArrival?: string
  actualDeparture?: string
  actualArrival?: string
  seatCount?: string
  duration?: string
  scheduleStatus?: string
  flightStatus?: string
  loadStatus?: string
  departureTerminal?: string
  arrivalTerminal?: string
  departureGate?: string
  arrivalGate?: string
  aircraftRegistration?: string
  aircraftIata?: string
  aircraftIcao?: string
  codeshareInformation?: string[]
  providerId?: string
  providerRecordId?: string
  fetchedAt?: string
  sourceConfidence?: 'provider_reported' | 'partial_provider_reported'
  providerSuppliedFields?: string[]
  notes?: string[]
}

export type SearchExecutionItinerary = {
  id?: string
  providerAttribution?: SearchExecutionProviderAttribution[]
  segments: SearchExecutionSegment[]
  dataQuality?: 'high' | 'medium' | 'low'
  warnings?: string[]
}

export type SearchExecutionRequest = {
  mission: TripMission
  tripType: SearchTripType
  travelerCount: number
  travelerProfile: TravelerProfileScaffold
  routeSegments?: Array<{
    origin: string
    destination: string
    transportType: SearchExecutionSegment['transportType']
    carrier?: string
    journeyDate?: string
    itineraryId?: string
    segmentIndex?: number
  }>
}

export type SearchExecutionProviderResult = {
  itineraries: SearchExecutionItinerary[]
  warnings?: string[]
  status?: SearchExecutionProviderRun['status']
  diagnostics?: SearchExecutionProviderRun['diagnostics']
}

export type SearchExecutionProvider = {
  id: string
  name: string
  readiness: SearchExecutionProviderReadiness
  capabilities: SearchExecutionProviderCapabilities
  search: (request: SearchExecutionRequest) => Promise<SearchExecutionProviderResult>
}

export type SearchExecutionProviderRun = {
  providerId: string
  providerName: string
  status: 'success' | 'skipped' | 'failed' | 'timeout' | 'degraded' | 'rate_limited' | 'quota_exhausted' | 'invalid_key' | 'network_failure' | 'provider_unavailable' | 'unsupported_request'
  readiness: SearchExecutionProviderReadiness
  capabilities: SearchExecutionProviderCapabilities
  itineraryCount: number
  warnings: string[]
  diagnostics?: {
    lastRequestStatus?: string
    responseLatencyMs?: number
    recordsReceived?: number
    recordsNormalized?: number
    recordsMatched?: number
    recordsUnmatched?: number
    errorCategory?: string
    retryUsed?: boolean
    fetchedAt?: string
    cached?: boolean
    cacheAgeMs?: number
    requestCount?: number
  }
}

export type SearchExecutionResult = {
  request: SearchExecutionRequest
  itineraries: SearchExecutionItinerary[]
  providerRuns: SearchExecutionProviderRun[]
  providerHealth: ProviderHealth[]
  warnings: string[]
  dataQuality: 'high' | 'medium' | 'low'
}

export type SearchExecutionEngineOptions = {
  providers?: SearchExecutionProvider[]
  providerManager?: ProviderManager
  timeoutMs?: number
}

const defaultTimeoutMs = 7000

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function known(value: unknown) {
  return typeof value === 'string' && value.trim() && !/^unknown\b|^not provided\b|^live load unavailable\b/i.test(value.trim())
}

function normalizeSegment(segment: SearchExecutionSegment): SearchExecutionSegment {
  return {
    origin: normalizeCode(segment.origin),
    destination: normalizeCode(segment.destination),
    transportType: segment.transportType,
    ...(known(segment.carrier) ? { carrier: normalizeCode(segment.carrier) } : {}),
    ...(known(segment.airlineCode) ? { airlineCode: normalizeCode(segment.airlineCode) } : {}),
    ...(known(segment.airlineName) ? { airlineName: String(segment.airlineName).trim() } : {}),
    ...(known(segment.flightNumber) ? { flightNumber: String(segment.flightNumber).trim().toUpperCase() } : {}),
    ...(known(segment.departureTime) ? { departureTime: String(segment.departureTime).trim() } : {}),
    ...(known(segment.arrivalTime) ? { arrivalTime: String(segment.arrivalTime).trim() } : {}),
    ...(known(segment.scheduledDeparture) ? { scheduledDeparture: String(segment.scheduledDeparture).trim() } : {}),
    ...(known(segment.scheduledArrival) ? { scheduledArrival: String(segment.scheduledArrival).trim() } : {}),
    ...(known(segment.scheduledDepartureUtc) ? { scheduledDepartureUtc: String(segment.scheduledDepartureUtc).trim() } : {}),
    ...(known(segment.scheduledArrivalUtc) ? { scheduledArrivalUtc: String(segment.scheduledArrivalUtc).trim() } : {}),
    ...(known(segment.departureTimeZone) ? { departureTimeZone: String(segment.departureTimeZone).trim() } : {}),
    ...(known(segment.arrivalTimeZone) ? { arrivalTimeZone: String(segment.arrivalTimeZone).trim() } : {}),
    ...(known(segment.departureAirportTimeZone) ? { departureAirportTimeZone: String(segment.departureAirportTimeZone).trim() } : {}),
    ...(known(segment.arrivalAirportTimeZone) ? { arrivalAirportTimeZone: String(segment.arrivalAirportTimeZone).trim() } : {}),
    ...(known(segment.estimatedDeparture) ? { estimatedDeparture: String(segment.estimatedDeparture).trim() } : {}),
    ...(known(segment.estimatedArrival) ? { estimatedArrival: String(segment.estimatedArrival).trim() } : {}),
    ...(known(segment.actualDeparture) ? { actualDeparture: String(segment.actualDeparture).trim() } : {}),
    ...(known(segment.actualArrival) ? { actualArrival: String(segment.actualArrival).trim() } : {}),
    ...(known(segment.seatCount) ? { seatCount: String(segment.seatCount).trim() } : {}),
    ...(known(segment.duration) ? { duration: String(segment.duration).trim() } : {}),
    ...(known(segment.scheduleStatus) ? { scheduleStatus: String(segment.scheduleStatus).trim() } : {}),
    ...(known(segment.flightStatus) ? { flightStatus: String(segment.flightStatus).trim() } : {}),
    ...(known(segment.loadStatus) ? { loadStatus: String(segment.loadStatus).trim() } : {}),
    ...(known(segment.departureTerminal) ? { departureTerminal: String(segment.departureTerminal).trim() } : {}),
    ...(known(segment.arrivalTerminal) ? { arrivalTerminal: String(segment.arrivalTerminal).trim() } : {}),
    ...(known(segment.departureGate) ? { departureGate: String(segment.departureGate).trim() } : {}),
    ...(known(segment.arrivalGate) ? { arrivalGate: String(segment.arrivalGate).trim() } : {}),
    ...(known(segment.aircraftRegistration) ? { aircraftRegistration: String(segment.aircraftRegistration).trim() } : {}),
    ...(known(segment.aircraftIata) ? { aircraftIata: String(segment.aircraftIata).trim().toUpperCase() } : {}),
    ...(known(segment.aircraftIcao) ? { aircraftIcao: String(segment.aircraftIcao).trim().toUpperCase() } : {}),
    ...(segment.codeshareInformation?.length ? { codeshareInformation: uniqueStrings(segment.codeshareInformation) } : {}),
    ...(known(segment.providerId) ? { providerId: String(segment.providerId).trim() } : {}),
    ...(known(segment.providerRecordId) ? { providerRecordId: String(segment.providerRecordId).trim() } : {}),
    ...(known(segment.fetchedAt) ? { fetchedAt: String(segment.fetchedAt).trim() } : {}),
    ...(segment.sourceConfidence ? { sourceConfidence: segment.sourceConfidence } : {}),
    ...(segment.providerSuppliedFields?.length ? { providerSuppliedFields: uniqueStrings(segment.providerSuppliedFields) } : {}),
    notes: uniqueStrings(segment.notes || [])
  }
}

function attributionFor(provider: SearchExecutionProvider): SearchExecutionProviderAttribution {
  return { providerId: provider.id, providerName: provider.name }
}

function normalizeItinerary(itinerary: SearchExecutionItinerary, provider: SearchExecutionProvider): SearchExecutionItinerary {
  return {
    ...itinerary,
    providerAttribution: mergeAttribution(itinerary.providerAttribution || [], [attributionFor(provider)]),
    segments: itinerary.segments.map(normalizeSegment),
    warnings: uniqueStrings(itinerary.warnings || [])
  }
}

function segmentKey(segment: SearchExecutionSegment) {
  return [
    segment.origin,
    segment.destination,
    segment.transportType,
    segment.carrier || 'unknown',
    segment.flightNumber || 'unknown',
    segment.departureTime || 'unknown'
  ].join(':')
}

export function executionItineraryDedupeKey(itinerary: SearchExecutionItinerary) {
  return itinerary.segments.map(segmentKey).join('|')
}

function mergeAttribution(
  first: SearchExecutionProviderAttribution[],
  second: SearchExecutionProviderAttribution[]
) {
  const values = new Map<string, SearchExecutionProviderAttribution>()
  ;[...first, ...second].forEach((item) => {
    if (item.providerId && !values.has(item.providerId)) values.set(item.providerId, item)
  })
  return [...values.values()].sort((a, b) => a.providerId.localeCompare(b.providerId))
}

function mergeField(current: string | undefined, next: string | undefined) {
  return known(current) ? current : known(next) ? next : current
}

function mergeSegments(first: SearchExecutionSegment, second: SearchExecutionSegment): SearchExecutionSegment {
  return {
    ...first,
    carrier: mergeField(first.carrier, second.carrier),
    airlineCode: mergeField(first.airlineCode, second.airlineCode),
    airlineName: mergeField(first.airlineName, second.airlineName),
    flightNumber: mergeField(first.flightNumber, second.flightNumber),
    departureTime: mergeField(first.departureTime, second.departureTime),
    arrivalTime: mergeField(first.arrivalTime, second.arrivalTime),
    scheduledDeparture: mergeField(first.scheduledDeparture, second.scheduledDeparture),
    scheduledArrival: mergeField(first.scheduledArrival, second.scheduledArrival),
    scheduledDepartureUtc: mergeField(first.scheduledDepartureUtc, second.scheduledDepartureUtc),
    scheduledArrivalUtc: mergeField(first.scheduledArrivalUtc, second.scheduledArrivalUtc),
    departureTimeZone: mergeField(first.departureTimeZone, second.departureTimeZone),
    arrivalTimeZone: mergeField(first.arrivalTimeZone, second.arrivalTimeZone),
    departureAirportTimeZone: mergeField(first.departureAirportTimeZone, second.departureAirportTimeZone),
    arrivalAirportTimeZone: mergeField(first.arrivalAirportTimeZone, second.arrivalAirportTimeZone),
    estimatedDeparture: mergeField(first.estimatedDeparture, second.estimatedDeparture),
    estimatedArrival: mergeField(first.estimatedArrival, second.estimatedArrival),
    actualDeparture: mergeField(first.actualDeparture, second.actualDeparture),
    actualArrival: mergeField(first.actualArrival, second.actualArrival),
    seatCount: mergeField(first.seatCount, second.seatCount),
    duration: mergeField(first.duration, second.duration),
    scheduleStatus: mergeField(first.scheduleStatus, second.scheduleStatus),
    flightStatus: mergeField(first.flightStatus, second.flightStatus),
    loadStatus: mergeField(first.loadStatus, second.loadStatus),
    departureTerminal: mergeField(first.departureTerminal, second.departureTerminal),
    arrivalTerminal: mergeField(first.arrivalTerminal, second.arrivalTerminal),
    departureGate: mergeField(first.departureGate, second.departureGate),
    arrivalGate: mergeField(first.arrivalGate, second.arrivalGate),
    aircraftRegistration: mergeField(first.aircraftRegistration, second.aircraftRegistration),
    aircraftIata: mergeField(first.aircraftIata, second.aircraftIata),
    aircraftIcao: mergeField(first.aircraftIcao, second.aircraftIcao),
    providerId: mergeField(first.providerId, second.providerId),
    providerRecordId: mergeField(first.providerRecordId, second.providerRecordId),
    fetchedAt: mergeField(first.fetchedAt, second.fetchedAt),
    sourceConfidence: first.sourceConfidence || second.sourceConfidence,
    codeshareInformation: uniqueStrings([...(first.codeshareInformation || []), ...(second.codeshareInformation || [])]),
    providerSuppliedFields: uniqueStrings([...(first.providerSuppliedFields || []), ...(second.providerSuppliedFields || [])]),
    notes: uniqueStrings([...(first.notes || []), ...(second.notes || [])])
  }
}

function mergeItinerary(first: SearchExecutionItinerary, second: SearchExecutionItinerary): SearchExecutionItinerary {
  return {
    ...first,
    providerAttribution: mergeAttribution(first.providerAttribution || [], second.providerAttribution || []),
    segments: first.segments.map((segment, index) => second.segments[index] ? mergeSegments(segment, second.segments[index]) : segment),
    warnings: uniqueStrings([...(first.warnings || []), ...(second.warnings || [])]),
    dataQuality: first.dataQuality === 'high' || second.dataQuality === 'high'
      ? 'high'
      : first.dataQuality === 'medium' || second.dataQuality === 'medium'
        ? 'medium'
        : first.dataQuality || second.dataQuality
  }
}

export function mergeProviderItineraries(itineraries: SearchExecutionItinerary[]) {
  const merged = new Map<string, SearchExecutionItinerary>()
  for (const itinerary of itineraries) {
    const key = executionItineraryDedupeKey(itinerary)
    const existing = merged.get(key)
    merged.set(key, existing ? mergeItinerary(existing, itinerary) : itinerary)
  }
  return [...merged.values()]
}

function resultDataQuality(runs: SearchExecutionProviderRun[], itineraries: SearchExecutionItinerary[]): SearchExecutionResult['dataQuality'] {
  if (!runs.length || !itineraries.length) return 'low'
  const successes = runs.filter((run) => run.status === 'success').length
  if (successes === runs.length && itineraries.some((itinerary) => itinerary.dataQuality === 'high')) return 'high'
  if (successes > 0) return 'medium'
  return 'low'
}

export class SearchExecutionEngine {
  private readonly options: SearchExecutionEngineOptions

  constructor(options: SearchExecutionEngineOptions = {}) {
    this.options = options
  }

  async execute(request: SearchExecutionRequest): Promise<SearchExecutionResult> {
    const providers = this.options.providers || []
    const providerManager = this.options.providerManager || new ProviderManager({
      providers: providers.map((provider) => createLegacyExecutionProviderAdapter(provider)),
      timeoutMs: this.options.timeoutMs || defaultTimeoutMs
    })
    const executions = await providerManager.execute(request)
    const providerRuns = executions.map((item) => item.run)
    const normalizedExecutions = executions.map((item) => normalizeManagerExecution(item))
    const itineraries = mergeProviderItineraries(normalizedExecutions.flatMap((item) => item.itineraries))
    const warnings = uniqueStrings([
      ...providerRuns.flatMap((run) => run.warnings),
      !providerManager.registeredProviders().length ? 'No search execution providers are configured.' : ''
    ])

    return {
      request,
      itineraries,
      providerRuns,
      providerHealth: executions.map((item) => item.health),
      warnings,
      dataQuality: resultDataQuality(providerRuns, itineraries)
    }
  }
}

function normalizeManagerExecution(execution: ProviderManagerRunResult): ProviderManagerRunResult {
  const provider = {
    id: execution.run.providerId,
    name: execution.run.providerName,
    readiness: execution.run.readiness,
    capabilities: execution.run.capabilities,
    search: async (): Promise<SearchExecutionProviderResult> => ({ itineraries: execution.itineraries })
  }
  const itineraries = execution.itineraries.map((itinerary) => normalizeItinerary(itinerary, provider))
  return {
    ...execution,
    itineraries
  }
}

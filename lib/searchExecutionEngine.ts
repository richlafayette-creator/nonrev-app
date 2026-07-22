import { type SearchTripType } from './searchPipeline'
import { type TripMission } from './tripMission'
import { type TravelerProfileScaffold } from './travelerProfile'

export type SearchExecutionProviderReadiness = {
  enabled: boolean
  status: 'ready' | 'disabled' | 'credential_missing' | 'unavailable'
  message?: string
}

export type SearchExecutionProviderCapabilities = {
  schedules?: boolean
  loads?: boolean
  fares?: boolean
  weather?: boolean
  routeSearch?: boolean
}

export type SearchExecutionProviderAttribution = {
  providerId: string
  providerName: string
}

export type SearchExecutionSegment = {
  origin: string
  destination: string
  transportType: 'flight' | 'rail' | 'ferry' | 'car' | 'surface'
  carrier?: string
  flightNumber?: string
  departureTime?: string
  arrivalTime?: string
  seatCount?: string
  duration?: string
  scheduleStatus?: string
  loadStatus?: string
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
}

export type SearchExecutionProviderResult = {
  itineraries: SearchExecutionItinerary[]
  warnings?: string[]
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
  status: 'success' | 'skipped' | 'failed' | 'timeout'
  readiness: SearchExecutionProviderReadiness
  capabilities: SearchExecutionProviderCapabilities
  itineraryCount: number
  warnings: string[]
}

export type SearchExecutionResult = {
  request: SearchExecutionRequest
  itineraries: SearchExecutionItinerary[]
  providerRuns: SearchExecutionProviderRun[]
  warnings: string[]
  dataQuality: 'high' | 'medium' | 'low'
}

export type SearchExecutionEngineOptions = {
  providers?: SearchExecutionProvider[]
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
    ...(known(segment.flightNumber) ? { flightNumber: String(segment.flightNumber).trim().toUpperCase() } : {}),
    ...(known(segment.departureTime) ? { departureTime: String(segment.departureTime).trim() } : {}),
    ...(known(segment.arrivalTime) ? { arrivalTime: String(segment.arrivalTime).trim() } : {}),
    ...(known(segment.seatCount) ? { seatCount: String(segment.seatCount).trim() } : {}),
    ...(known(segment.duration) ? { duration: String(segment.duration).trim() } : {}),
    ...(known(segment.scheduleStatus) ? { scheduleStatus: String(segment.scheduleStatus).trim() } : {}),
    ...(known(segment.loadStatus) ? { loadStatus: String(segment.loadStatus).trim() } : {}),
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
    flightNumber: mergeField(first.flightNumber, second.flightNumber),
    departureTime: mergeField(first.departureTime, second.departureTime),
    arrivalTime: mergeField(first.arrivalTime, second.arrivalTime),
    seatCount: mergeField(first.seatCount, second.seatCount),
    duration: mergeField(first.duration, second.duration),
    scheduleStatus: mergeField(first.scheduleStatus, second.scheduleStatus),
    loadStatus: mergeField(first.loadStatus, second.loadStatus),
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

function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Provider timed out after ${ms}ms`)), ms)
  })
}

function providerEnabled(provider: SearchExecutionProvider) {
  return provider.readiness.enabled && provider.readiness.status === 'ready'
}

async function executeProvider(provider: SearchExecutionProvider, request: SearchExecutionRequest, timeoutMs: number) {
  if (!providerEnabled(provider)) {
    return {
      itineraries: [],
      run: {
        providerId: provider.id,
        providerName: provider.name,
        status: 'skipped' as const,
        readiness: provider.readiness,
        capabilities: provider.capabilities,
        itineraryCount: 0,
        warnings: [provider.readiness.message || `${provider.name} is not ready.`]
      }
    }
  }

  try {
    const result = await Promise.race([provider.search(request), timeout<SearchExecutionProviderResult>(timeoutMs)])
    const itineraries = result.itineraries.map((itinerary) => normalizeItinerary(itinerary, provider))
    return {
      itineraries,
      run: {
        providerId: provider.id,
        providerName: provider.name,
        status: 'success' as const,
        readiness: provider.readiness,
        capabilities: provider.capabilities,
        itineraryCount: itineraries.length,
        warnings: uniqueStrings(result.warnings || [])
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : `${provider.name} provider failed.`
    return {
      itineraries: [],
      run: {
        providerId: provider.id,
        providerName: provider.name,
        status: message.includes('timed out after') ? 'timeout' as const : 'failed' as const,
        readiness: provider.readiness,
        capabilities: provider.capabilities,
        itineraryCount: 0,
        warnings: [message]
      }
    }
  }
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
    const timeoutMs = this.options.timeoutMs || defaultTimeoutMs
    const executions = await Promise.all(providers.map((provider) => executeProvider(provider, request, timeoutMs)))
    const providerRuns = executions.map((item) => item.run)
    const itineraries = mergeProviderItineraries(executions.flatMap((item) => item.itineraries))
    const warnings = uniqueStrings([
      ...providerRuns.flatMap((run) => run.warnings),
      !providers.length ? 'No search execution providers are configured.' : ''
    ])

    return {
      request,
      itineraries,
      providerRuns,
      warnings,
      dataQuality: resultDataQuality(providerRuns, itineraries)
    }
  }
}

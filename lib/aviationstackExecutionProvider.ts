import {
  createAviationstackScheduleProvider,
  createAerodataboxScheduleProvider,
  type LiveScheduleProvider,
  type NormalizedScheduleResult
} from './liveScheduleProviders'
import {
  type SearchExecutionItinerary,
  type SearchExecutionProvider,
  type SearchExecutionProviderCapabilities,
  type SearchExecutionProviderReadiness,
  type SearchExecutionProviderRun,
  type SearchExecutionRequest,
  type SearchExecutionSegment
} from './searchExecutionEngine'

type CacheEntry = {
  storedAt: number
  expiresAt: number
  response: Awaited<ReturnType<LiveScheduleProvider['searchSchedules']>>
}

export type AviationstackExecutionProviderOptions = {
  apiKey?: string
  now?: () => Date
  provider?: LiveScheduleProvider
  maxAirportPairs?: number
  maxResultsPerPair?: number
  cache?: Map<string, CacheEntry>
}

const providerId = 'aviationstack'
const providerName = 'Aviationstack'
const defaultMaxAirportPairs = 4
const defaultMaxResultsPerPair = 25
const defaultCache = new Map<string, CacheEntry>()

function configuredSecret(value?: string) {
  const trimmed = value?.trim() || ''
  if (!trimmed || /^(placeholder|changeme|change-me|your[_-]?.*|test-key-here|example|none|null|undefined)$/i.test(trimmed)) return undefined
  return trimmed
}

function iata(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(text) ? text : ''
}

function isoDate(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined
  const parsed = Date.parse(`${text}T00:00:00.000Z`)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined
}

function known(value?: string) {
  const text = value?.trim() || ''
  return Boolean(text) && !/^(unknown|not provided|pending|flight tbd|tbd)$/i.test(text)
}

function normalizedFlight(value?: string) {
  if (!known(value)) return undefined
  return value!.replace(/\s+/g, '').toUpperCase()
}

function normalizedText(value?: string) {
  return known(value) ? value!.trim() : undefined
}

function normalizedAirport(value?: string) {
  return iata(value) || undefined
}

function normalizedInstant(value?: string) {
  if (!known(value)) return undefined
  const parsed = Date.parse(value!)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

function localDateFromResult(result: NormalizedScheduleResult) {
  return result.operatingDate || normalizedInstant(result.scheduledDeparture || result.departureTime)?.slice(0, 10)
}

function resultMatchesRequest(result: NormalizedScheduleResult, pair: { origin: string; destination: string; date?: string }) {
  if (iata(result.origin) !== pair.origin || iata(result.destination) !== pair.destination) return false
  if (!pair.date) return true
  return localDateFromResult(result) === pair.date
}

function suppliedFields(result: NormalizedScheduleResult) {
  const fields: string[] = []
  const checks: Array<[string, string | undefined]> = [
    ['origin', result.origin],
    ['destination', result.destination],
    ['airlineCode', result.airlineCode || result.operatingCarrier],
    ['airlineName', result.airlineName || result.carrier],
    ['flightNumber', result.flightNumber],
    ['scheduledDeparture', result.scheduledDeparture || result.departureTime],
    ['scheduledArrival', result.scheduledArrival || result.arrivalTime],
    ['estimatedDeparture', result.estimatedDeparture],
    ['estimatedArrival', result.estimatedArrival],
    ['actualDeparture', result.actualDeparture],
    ['actualArrival', result.actualArrival],
    ['flightStatus', result.status],
    ['departureTerminal', result.departureTerminal],
    ['arrivalTerminal', result.arrivalTerminal],
    ['departureGate', result.departureGate],
    ['arrivalGate', result.arrivalGate],
    ['aircraftRegistration', result.aircraftRegistration],
    ['aircraftIata', result.aircraftIata],
    ['aircraftIcao', result.aircraftIcao],
    ['codeshareInformation', result.codeshareIdentity]
  ]
  checks.forEach(([field, value]) => {
    if (known(value)) fields.push(field)
  })
  return fields
}

function durationIfComplete(result: NormalizedScheduleResult) {
  if (known(result.duration)) return result.duration
  const departure = normalizedInstant(result.scheduledDeparture)
  const arrival = normalizedInstant(result.scheduledArrival)
  if (!departure || !arrival) return undefined
  const minutes = Math.round((Date.parse(arrival) - Date.parse(departure)) / 60000)
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`
}

function segmentFromResult(result: NormalizedScheduleResult, fetchedAt: string): SearchExecutionSegment {
  const fields = suppliedFields(result)
  const flightNumber = normalizedFlight(result.operatingFlightNumber || result.flightNumber)
  const scheduledDeparture = normalizedInstant(result.scheduledDeparture || result.departureTime)
  const scheduledArrival = normalizedInstant(result.scheduledArrival || result.arrivalTime)
  return {
    origin: iata(result.origin),
    destination: iata(result.destination),
    transportType: 'flight',
    providerId,
    providerRecordId: normalizedText(result.providerRecordId),
    airlineCode: normalizedText(result.airlineCode || result.operatingCarrier),
    airlineName: normalizedText(result.airlineName || result.carrier),
    carrier: normalizedText(result.airlineCode || result.operatingCarrier || result.carrier),
    flightNumber,
    departureTime: scheduledDeparture,
    arrivalTime: scheduledArrival,
    scheduledDeparture,
    scheduledArrival,
    estimatedDeparture: normalizedInstant(result.estimatedDeparture),
    estimatedArrival: normalizedInstant(result.estimatedArrival),
    actualDeparture: normalizedInstant(result.actualDeparture),
    actualArrival: normalizedInstant(result.actualArrival),
    duration: durationIfComplete(result),
    scheduleStatus: normalizedText(result.status) ? `Flight status: ${result.status}` : 'Schedule data supplied by Aviationstack',
    flightStatus: normalizedText(result.status),
    departureTerminal: normalizedText(result.departureTerminal),
    arrivalTerminal: normalizedText(result.arrivalTerminal),
    departureGate: normalizedText(result.departureGate),
    arrivalGate: normalizedText(result.arrivalGate),
    aircraftRegistration: normalizedText(result.aircraftRegistration),
    aircraftIata: normalizedText(result.aircraftIata),
    aircraftIcao: normalizedText(result.aircraftIcao),
    codeshareInformation: [result.codeshareIdentity, ...(result.marketingFlightNumbers || [])].filter((item): item is string => known(item)),
    fetchedAt,
    sourceConfidence: fields.includes('scheduledDeparture') && fields.includes('scheduledArrival') ? 'provider_reported' : 'partial_provider_reported',
    providerSuppliedFields: fields,
    notes: [
      'Schedule data: Aviationstack',
      `Last updated: ${fetchedAt}`,
      'Live load unavailable',
      'Aviationstack does not provide nonrev standby loads, fares, or ZED eligibility.'
    ]
  }
}

function itineraryFromResult(result: NormalizedScheduleResult, fetchedAt: string): SearchExecutionItinerary {
  const segment = segmentFromResult(result, fetchedAt)
  return {
    id: `${providerId}-${segment.providerRecordId || segment.flightNumber || segment.origin}-${segment.destination}-${segment.scheduledDeparture || fetchedAt}`,
    dataQuality: segment.sourceConfidence === 'provider_reported' ? 'high' : 'medium',
    providerAttribution: [{
      providerId,
      providerName,
      providerRecordIds: segment.providerRecordId ? [segment.providerRecordId] : [],
      fetchedAt,
      fields: segment.providerSuppliedFields,
      freshnessAgeMs: 0
    }],
    segments: [segment],
    warnings: ['Aviationstack schedule/status data does not include live nonrev load availability, fares, or ZED eligibility.']
  }
}

function routePairs(request: SearchExecutionRequest, maxPairs: number) {
  const pairs = new Map<string, { origin: string; destination: string; date?: string }>()
  const missionDate = isoDate(request.mission.departureDate)
  ;(request.routeSegments || []).forEach((segment) => {
    if (segment.transportType !== 'flight') return
    const origin = iata(segment.origin)
    const destination = iata(segment.destination)
    if (!origin || !destination) return
    const date = isoDate(segment.journeyDate) || missionDate
    pairs.set(`${origin}-${destination}-${date || 'any'}`, { origin, destination, date })
  })

  if (!pairs.size) {
    const origin = iata(request.mission.preferredDepartureAirports[0] || request.mission.originAirports[0])
    const destination = iata(request.mission.preferredDestinations[0])
    if (origin && destination) pairs.set(`${origin}-${destination}-${missionDate || 'any'}`, { origin, destination, date: missionDate })
  }

  return [...pairs.values()].slice(0, maxPairs)
}

function cacheKey(pair: { origin: string; destination: string; date?: string }, limit: number) {
  return [providerId, 'flights', pair.origin, pair.destination, pair.date || 'any-date', 'offset-0', `limit-${limit}`].join(':')
}

function ttlMs(pair: { date?: string }, now: Date, status: string) {
  if (status === 'warning' || status === 'error') return 45_000
  if (pair.date === now.toISOString().slice(0, 10)) return 3 * 60_000
  return 45 * 60_000
}

function readinessFor(apiKey?: string): SearchExecutionProviderReadiness {
  return configuredSecret(apiKey)
    ? { enabled: true, status: 'ready', message: 'Aviationstack is configured for server-side schedule/status lookup.' }
    : { enabled: false, status: 'credential_missing', message: 'Aviationstack API key missing; live schedule/status lookup skipped safely.' }
}

function capabilities(): SearchExecutionProviderCapabilities {
  return {
    schedules: true,
    flightStatus: true,
    carrierIdentity: true,
    providerTimestamps: true,
    airportMetadata: true,
    aircraftMetadata: true,
    loads: false,
    fares: false,
    zedEligibility: false,
    routeSearch: true
  }
}

function statusFromWarning(warning = ''): SearchExecutionProviderRun['status'] {
  if (/rate limit|quota|usage limit|monthly/i.test(warning)) return 'rate_limited'
  if (/unsupported|endpoint|available for this key/i.test(warning)) return 'unsupported_request'
  if (/timed out|abort/i.test(warning)) return 'timeout'
  return 'degraded'
}

function errorCategory(warning = '') {
  if (/rate limit|quota|usage limit|monthly/i.test(warning)) return 'rate_limit'
  if (/credential|authentication|authorization|api key|401|403/i.test(warning)) return 'authentication_failure'
  if (/unsupported|endpoint|available for this key/i.test(warning)) return 'endpoint_or_account_limitation'
  if (/timed out|abort/i.test(warning)) return 'timeout'
  if (/unexpected|malformed|payload/i.test(warning)) return 'malformed_response'
  if (/500|502|503|504|service unavailable/i.test(warning)) return 'provider_server_failure'
  return warning ? 'provider_warning' : undefined
}

export function createAviationstackExecutionProvider(options: AviationstackExecutionProviderOptions = {}): SearchExecutionProvider {
  const apiKey = configuredSecret(options.apiKey ?? process.env.AERODATABOX_API_KEY)
  const now = options.now || (() => new Date())
  const provider = options.provider || createAerodataboxScheduleProvider(apiKey)
  const maxAirportPairs = Math.max(1, Math.min(options.maxAirportPairs || defaultMaxAirportPairs, defaultMaxAirportPairs))
  const maxResultsPerPair = Math.max(1, Math.min(options.maxResultsPerPair || defaultMaxResultsPerPair, defaultMaxResultsPerPair))
  const cache = options.cache || defaultCache

  return {
    id: providerId,
    name: providerName,
    readiness: readinessFor(apiKey),
    capabilities: capabilities(),
    async search(request) {
      const fetchedAt = now().toISOString()
      const pairs = routePairs(request, maxAirportPairs)
      if (!pairs.length) {
        return {
          itineraries: [],
          status: 'unsupported_request',
          warnings: ['Aviationstack skipped: no valid airport-pair flight segment could be formed from the normalized search.'],
          diagnostics: {
            lastRequestStatus: 'unsupported_request',
            responseLatencyMs: 0,
            recordsReceived: 0,
            recordsNormalized: 0,
            recordsMatched: 0,
            recordsUnmatched: 0,
            errorCategory: 'invalid_request',
            retryUsed: false,
            fetchedAt,
            cached: false,
            requestCount: 0
          }
        }
      }

      const itineraries: SearchExecutionItinerary[] = []
      const warnings: string[] = []
      let recordsReceived = 0
      let recordsNormalized = 0
      let requestCount = 0
      let cached = false
      let cacheAgeMs = 0
      let responseLatencyMs = 0
      let lastRequestStatus = 'skipped'
      let retryUsed = false
      const startedAt = Date.now()

      for (const pair of pairs) {
        const key = cacheKey(pair, maxResultsPerPair)
        const currentTime = now().getTime()
        const existing = cache.get(key)
        let response: Awaited<ReturnType<LiveScheduleProvider['searchSchedules']>>
        if (existing && existing.expiresAt > currentTime) {
          response = existing.response
          cached = true
          cacheAgeMs = Math.max(cacheAgeMs, currentTime - existing.storedAt)
        } else {
          response = await provider.searchSchedules({
            origin: pair.origin,
            destination: pair.destination,
            date: pair.date,
            maxResults: maxResultsPerPair
          })
          requestCount += response.requestCount || 0
          cache.set(key, {
            storedAt: currentTime,
            expiresAt: currentTime + ttlMs(pair, now(), response.status),
            response
          })
        }

        lastRequestStatus = response.status
        if (response.warning) warnings.push(response.warning)
        responseLatencyMs += response.providerCallLogs?.reduce((total, log) => total + log.latencyMs, 0) || 0
        retryUsed = retryUsed || Boolean(response.providerCallLogs?.some((log) => /retry|attempt 2/i.test(log.detail)))
        recordsReceived += response.results.length
        const matched = response.results.filter((result) => resultMatchesRequest(result, pair))
        recordsNormalized += matched.length
        itineraries.push(...matched.map((result) => itineraryFromResult(result, result.retrievalTimestamp || result.sourceCheckedAt || fetchedAt)))
      }

      const providerStatus = warnings.length && !itineraries.length ? statusFromWarning(warnings.join(' ')) : itineraries.length ? 'success' : 'skipped'
      if (!itineraries.length && pairs.some((pair) => pair.date) && !warnings.length) {
        warnings.push('Aviationstack did not return future schedule data for this request.')
      }
      if (!itineraries.length && recordsReceived > 0) {
        warnings.push('Aviationstack returned records, but none matched the requested direction and travel date.')
      }

      return {
        itineraries,
        status: providerStatus,
        warnings: [...new Set(warnings)],
        diagnostics: {
          lastRequestStatus,
          responseLatencyMs: responseLatencyMs || Math.max(0, Date.now() - startedAt),
          recordsReceived,
          recordsNormalized,
          recordsMatched: itineraries.length,
          recordsUnmatched: Math.max(0, recordsReceived - itineraries.length),
          errorCategory: errorCategory(warnings.join(' ')),
          retryUsed,
          fetchedAt,
          cached,
          cacheAgeMs: cached ? cacheAgeMs : undefined,
          requestCount
        }
      }
    }
  }
}

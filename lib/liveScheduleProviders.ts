import { createProviderResultRepository } from './providerResultRepository'
import { executeProviderOperation, providerOnboardingConfigFor } from './providerInfrastructure'
import { providerScheduleRowsFromResults, type ScheduleProviderCallLog } from './scheduleProviderAdapter'

export type LiveScheduleProviderKey =
  | 'aviationstack'
  | 'flightaware'
  | 'amadeus'
  | 'cirium-oag'
  | 'supabase-schedule-ingestion'

export type ScheduleDataStatus = 'live' | 'cached' | 'scheduled' | 'inferred' | 'demo' | 'unavailable'

export type NormalizedScheduleResult = {
  carrier: string
  flightNumber: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
  duration?: string
  aircraft: string
  status: string
  source: LiveScheduleProviderKey | string
  sourceCheckedAt?: string
  operatingCarrier?: string
  operatingFlightNumber?: string
  marketingAirline?: string
  operatingAirline?: string
  marketingFlightNumber?: string
  departureTimeZone?: string
  arrivalTimeZone?: string
  operatingDate?: string
  arrivalOperatingDate?: string
  departureTerminal?: string
  arrivalTerminal?: string
  departureGate?: string
  arrivalGate?: string
  airlineCode?: string
  airlineName?: string
  scheduledDeparture?: string
  scheduledArrival?: string
  estimatedDeparture?: string
  estimatedArrival?: string
  actualDeparture?: string
  actualArrival?: string
  aircraftRegistration?: string
  aircraftIata?: string
  aircraftIcao?: string
  codeshareIdentity?: string
  providerRecordId?: string
  retrievalTimestamp?: string
  dataFreshness?: string
  dataStatus?: ScheduleDataStatus
  marketingFlightNumbers?: string[]
  duplicateCount?: number
}

export type LiveScheduleSearchRequest = {
  origin?: string
  destination?: string
  date?: string
  carrier?: string
  maxResults?: number
}

export type LiveScheduleProviderResponse = {
  provider: LiveScheduleProviderKey
  results: NormalizedScheduleResult[]
  requestCount: number
  status: 'success' | 'skipped' | 'warning' | 'error'
  warning?: string
  detail: string
  providerCallLogs?: ScheduleProviderCallLog[]
}

export type LiveScheduleProvider = {
  key: LiveScheduleProviderKey
  label: string
  capabilities: {
    futureSchedules: boolean
    currentFlightStatus: boolean
    routeSearch: boolean
    flightNumberEnrichment: boolean
  }
  searchSchedules: (request: LiveScheduleSearchRequest) => Promise<LiveScheduleProviderResponse>
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

type FlightAwareSchedule = {
  ident?: string
  ident_icao?: string
  ident_iata?: string
  actual_ident?: string | null
  actual_ident_icao?: string | null
  actual_ident_iata?: string | null
  aircraft_type?: string
  scheduled_in?: string
  scheduled_out?: string
  estimated_in?: string
  estimated_out?: string
  actual_in?: string
  actual_out?: string
  scheduled_block_time?: string | number
  block_time?: string | number
  duration?: string | number
  origin?: string
  origin_icao?: string
  origin_iata?: string
  origin_lid?: string
  destination?: string
  destination_icao?: string
  destination_iata?: string
  destination_lid?: string
  fa_flight_id?: string
  operator?: string
  operator_icao?: string
  operator_iata?: string
  flight_number?: string
  status?: string
  cancelled?: boolean
  diverted?: boolean
}

const carrierIataCodes: Record<string, string[]> = {
  united: ['UA'],
  delta: ['DL'],
  'alaska-group': ['AS', 'HA']
}

const defaultProviderTimeoutMs = 7000

const airportTimeZones: Record<string, string> = {
  ATL: 'America/New_York',
  BOS: 'America/New_York',
  DEN: 'America/Denver',
  DFW: 'America/Chicago',
  EWR: 'America/New_York',
  HNL: 'Pacific/Honolulu',
  IAD: 'America/New_York',
  IAH: 'America/Chicago',
  JFK: 'America/New_York',
  LAX: 'America/Los_Angeles',
  NRT: 'Asia/Tokyo',
  OGG: 'Pacific/Honolulu',
  ORD: 'America/Chicago',
  PDX: 'America/Los_Angeles',
  PHX: 'America/Phoenix',
  SAN: 'America/Los_Angeles',
  SBP: 'America/Los_Angeles',
  SEA: 'America/Los_Angeles',
  SFO: 'America/Los_Angeles'
}

function aviationstackCarrierCodes(carrier?: string) {
  if (!carrier || carrier === 'all') return [undefined]
  return carrierIataCodes[carrier] || [carrier.toUpperCase()]
}

function nextIsoDate(date: string) {
  return addIsoDays(date, 1)
}

function addIsoDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return undefined
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function scheduleSearchDate(date?: string) {
  if (date) return date
  return new Date().toISOString().slice(0, 10)
}

function carrierMatchesSchedule(result: NormalizedScheduleResult, carrier?: string) {
  if (!carrier || carrier === 'all') return true
  const allowedCodes = carrierIataCodes[carrier]?.map((code) => code.toLowerCase()) || [carrier.toLowerCase()]
  const text = `${result.carrier} ${result.flightNumber} ${result.operatingCarrier || ''} ${result.operatingFlightNumber || ''} ${(result.marketingFlightNumbers || []).join(' ')}`.toLowerCase()
  const hasCarrierEvidence = !text.split(/\s+/).every((part) => !part || part === 'not' || part === 'provided')
  if (!hasCarrierEvidence && result.source === 'flightaware') return true
  return allowedCodes.some((code) => text.includes(code)) || text.includes(carrier.toLowerCase())
}

function airportLocalDate(value?: string, airportCode?: string) {
  const parsed = value ? Date.parse(value) : NaN
  if (!Number.isFinite(parsed)) return undefined
  const timeZone = airportCode ? airportTimeZones[airportCode] : undefined
  return new Date(parsed).toLocaleDateString('en-CA', { timeZone })
}

function scheduleMatchesOriginLocalDate(result: NormalizedScheduleResult, date?: string) {
  if (!date) return true
  return airportLocalDate(result.departureTime, result.origin) === date
}

function operatingDateFor(value?: string, airportCode?: string) {
  return airportLocalDate(value, airportCode)
}

function freshnessLabel(sourceCheckedAt?: string) {
  const parsed = Date.parse(sourceCheckedAt || '')
  if (!Number.isFinite(parsed)) return 'unavailable'
  const hours = Math.max(0, Math.round(((Date.now() - parsed) / 3600000) * 10) / 10)
  return `${hours}h`
}

function uniqueMessages(messages: Array<string | undefined>) {
  return [...new Set(messages.filter((message): message is string => Boolean(message?.trim())))]
}

function provided(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return 'Not provided'
  return String(value)
}

function configuredSecret(value?: string) {
  const trimmed = value?.trim() || ''
  if (!trimmed || /^(placeholder|changeme|change-me|your[_-]?|test-key-here|example|none|null|undefined)$/i.test(trimmed)) return undefined
  return trimmed
}

function durationBetween(departure?: string, arrival?: string) {
  const departureMs = departure ? Date.parse(departure) : NaN
  const arrivalMs = arrival ? Date.parse(arrival) : NaN
  if (!Number.isFinite(departureMs) || !Number.isFinite(arrivalMs) || arrivalMs <= departureMs) return undefined
  const totalMinutes = Math.round((arrivalMs - departureMs) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
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

function safeProviderMessage(provider: string, status: number, fallback: string) {
  const lower = fallback.toLowerCase()
  if (status === 429 || lower.includes('rate limit') || lower.includes('usage limit') || lower.includes('quota') || lower.includes('monthly')) return `${provider} rate limit reached; skipped this provider safely`
  if (status === 401 || status === 403) return `${provider} credentials rejected or endpoint not available for this key`
  if (status === 404 || status === 405 || status === 410 || status === 501) return `${provider} endpoint unsupported or unavailable for this request`
  if (status >= 500) return `${provider} service unavailable (${status}); skipped safely`
  return fallback
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

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs = defaultProviderTimeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    const data = await readJsonSafely(response)
    return { response, data }
  } finally {
    clearTimeout(timeout)
  }
}

function safeProviderUrl(url: string) {
  return url
    .replace(/access_key=[^&\s]+/gi, 'access_key=[hidden]')
    .replace(/apikey=[^&\s]+/gi, 'apikey=[hidden]')
}

function quotaHeadersFrom(response: Response) {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    if (/rate|quota|limit|remaining|reset|retry-after/i.test(key)) headers[key] = value
  })
  return headers
}

function providerCallLog(input: {
  provider: LiveScheduleProviderKey
  url: string
  startedAt: number
  response?: Response
  detail: string
  cacheStatus?: ScheduleProviderCallLog['cacheStatus']
}): ScheduleProviderCallLog {
  const status = input.response?.status
  return {
    provider: input.provider,
    url: safeProviderUrl(input.url),
    httpStatus: status,
    latencyMs: Date.now() - input.startedAt,
    quotaHeaders: input.response ? quotaHeadersFrom(input.response) : {},
    rateLimited: status === 429 || /rate limit|quota|usage limit|monthly/i.test(input.detail),
    authenticationFailure: status === 401 || status === 403 || /credential|authentication|authorization|api key/i.test(input.detail),
    cacheStatus: input.cacheStatus,
    detail: safeMessage(input.detail)
  }
}

class RetryableProviderStatusError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function fetchJsonWithProviderInfrastructure(providerKey: LiveScheduleProviderKey, url: string, init: RequestInit = {}) {
  const config = providerOnboardingConfigFor(providerKey)
  if (!config) return fetchJsonWithTimeout(url, init, defaultProviderTimeoutMs)
  let lastResult: Awaited<ReturnType<typeof fetchJsonWithTimeout>> | undefined
  try {
    return await executeProviderOperation(config, async () => {
      const result = await fetchJsonWithTimeout(url, init, config.timeoutMs)
      lastResult = result
      if (config.retry.retryableStatuses?.includes(result.response.status)) {
        const retryMessage = safeMessage(result.data?.title || result.data?.error?.message || result.data?.error || result.data?.message || `${config.label} request failed with ${result.response.status}`)
        throw new RetryableProviderStatusError(result.response.status, retryMessage)
      }
      return result
    })
  } catch (error) {
    if (error instanceof RetryableProviderStatusError && lastResult) return lastResult
    throw error
  }
}


function normalizedInstant(value?: string) {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : (value || '')
}

function uniqueMarketingFlights(values: Array<string | undefined>) {
  return [...new Set(values
    .map((value) => String(value || '').replace(/\s+/g, '').trim())
    .filter(Boolean))]
}

function uniqueScheduleResults(results: NormalizedScheduleResult[]) {
  const merged = new Map<string, NormalizedScheduleResult>()
  results.forEach((result, index) => {
    const operatingFlight = result.operatingFlightNumber || result.flightNumber
    const key = [
      result.source,
      operatingFlight,
      result.origin,
      result.destination,
      normalizedInstant(result.departureTime),
      normalizedInstant(result.arrivalTime)
    ].filter(Boolean).join('|') || `schedule-${index}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, {
        ...result,
        flightNumber: operatingFlight,
        marketingFlightNumbers: uniqueMarketingFlights([...(result.marketingFlightNumbers || []), result.flightNumber]).filter((flightNumber) => flightNumber !== operatingFlight),
        duplicateCount: 0
      })
      return
    }
    const marketingFlightNumbers = uniqueMarketingFlights([
      ...(existing.marketingFlightNumbers || []),
      ...(result.marketingFlightNumbers || []),
      result.flightNumber
    ]).filter((flightNumber) => flightNumber !== (existing.operatingFlightNumber || existing.flightNumber))
    merged.set(key, {
      ...existing,
      marketingFlightNumbers,
      duplicateCount: (existing.duplicateCount || 0) + 1
    })
  })
  return [...merged.values()]
}

export function normalizeAviationstackScheduleResult(flight: AviationstackFlight): NormalizedScheduleResult {
  const flightNumber = flight.flight?.iata || flight.flight?.icao || flight.flight?.number || 'Flight TBD'
  const origin = flight.departure?.iata || flight.departure?.icao || 'TBD'
  const destination = flight.arrival?.iata || flight.arrival?.icao || 'TBD'
  const aircraft = flight.aircraft?.iata || flight.aircraft?.icao || flight.aircraft?.registration || 'Unknown'
  const sourceCheckedAt = new Date().toISOString()

  return {
    carrier: flight.airline?.name || flight.airline?.iata || flight.airline?.icao || 'Unknown Airline',
    flightNumber,
    origin,
    destination,
    departureTime: flight.departure?.scheduled || flight.departure?.estimated || flight.departure?.actual || 'Pending',
    arrivalTime: flight.arrival?.scheduled || flight.arrival?.estimated || flight.arrival?.actual || 'Pending',
    aircraft,
    status: flight.flight_status || 'Unknown',
    source: 'aviationstack',
    sourceCheckedAt,
    airlineCode: flight.airline?.iata || flight.airline?.icao,
    airlineName: flight.airline?.name,
    operatingCarrier: flight.airline?.iata || flight.airline?.icao || flight.airline?.name,
    operatingFlightNumber: flightNumber,
    marketingAirline: flight.airline?.name || flight.airline?.iata || flight.airline?.icao,
    operatingAirline: flight.airline?.name || flight.airline?.iata || flight.airline?.icao,
    marketingFlightNumber: flightNumber,
    departureTimeZone: flight.departure?.timezone || airportTimeZones[origin],
    arrivalTimeZone: flight.arrival?.timezone || airportTimeZones[destination],
    operatingDate: flight.flight_date || operatingDateFor(flight.departure?.scheduled || flight.departure?.estimated || flight.departure?.actual, origin),
    arrivalOperatingDate: operatingDateFor(flight.arrival?.scheduled || flight.arrival?.estimated || flight.arrival?.actual, destination),
    departureTerminal: flight.departure?.terminal,
    arrivalTerminal: flight.arrival?.terminal,
    departureGate: flight.departure?.gate,
    arrivalGate: flight.arrival?.gate,
    scheduledDeparture: flight.departure?.scheduled,
    scheduledArrival: flight.arrival?.scheduled,
    estimatedDeparture: flight.departure?.estimated,
    estimatedArrival: flight.arrival?.estimated,
    actualDeparture: flight.departure?.actual,
    actualArrival: flight.arrival?.actual,
    aircraftRegistration: flight.aircraft?.registration,
    aircraftIata: flight.aircraft?.iata,
    aircraftIcao: flight.aircraft?.icao,
    providerRecordId: flight.flight?.icao || flight.flight?.iata || flight.flight?.number,
    retrievalTimestamp: sourceCheckedAt,
    dataFreshness: freshnessLabel(sourceCheckedAt),
    dataStatus: 'live'
  }
}

export function normalizeFlightAwareScheduleResult(flight: FlightAwareSchedule, sourceCheckedAt = new Date().toISOString()): NormalizedScheduleResult {
  const marketingFlightNumber = flight.ident_iata || flight.ident
  const operatingFlightNumber = flight.actual_ident_iata || flight.actual_ident || (flight.operator_iata && flight.flight_number ? `${flight.operator_iata}${flight.flight_number}` : undefined) || marketingFlightNumber || flight.fa_flight_id
  const flightNumber = operatingFlightNumber
  const origin = flight.origin_iata || flight.origin_lid || flight.origin_icao || flight.origin
  const destination = flight.destination_iata || flight.destination_lid || flight.destination_icao || flight.destination
  const carrier = flight.operator_iata || flight.operator_icao || flight.operator || String(flightNumber || '').match(/^[A-Z]+/)?.[0]
  const status = flight.status || (flight.cancelled ? 'Cancelled' : flight.diverted ? 'Diverted' : undefined)
  const departureTime = flight.scheduled_out || flight.estimated_out || flight.actual_out
  const arrivalTime = flight.scheduled_in || flight.estimated_in || flight.actual_in

  return {
    carrier: provided(carrier),
    flightNumber: provided(flightNumber),
    origin: provided(origin),
    destination: provided(destination),
    departureTime: provided(departureTime),
    arrivalTime: provided(arrivalTime),
    duration: provided(flight.scheduled_block_time || flight.block_time || flight.duration || durationBetween(departureTime, arrivalTime)),
    aircraft: provided(flight.aircraft_type),
    status: provided(status),
    source: 'flightaware',
    sourceCheckedAt,
    operatingCarrier: provided(carrier),
    operatingFlightNumber: provided(operatingFlightNumber),
    marketingAirline: provided(carrier),
    operatingAirline: provided(carrier),
    marketingFlightNumber: provided(marketingFlightNumber),
    departureTimeZone: airportTimeZones[provided(origin)],
    arrivalTimeZone: airportTimeZones[provided(destination)],
    operatingDate: operatingDateFor(departureTime, provided(origin)),
    arrivalOperatingDate: operatingDateFor(arrivalTime, provided(destination)),
    codeshareIdentity: marketingFlightNumber && operatingFlightNumber && marketingFlightNumber !== operatingFlightNumber ? `${marketingFlightNumber} marketed on ${operatingFlightNumber}` : undefined,
    providerRecordId: flight.fa_flight_id || flight.ident_icao || flight.ident_iata || flight.ident,
    retrievalTimestamp: sourceCheckedAt,
    dataFreshness: freshnessLabel(sourceCheckedAt),
    dataStatus: 'live',
    marketingFlightNumbers: uniqueMarketingFlights([marketingFlightNumber]).filter((number) => number !== provided(operatingFlightNumber)),
    duplicateCount: 0
  }
}

export function scheduleResultsToFlightRecords(results: NormalizedScheduleResult[]) {
  return providerScheduleRowsFromResults(results)
}

export function createFlightAwareScheduleProvider(apiKey = configuredSecret(process.env.FLIGHTAWARE_API_KEY)): LiveScheduleProvider {
  return {
    key: 'flightaware',
    label: 'FlightAware AeroAPI',
    capabilities: {
      futureSchedules: true,
      currentFlightStatus: true,
      routeSearch: true,
      flightNumberEnrichment: true
    },
    async searchSchedules(request) {
      if (!apiKey) {
        return {
          provider: 'flightaware',
          results: [],
          requestCount: 0,
          status: 'skipped',
          warning: 'FlightAware API key missing; live schedule search skipped safely',
          detail: 'No FlightAware API key is configured.'
        }
      }

      if (!request.origin || !request.destination) {
        return {
          provider: 'flightaware',
          results: [],
          requestCount: 0,
          status: 'skipped',
          detail: 'FlightAware live schedule search requires both origin and destination.'
        }
      }

      const startDate = scheduleSearchDate(request.date)
      const endDate = request.date ? addIsoDays(startDate, 2) || nextIsoDate(startDate) || startDate : nextIsoDate(startDate) || startDate
      const params = new URLSearchParams({
        origin: request.origin,
        destination: request.destination,
        max_pages: request.date ? '2' : '1'
      })
      const limit = request.maxResults || 50
      const sourceCheckedAt = new Date().toISOString()

      try {
        const url = `https://aeroapi.flightaware.com/aeroapi/schedules/${encodeURIComponent(startDate)}/${encodeURIComponent(endDate)}?${params.toString()}`
        const startedAt = Date.now()
        const { response, data } = await fetchJsonWithProviderInfrastructure('flightaware', url, {
          headers: { 'x-apikey': apiKey }
        })

        if (!response.ok) {
          const rawMessage = safeMessage(data?.title || data?.error || data?.message || `FlightAware schedule request failed with ${response.status}`)
          const warning = safeProviderMessage('FlightAware', response.status, rawMessage)
          return {
            provider: 'flightaware',
            results: [],
            requestCount: 1,
            status: 'warning',
            warning,
            detail: 'FlightAware live schedule search returned no usable rows.',
            providerCallLogs: [providerCallLog({ provider: 'flightaware', url, startedAt, response, detail: warning, cacheStatus: 'bypass' })]
          }
        }

        if (!Array.isArray(data?.scheduled)) {
          const warning = 'FlightAware returned an unexpected schedule payload; live schedules were not used'
          return {
            provider: 'flightaware',
            results: [],
            requestCount: 1,
            status: 'warning',
            warning,
            detail: 'FlightAware live schedule search returned no usable rows.',
            providerCallLogs: [providerCallLog({ provider: 'flightaware', url, startedAt, response, detail: warning, cacheStatus: 'bypass' })]
          }
        }

        const results = uniqueScheduleResults(data.scheduled
          .map((flight: FlightAwareSchedule) => normalizeFlightAwareScheduleResult(flight, sourceCheckedAt))
          .filter((result: NormalizedScheduleResult) => scheduleMatchesOriginLocalDate(result, request.date))
          .filter((result: NormalizedScheduleResult) => carrierMatchesSchedule(result, request.carrier))
          .slice(0, limit))

        await createProviderResultRepository().storeNormalizedResults(results)

        return {
          provider: 'flightaware',
          results,
          requestCount: 1,
          status: results.length ? 'success' : 'skipped',
          detail: results.length ? `${results.length} FlightAware live schedule result${results.length === 1 ? '' : 's'} returned.` : 'FlightAware returned no matching live schedule rows.',
          providerCallLogs: [providerCallLog({ provider: 'flightaware', url, startedAt, response, detail: results.length ? `${results.length} rows` : 'FlightAware returned no matching live schedule rows.', cacheStatus: 'bypass' })]
        }
      } catch (error) {
        const detail = safeMessage(error) || 'FlightAware live schedule request failed; falling back safely'
        return {
          provider: 'flightaware',
          results: [],
          requestCount: 1,
          status: 'warning',
          warning: 'FlightAware live schedule request failed; falling back safely',
          detail: 'FlightAware live schedule search failed before returning usable rows.',
          providerCallLogs: [{
            provider: 'flightaware',
            latencyMs: 0,
            quotaHeaders: {},
            rateLimited: /rate limit|429/i.test(detail),
            authenticationFailure: /credential|auth|401|403/i.test(detail),
            cacheStatus: 'bypass',
            detail
          }]
        }
      }
    }
  }
}

export function createAviationstackScheduleProvider(apiKey = configuredSecret(process.env.AVIATIONSTACK_API_KEY)): LiveScheduleProvider {
  const safeApiKey = configuredSecret(apiKey)
  return {
    key: 'aviationstack',
    label: 'Aviationstack',
    capabilities: {
      futureSchedules: true,
      currentFlightStatus: true,
      routeSearch: true,
      flightNumberEnrichment: false
    },
    async searchSchedules(request) {
      if (!safeApiKey) {
        return {
          provider: 'aviationstack',
          results: [],
          requestCount: 0,
          status: 'skipped',
          warning: 'Aviationstack API key missing; fallback search skipped safely',
          detail: 'No Aviationstack API key is configured.'
        }
      }

      const carrierCodes = aviationstackCarrierCodes(request.carrier)
      const warnings: string[] = []
      const results: NormalizedScheduleResult[] = []
      const providerCallLogs: ScheduleProviderCallLog[] = []

      await Promise.all(carrierCodes.map(async (carrierCode) => {
        const params = new URLSearchParams({
          access_key: safeApiKey,
          limit: String(request.maxResults || 50)
        })
        if (request.origin) params.set('dep_iata', request.origin)
        if (request.destination) params.set('arr_iata', request.destination)
        if (request.date) params.set('flight_date', request.date)
        if (carrierCode) params.set('airline_iata', carrierCode)

        try {
          const url = `https://api.aviationstack.com/v1/flights?${params.toString()}`
          const startedAt = Date.now()
          const { response, data } = await fetchJsonWithProviderInfrastructure('aviationstack', url)
          if (!response.ok || data?.error) {
            const status = response.status || 400
            const rawMessage = safeMessage(data?.error?.message || data?.error?.code || `Aviationstack request failed with ${status}`)
            const warning = safeProviderMessage('Aviationstack', status, rawMessage)
            warnings.push(warning)
            providerCallLogs.push(providerCallLog({ provider: 'aviationstack', url, startedAt, response, detail: warning, cacheStatus: 'bypass' }))
            return
          }

          if (Array.isArray(data?.data)) {
            results.push(...data.data.map(normalizeAviationstackScheduleResult))
            providerCallLogs.push(providerCallLog({ provider: 'aviationstack', url, startedAt, response, detail: `${data.data.length} rows`, cacheStatus: 'bypass' }))
          } else {
            const warning = 'Aviationstack returned an unexpected payload; no fallback flights were used'
            warnings.push(warning)
            providerCallLogs.push(providerCallLog({ provider: 'aviationstack', url, startedAt, response, detail: warning, cacheStatus: 'bypass' }))
          }
        } catch (error) {
          const detail = safeMessage(error) || 'Aviationstack request failed; fallback provider skipped safely'
          warnings.push('Aviationstack request failed; fallback provider skipped safely')
          providerCallLogs.push({
            provider: 'aviationstack',
            latencyMs: 0,
            quotaHeaders: {},
            rateLimited: /rate limit|429/i.test(detail),
            authenticationFailure: /credential|auth|401|403/i.test(detail),
            cacheStatus: 'bypass',
            detail
          })
        }
      }))

      const uniqueResults = uniqueScheduleResults(results)
      await createProviderResultRepository().storeNormalizedResults(uniqueResults)
      return {
        provider: 'aviationstack',
        results: uniqueResults,
        requestCount: carrierCodes.length,
        status: uniqueResults.length ? 'success' : warnings.length ? 'warning' : 'skipped',
        warning: warnings.length ? uniqueMessages(warnings).join(' · ') : undefined,
        detail: uniqueResults.length ? `${uniqueResults.length} Aviationstack schedule result${uniqueResults.length === 1 ? '' : 's'} returned.` : 'Aviationstack returned no usable schedule rows.',
        providerCallLogs
      }
    }
  }
}

function placeholderProvider(key: LiveScheduleProviderKey, label: string, capabilities: LiveScheduleProvider['capabilities'], detail: string): LiveScheduleProvider {
  return {
    key,
    label,
    capabilities,
    async searchSchedules() {
      return {
        provider: key,
        results: [],
        requestCount: 0,
        status: 'skipped',
        detail
      }
    }
  }
}

export function createAmadeusScheduleProvider(): LiveScheduleProvider {
  return placeholderProvider('amadeus', 'Amadeus', {
    futureSchedules: true,
    currentFlightStatus: false,
    routeSearch: true,
    flightNumberEnrichment: false
  }, 'Amadeus schedule provider placeholder; no paid credentials are required or used.')
}

export function createCiriumOagScheduleProvider(): LiveScheduleProvider {
  return placeholderProvider('cirium-oag', 'Cirium/OAG', {
    futureSchedules: true,
    currentFlightStatus: true,
    routeSearch: true,
    flightNumberEnrichment: true
  }, 'Cirium/OAG enterprise schedule provider placeholder; no paid credentials are required or used.')
}

export function createSupabaseScheduleIngestionProvider(): LiveScheduleProvider {
  return placeholderProvider('supabase-schedule-ingestion', 'Supabase schedule ingestion', {
    futureSchedules: true,
    currentFlightStatus: false,
    routeSearch: true,
    flightNumberEnrichment: false
  }, 'Supabase schedule ingestion placeholder; stored ingested schedules must stay labeled as stored data, not live current API data.')
}

export const liveScheduleProviderPlaceholders = [
  createAviationstackScheduleProvider,
  createFlightAwareScheduleProvider,
  createAmadeusScheduleProvider,
  createCiriumOagScheduleProvider,
  createSupabaseScheduleIngestionProvider
]

export type ScheduleProviderReadinessStatus = 'Configured' | 'Missing' | 'Limited' | 'Placeholder'

export type ScheduleProviderReadiness = {
  key: LiveScheduleProviderKey
  label: string
  status: ScheduleProviderReadinessStatus
  whatItCanProvide: string[]
  whatItCannotProvide: string[]
  recommendedNextAction: string
  detail: string
}

type ReadinessOverride = {
  status?: Exclude<ScheduleProviderReadinessStatus, 'Placeholder'>
  detail?: string
  recommendedNextAction?: string
}

type ReadinessOptions = {
  overrides?: Partial<Record<LiveScheduleProviderKey, ReadinessOverride>>
  env?: NodeJS.ProcessEnv
}

function capabilityList(capabilities: LiveScheduleProvider['capabilities']) {
  const provides: string[] = []
  const cannotProvide: string[] = []
  const labels: Array<[keyof LiveScheduleProvider['capabilities'], string]> = [
    ['futureSchedules', 'future scheduled flights'],
    ['currentFlightStatus', 'current flight status'],
    ['routeSearch', 'origin/destination route search'],
    ['flightNumberEnrichment', 'flight-number enrichment']
  ]

  labels.forEach(([key, label]) => {
    if (capabilities[key]) provides.push(label)
    else cannotProvide.push(label)
  })

  return { provides, cannotProvide }
}

function withOverride(base: ScheduleProviderReadiness, override?: ReadinessOverride): ScheduleProviderReadiness {
  if (!override) return base
  return {
    ...base,
    status: override.status || base.status,
    detail: override.detail || base.detail,
    recommendedNextAction: override.recommendedNextAction || base.recommendedNextAction
  }
}

export function getLiveScheduleProviderReadiness(options: ReadinessOptions = {}): ScheduleProviderReadiness[] {
  const env = options.env || process.env
  const aviationstack = createAviationstackScheduleProvider(env.AVIATIONSTACK_API_KEY)
  const flightAware = createFlightAwareScheduleProvider(env.FLIGHTAWARE_API_KEY)
  const amadeus = createAmadeusScheduleProvider()
  const ciriumOag = createCiriumOagScheduleProvider()
  const supabase = createSupabaseScheduleIngestionProvider()
  const supabaseConfigured = Boolean((env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL) && (env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY))
  const aviationstackConfigured = Boolean(env.AVIATIONSTACK_API_KEY)
  const flightAwareConfigured = Boolean(env.FLIGHTAWARE_API_KEY)

  const supabaseCapabilities = capabilityList(supabase.capabilities)
  const aviationstackCapabilities = capabilityList(aviationstack.capabilities)
  const flightAwareCapabilities = capabilityList(flightAware.capabilities)
  const amadeusCapabilities = capabilityList(amadeus.capabilities)
  const ciriumOagCapabilities = capabilityList(ciriumOag.capabilities)

  return [
    withOverride({
      key: 'supabase-schedule-ingestion',
      label: supabase.label,
      status: supabaseConfigured ? 'Configured' : 'Missing',
      whatItCanProvide: [...supabaseCapabilities.provides, 'stored schedule cache for itinerary search'],
      whatItCannotProvide: [...supabaseCapabilities.cannotProvide, 'live provider API freshness by itself'],
      recommendedNextAction: supabaseConfigured
        ? 'Keep Supabase rows labeled as stored data and add a scheduled ingestion job only after selecting a primary live provider.'
        : 'Configure Supabase URL/key before enabling schedule ingestion or stored schedule cache reads.',
      detail: supabaseConfigured
        ? 'Supabase is configured for stored schedule ingestion/readback; stored rows are not live current API data.'
        : 'Supabase schedule ingestion is not ready because Supabase environment variables are missing.'
    }, options.overrides?.['supabase-schedule-ingestion']),
    withOverride({
      key: 'aviationstack',
      label: aviationstack.label,
      status: aviationstackConfigured ? 'Configured' : 'Missing',
      whatItCanProvide: aviationstackCapabilities.provides,
      whatItCannotProvide: [...aviationstackCapabilities.cannotProvide, 'reliable availability when account quota or plan is exhausted'],
      recommendedNextAction: aviationstackConfigured
        ? 'Verify Aviationstack quota/plan health and prefer the future-schedules endpoint before promoting it beyond fallback.'
        : 'Set AVIATIONSTACK_API_KEY only if Aviationstack should remain a fallback schedule source.',
      detail: aviationstackConfigured
        ? 'Aviationstack credentials are present and the abstraction can call the existing fallback search safely.'
        : 'Aviationstack fallback will be skipped because its API key is missing.'
    }, options.overrides?.aviationstack),
    withOverride({
      key: 'flightaware',
      label: flightAware.label,
      status: flightAwareConfigured ? 'Configured' : 'Missing',
      whatItCanProvide: [...flightAwareCapabilities.provides, 'primary live schedule search in itinerary results', 'current operational enrichment in existing app code'],
      whatItCannotProvide: ['stored cache persistence unless Supabase ingestion is added downstream'],
      recommendedNextAction: flightAwareConfigured
        ? 'Keep FlightAware first for live itinerary search and use Supabase as labeled cache fallback.'
        : 'Set FLIGHTAWARE_API_KEY before wiring FlightAware schedules as the primary live provider.',
      detail: flightAwareConfigured
        ? 'FlightAware credentials are present; AeroAPI schedules are available as the primary live itinerary provider.'
        : 'FlightAware enrichment and future schedule adapter work are blocked until the API key is configured.'
    }, options.overrides?.flightaware),
    {
      key: 'amadeus',
      label: amadeus.label,
      status: 'Placeholder',
      whatItCanProvide: amadeusCapabilities.provides,
      whatItCannotProvide: [...amadeusCapabilities.cannotProvide, 'production data until credentials, contracts, and an adapter are added'],
      recommendedNextAction: 'Leave as placeholder unless Amadeus becomes the chosen commercial schedule provider.',
      detail: 'Amadeus is documented in the provider abstraction but is not wired to any paid API call.'
    },
    {
      key: 'cirium-oag',
      label: ciriumOag.label,
      status: 'Placeholder',
      whatItCanProvide: ciriumOagCapabilities.provides,
      whatItCannotProvide: [...ciriumOagCapabilities.cannotProvide, 'production data until enterprise access and an adapter are added'],
      recommendedNextAction: 'Use only after enterprise contract/API details are confirmed; keep FlightAware as the recommended near-term path.',
      detail: 'Cirium/OAG is represented as an enterprise placeholder and makes no external API requests.'
    }
  ]
}

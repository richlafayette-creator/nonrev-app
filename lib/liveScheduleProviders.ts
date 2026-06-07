import { createProviderResultRepository } from './providerResultRepository'

export type LiveScheduleProviderKey =
  | 'aviationstack'
  | 'flightaware'
  | 'amadeus'
  | 'cirium-oag'
  | 'supabase-schedule-ingestion'

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

function aviationstackCarrierCodes(carrier?: string) {
  if (!carrier || carrier === 'all') return [undefined]
  return carrierIataCodes[carrier] || [carrier.toUpperCase()]
}

function nextIsoDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return undefined
  parsed.setUTCDate(parsed.getUTCDate() + 1)
  return parsed.toISOString().slice(0, 10)
}

function scheduleSearchDate(date?: string) {
  if (date) return date
  return new Date().toISOString().slice(0, 10)
}

function carrierMatchesSchedule(result: NormalizedScheduleResult, carrier?: string) {
  if (!carrier || carrier === 'all') return true
  const allowedCodes = carrierIataCodes[carrier]?.map((code) => code.toLowerCase()) || [carrier.toLowerCase()]
  const text = `${result.carrier} ${result.flightNumber}`.toLowerCase()
  const hasCarrierEvidence = !text.split(/\s+/).every((part) => !part || part === 'not' || part === 'provided')
  if (!hasCarrierEvidence && result.source === 'flightaware') return true
  return allowedCodes.some((code) => text.includes(code)) || text.includes(carrier.toLowerCase())
}

function uniqueMessages(messages: Array<string | undefined>) {
  return [...new Set(messages.filter((message): message is string => Boolean(message?.trim())))]
}

function provided(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return 'Not provided'
  return String(value)
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

function uniqueScheduleResults(results: NormalizedScheduleResult[]) {
  const seen = new Set<string>()
  return results.filter((result, index) => {
    const key = [result.source, result.flightNumber, result.origin, result.destination, result.departureTime].filter(Boolean).join('|') || `schedule-${index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizeAviationstackScheduleResult(flight: AviationstackFlight): NormalizedScheduleResult {
  const flightNumber = flight.flight?.iata || flight.flight?.icao || flight.flight?.number || 'Flight TBD'
  const origin = flight.departure?.iata || flight.departure?.icao || 'TBD'
  const destination = flight.arrival?.iata || flight.arrival?.icao || 'TBD'
  const aircraft = flight.aircraft?.iata || flight.aircraft?.icao || flight.aircraft?.registration || 'Unknown'

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
    sourceCheckedAt: new Date().toISOString()
  }
}

export function normalizeFlightAwareScheduleResult(flight: FlightAwareSchedule, sourceCheckedAt = new Date().toISOString()): NormalizedScheduleResult {
  const flightNumber = flight.ident_iata || flight.actual_ident_iata || flight.ident || flight.actual_ident || flight.fa_flight_id
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
    sourceCheckedAt
  }
}

export function scheduleResultsToFlightRecords(results: NormalizedScheduleResult[]) {
  return results.map((result) => ({
    id: `${result.source}-${result.flightNumber}-${result.origin}-${result.destination}-${result.departureTime}`,
    source_provider: result.source,
    source_checked_at: result.sourceCheckedAt || new Date().toISOString(),
    flight_number: result.flightNumber,
    carrier: result.carrier,
    airline: result.carrier,
    origin: result.origin,
    destination: result.destination,
    departure_time: result.departureTime,
    arrival_time: result.arrivalTime,
    duration: result.duration || 'Not provided',
    aircraft: result.aircraft,
    status: result.status,
    score: result.status.toLowerCase().includes('cancel') ? 35 : 68
  }))
}

export function createFlightAwareScheduleProvider(apiKey = process.env.FLIGHTAWARE_API_KEY): LiveScheduleProvider {
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
      const endDate = nextIsoDate(startDate) || startDate
      const params = new URLSearchParams({
        origin: request.origin,
        destination: request.destination,
        max_pages: '1'
      })
      const limit = request.maxResults || 50
      const sourceCheckedAt = new Date().toISOString()

      try {
        const { response, data } = await fetchJsonWithTimeout(`https://aeroapi.flightaware.com/aeroapi/schedules/${encodeURIComponent(startDate)}/${encodeURIComponent(endDate)}?${params.toString()}`, {
          headers: { 'x-apikey': apiKey }
        })

        if (!response.ok) {
          const rawMessage = safeMessage(data?.title || data?.error || data?.message || `FlightAware schedule request failed with ${response.status}`)
          return {
            provider: 'flightaware',
            results: [],
            requestCount: 1,
            status: 'warning',
            warning: safeProviderMessage('FlightAware', response.status, rawMessage),
            detail: 'FlightAware live schedule search returned no usable rows.'
          }
        }

        if (!Array.isArray(data?.scheduled)) {
          return {
            provider: 'flightaware',
            results: [],
            requestCount: 1,
            status: 'warning',
            warning: 'FlightAware returned an unexpected schedule payload; live schedules were not used',
            detail: 'FlightAware live schedule search returned no usable rows.'
          }
        }

        const results = uniqueScheduleResults(data.scheduled
          .map((flight: FlightAwareSchedule) => normalizeFlightAwareScheduleResult(flight, sourceCheckedAt))
          .filter((result: NormalizedScheduleResult) => carrierMatchesSchedule(result, request.carrier))
          .slice(0, limit))

        await createProviderResultRepository().storeNormalizedResults(results)

        return {
          provider: 'flightaware',
          results,
          requestCount: 1,
          status: results.length ? 'success' : 'skipped',
          detail: results.length ? `${results.length} FlightAware live schedule result${results.length === 1 ? '' : 's'} returned.` : 'FlightAware returned no matching live schedule rows.'
        }
      } catch {
        return {
          provider: 'flightaware',
          results: [],
          requestCount: 1,
          status: 'warning',
          warning: 'FlightAware live schedule request failed; falling back safely',
          detail: 'FlightAware live schedule search failed before returning usable rows.'
        }
      }
    }
  }
}

export function createAviationstackScheduleProvider(apiKey = process.env.AVIATIONSTACK_API_KEY): LiveScheduleProvider {
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
      if (!apiKey) {
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

      await Promise.all(carrierCodes.map(async (carrierCode) => {
        const params = new URLSearchParams({
          access_key: apiKey,
          limit: String(request.maxResults || 50)
        })
        if (request.origin) params.set('dep_iata', request.origin)
        if (request.destination) params.set('arr_iata', request.destination)
        if (request.date) params.set('flight_date', request.date)
        if (carrierCode) params.set('airline_iata', carrierCode)

        try {
          const { response, data } = await fetchJsonWithTimeout(`https://api.aviationstack.com/v1/flights?${params.toString()}`)
          if (!response.ok || data?.error) {
            const status = response.status || 400
            const rawMessage = safeMessage(data?.error?.message || data?.error?.code || `Aviationstack request failed with ${status}`)
            warnings.push(safeProviderMessage('Aviationstack', status, rawMessage))
            return
          }

          if (Array.isArray(data?.data)) {
            results.push(...data.data.map(normalizeAviationstackScheduleResult))
          } else {
            warnings.push('Aviationstack returned an unexpected payload; no fallback flights were used')
          }
        } catch {
          warnings.push('Aviationstack request failed; fallback provider skipped safely')
        }
      }))

      const uniqueResults = uniqueScheduleResults(results)
      return {
        provider: 'aviationstack',
        results: uniqueResults,
        requestCount: carrierCodes.length,
        status: uniqueResults.length ? 'success' : warnings.length ? 'warning' : 'skipped',
        warning: warnings.length ? uniqueMessages(warnings).join(' · ') : undefined,
        detail: uniqueResults.length ? `${uniqueResults.length} Aviationstack schedule result${uniqueResults.length === 1 ? '' : 's'} returned.` : 'Aviationstack returned no usable schedule rows.'
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
  const flightAware = createFlightAwareScheduleProvider()
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

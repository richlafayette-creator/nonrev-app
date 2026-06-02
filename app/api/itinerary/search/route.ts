import { NextResponse } from 'next/server'
import { buildItinerariesFromFlights, flightMatchesRequest, normalizeItineraryRequest, type ItineraryResult } from '../../../../lib/itinerarySearch'

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
  targetedCount: number
  recentCount: number
}

type ItineraryDebugMetadata = {
  parsedOrigin?: string
  parsedDestination?: string
  parsedDate?: string
  selectedCarrier: string
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
  apiResponseCounts: ApiResponseCounts
  supabaseQueryPath: SupabaseQueryDiagnostics
  providerFallbackOrder: string[]
  emptyResults: string[]
  rateLimits: string[]
  invalidAirportCodes: string[]
  invalidDates: string[]
  providerExplanation: string[]
  providerStatuses: ProviderStatus[]
  safeErrors: string[]
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
  supabase: 'Live Supabase',
  aviationstack: 'Aviationstack',
  flightaware: 'FlightAware enriched',
  planning: 'Planning fallback'
}

const providerFallbackOrder = [
  '1. Supabase flights table (targeted route/date query, then recent-row safety query)',
  '2. Aviationstack fallback (only if Supabase cannot assemble a matching itinerary)',
  '3. FlightAware enrichment (only after a provider returns known flight numbers)',
  '4. Planning fallback cards (only if no live provider returns itinerary data)'
]

const providerTimeoutMs = 7000

const fallbackProviderStatuses: ProviderStatus[] = [
  {
    provider: 'supabase',
    label: providerLabels.supabase,
    state: 'pending',
    detail: 'Supabase flights table is checked first for matching stored live flight records.'
  },
  {
    provider: 'aviationstack',
    label: providerLabels.aviationstack,
    state: 'pending',
    detail: 'Aviationstack is queried only when Supabase has no usable matching itineraries.'
  },
  {
    provider: 'flightaware',
    label: providerLabels.flightaware,
    state: 'pending',
    detail: 'FlightAware enrichment runs after a provider returns known flight numbers.'
  },
  {
    provider: 'planning',
    label: providerLabels.planning,
    state: 'pending',
    detail: 'Planning fallback cards are used only when no live provider returns itinerary data.'
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
  if (source.includes('aviationstack')) badges.push(providerLabels.aviationstack)
  else badges.push(providerLabels.supabase)
  if (enriched || source.includes('flightaware')) badges.push(providerLabels.flightaware)
  return badges
}

function addProviderBadges(itineraries: ItineraryResult[], source: 'supabase' | 'aviationstack', enriched: boolean) {
  return itineraries.map((itinerary) => ({
    ...itinerary,
    providerBadges: providerBadgesForSource(source, enriched || itinerary.source.includes('flightaware'))
  }))
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

function supabaseQueryUrl(supabaseUrl: string, request: ReturnType<typeof normalizeItineraryRequest>, targeted: boolean) {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: targeted ? '600' : '300'
  })

  if (targeted) {
    if (request.origin && request.destination) params.set('or', `(origin.eq.${request.origin},destination.eq.${request.destination})`)
    else if (request.origin) params.set('origin', `eq.${request.origin}`)
    else if (request.destination) params.set('destination', `eq.${request.destination}`)

    if (request.date) {
      const nextDate = nextIsoDate(request.date)
      params.append('departure_time', `gte.${request.date}`)
      if (nextDate) params.append('departure_time', `lt.${nextDate}`)
    }
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
  let targetedFlights: FlightRecord[] = []
  let recentFlights: FlightRecord[] = []

  if (shouldTryTargeted) {
    queryDiagnostics.attemptedPath = 'targeted route/date query'
    try {
      const { response, data } = await fetchJsonWithTimeout(supabaseQueryUrl(supabaseUrl, request, true), { headers })
      if (!response.ok) {
        warnings.push(safeProviderMessage('Supabase', response.status, safeMessage(data?.message || data?.error || `Supabase targeted flights request failed with ${response.status}`)))
      } else {
        targetedFlights = Array.isArray(data) ? data as FlightRecord[] : []
        queryDiagnostics.targetedCount = targetedFlights.length
      }
    } catch (error) {
      warnings.push(`Supabase targeted flights request failed; trying recent-row safety query (${safeMessage(error) || 'request aborted'})`)
    }
  } else {
    queryDiagnostics.attemptedPath = 'recent-row safety query'
  }

  const targetedHasMatches = targetedFlights.some((flight) => flightMatchesRequest(flight, request))
  const needsRecentSafetyQuery = !shouldTryTargeted || targetedFlights.length === 0 || !targetedHasMatches
  if (needsRecentSafetyQuery) {
    try {
      const { response, data } = await fetchJsonWithTimeout(supabaseQueryUrl(supabaseUrl, request, false), { headers })
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

  const flights = uniqueFlights([...targetedFlights, ...recentFlights])
  queryDiagnostics.usedPath = targetedFlights.length && !needsRecentSafetyQuery
    ? 'targeted route/date query'
    : targetedFlights.length && recentFlights.length
      ? 'targeted route/date query + recent-row safety query'
      : recentFlights.length
        ? 'recent-row safety query'
        : shouldTryTargeted
          ? 'targeted route/date query + empty recent-row safety query'
          : 'recent-row safety query'

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
  const apiKey = process.env.AVIATIONSTACK_API_KEY
  if (!apiKey) {
    return {
      flights: [] as FlightRecord[],
      warning: 'Aviationstack API key missing; fallback search skipped safely',
      requestCount: 0
    }
  }

  const carrierCodes = aviationstackCarrierCodes(request.carrier)
  const warnings: string[] = []
  const flights: FlightRecord[] = []

  await Promise.all(carrierCodes.map(async (carrierCode) => {
    const params = new URLSearchParams({
      access_key: apiKey,
      limit: '50'
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
        flights.push(...data.data.map(normalizeAviationstackFlight))
      } else {
        warnings.push('Aviationstack returned an unexpected payload; no fallback flights were used')
      }
    } catch {
      warnings.push('Aviationstack request failed; fallback provider skipped safely')
    }
  }))

  return {
    flights: uniqueFlights(flights),
    warning: warnings.length ? uniqueMessages(warnings).join(' · ') : undefined,
    requestCount: carrierCodes.length
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

function sourceLabel(source: 'supabase' | 'aviationstack' | 'planning', enriched: boolean) {
  if (source === 'planning') return providerLabels.planning
  if (source === 'aviationstack') return enriched ? 'Aviationstack + FlightAware enriched' : providerLabels.aviationstack
  return enriched ? 'Live Supabase + FlightAware enriched' : providerLabels.supabase
}

function buildDebugMetadata({
  parsedRequest,
  supabaseResultCount,
  aviationstackFallbackStatus,
  flightAwareEnrichmentStatus,
  finalItineraryCount,
  apiResponseCounts,
  supabaseQueryPath,
  emptyResults,
  rateLimits,
  invalidAirportCodes,
  invalidDates,
  providerStatuses,
  safeErrors
}: {
  parsedRequest: ReturnType<typeof normalizeItineraryRequest>
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
  apiResponseCounts: ApiResponseCounts
  supabaseQueryPath: SupabaseQueryDiagnostics
  providerFallbackOrder: string[]
  emptyResults: string[]
  rateLimits: string[]
  invalidAirportCodes: string[]
  invalidDates: string[]
  providerStatuses: ProviderStatus[]
  safeErrors: string[]
}): ItineraryDebugMetadata {
  const mergedProviderStatuses = mergeProviderStatuses(providerStatuses)
  return {
    parsedOrigin: parsedRequest.origin,
    parsedDestination: parsedRequest.destination,
    parsedDate: parsedRequest.date,
    selectedCarrier: parsedRequest.carrier || 'all',
    supabaseResultCount,
    aviationstackFallbackStatus,
    flightAwareEnrichmentStatus,
    finalItineraryCount,
    apiResponseCounts,
    supabaseQueryPath,
    providerFallbackOrder,
    emptyResults,
    rateLimits,
    invalidAirportCodes,
    invalidDates,
    providerExplanation: mergedProviderStatuses.map((status, index) => `${index + 1}. ${status.label}: ${status.detail}`),
    providerStatuses: mergedProviderStatuses,
    safeErrors
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsedRequest = normalizeItineraryRequest(searchParams)
  const invalidAirportCodes = [
    !isValidAirportCode(searchParams.get('origin')) ? `origin=${searchParams.get('origin')}` : undefined,
    !isValidAirportCode(searchParams.get('destination')) ? `destination=${searchParams.get('destination')}` : undefined
  ].filter((message): message is string => Boolean(message))
  const invalidDates = parsedRequest.date && !isValidIsoDate(parsedRequest.date)
    ? [`${parsedRequest.date} is not a valid YYYY-MM-DD date; live search ignored this date filter to avoid hiding available flights.`]
    : []
  const effectiveRequest = invalidDates.length ? { ...parsedRequest, date: undefined } : parsedRequest
  const warnings: string[] = []
  const emptyResults: string[] = []
  const rateLimits: string[] = []
  const counts = emptyCounts()

  if (invalidAirportCodes.length) warnings.push(`Invalid airport code input ignored: ${invalidAirportCodes.join(', ')}`)
  if (invalidDates.length) warnings.push(...invalidDates)

  const { flights: supabaseFlights, warning: supabaseWarning, queryDiagnostics: supabaseQueryPath } = await fetchSupabaseFlights(effectiveRequest)
  counts.supabaseFetched = supabaseFlights.length
  const supabaseMatchedFlights = supabaseFlights.filter((flight) => flightMatchesRequest(flight, effectiveRequest))
  counts.supabaseMatchedFlights = supabaseMatchedFlights.length
  if (supabaseWarning) warnings.push(supabaseWarning)
  if (supabaseFlights.length === 0) emptyResults.push('Supabase returned zero flight rows.')
  if (supabaseFlights.length > 0 && supabaseMatchedFlights.length === 0) emptyResults.push('Supabase returned rows, but none matched the normalized route/carrier/date request.')

  const supabaseItineraries = buildItinerariesFromFlights(supabaseFlights, effectiveRequest)
  counts.supabaseItineraries = supabaseItineraries.length
  if (supabaseItineraries.length > 0) {
    const itineraryFlightIdents = new Set(supabaseItineraries.flatMap((itinerary) => itinerary.legs.map((leg) => leg.flightNumber.replace(/\s+/g, '')).filter(Boolean)))
    const supabaseFlightsToEnrich = supabaseFlights
      .filter((flight) => {
        const ident = flightIdent(flight)
        return flightMatchesRequest(flight, effectiveRequest) || (ident ? itineraryFlightIdents.has(ident) : false)
      })
      .slice(0, 8)
    const { enrichments, warning: flightAwareWarning, status: flightAwareStatus, requestedCount } = await enrichWithFlightAware(supabaseFlightsToEnrich)
    counts.flightAwareRequested = requestedCount
    counts.flightAwareEnriched = Object.keys(enrichments).length
    if (flightAwareWarning) warnings.push(flightAwareWarning)
    const flightAwareLimit = rateLimitMessage('FlightAware', undefined, flightAwareWarning)
    if (flightAwareLimit) rateLimits.push(flightAwareLimit)
    const enrichedItineraries = buildItinerariesFromFlights(supabaseFlights, effectiveRequest, enrichments)
    const enriched = Object.keys(enrichments).length > 0
    const itineraries = addProviderBadges(enrichedItineraries.length ? enrichedItineraries : supabaseItineraries, 'supabase', enriched)
    counts.finalItineraries = itineraries.length
    const debug = buildDebugMetadata({
      parsedRequest: effectiveRequest,
      supabaseResultCount: supabaseItineraries.length,
      aviationstackFallbackStatus: 'not needed; Supabase returned matching flights',
      flightAwareEnrichmentStatus: flightAwareStatus,
      finalItineraryCount: itineraries.length,
      apiResponseCounts: counts,
      supabaseQueryPath,
      emptyResults,
      rateLimits,
      invalidAirportCodes,
      invalidDates,
      providerStatuses: [
        providerStatus('supabase', 'success', `${supabaseItineraries.length} matching itinerary result${supabaseItineraries.length === 1 ? '' : 's'} found from ${supabaseMatchedFlights.length} matched Supabase flight record${supabaseMatchedFlights.length === 1 ? '' : 's'} via ${supabaseQueryPath.usedPath}.`),
        providerStatus('aviationstack', 'skipped', 'Skipped because Supabase produced itinerary results.'),
        providerStatus('flightaware', enriched ? 'success' : 'warning', flightAwareStatus),
        providerStatus('planning', 'skipped', 'Skipped because live provider results are available.')
      ],
      safeErrors: uniqueMessages(warnings)
    })
    return NextResponse.json({
      ok: true,
      request: effectiveRequest,
      source: 'supabase-flights-first',
      sourceLabel: sourceLabel('supabase', enriched),
      statusMessage: `${itineraries.length} itinerary result${itineraries.length === 1 ? '' : 's'} found in Supabase flights.`,
      enrichedWithFlightAware: enriched,
      providerBadges: enriched ? [providerLabels.supabase, providerLabels.flightaware] : [providerLabels.supabase],
      warnings: uniqueMessages(warnings),
      debug,
      count: itineraries.length,
      itineraries
    })
  }

  warnings.push('No matching Supabase flights found; trying Aviationstack fallback')
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
    const itineraries = addProviderBadges(enrichedItineraries.length ? enrichedItineraries : aviationstackItineraries, 'aviationstack', enriched)
    counts.finalItineraries = itineraries.length
    const aviationstackFallbackStatus = `queried; ${aviationstackFlights.length} flight record${aviationstackFlights.length === 1 ? '' : 's'} returned`
    const debug = buildDebugMetadata({
      parsedRequest: effectiveRequest,
      supabaseResultCount: 0,
      aviationstackFallbackStatus,
      flightAwareEnrichmentStatus: flightAwareStatus,
      finalItineraryCount: itineraries.length,
      apiResponseCounts: counts,
      supabaseQueryPath,
      emptyResults,
      rateLimits,
      invalidAirportCodes,
      invalidDates,
      providerStatuses: [
        providerStatus('supabase', supabaseWarning ? 'warning' : 'skipped', supabaseWarning || 'No Supabase itineraries matched this request.'),
        providerStatus('aviationstack', 'success', `${aviationstackItineraries.length} matching itinerary result${aviationstackItineraries.length === 1 ? '' : 's'} found through fallback.`),
        providerStatus('flightaware', enriched ? 'success' : 'warning', flightAwareStatus),
        providerStatus('planning', 'skipped', 'Skipped because Aviationstack produced itinerary results.')
      ],
      safeErrors: uniqueMessages(warnings)
    })

    return NextResponse.json({
      ok: true,
      request: effectiveRequest,
      source: 'aviationstack-fallback',
      sourceLabel: sourceLabel('aviationstack', enriched),
      statusMessage: `${itineraries.length} itinerary result${itineraries.length === 1 ? '' : 's'} found through Aviationstack fallback.`,
      enrichedWithFlightAware: enriched,
      providerBadges: enriched ? [providerLabels.aviationstack, providerLabels.flightaware] : [providerLabels.aviationstack],
      warnings: uniqueMessages(warnings),
      debug,
      count: itineraries.length,
      itineraries
    })
  }

  const noResultsMessage = 'No live flights found for this search. Showing fallback planning guidance.'
  const aviationstackFallbackStatus = aviationstackFlights.length
    ? `queried; ${aviationstackFlights.length} flight record${aviationstackFlights.length === 1 ? '' : 's'} returned but no itineraries matched`
    : aviationstackWarning ? 'queried; no usable flight records returned' : 'queried; no matching flights returned'
  const finalWarnings = uniqueMessages([...warnings, noResultsMessage])
  const debug = buildDebugMetadata({
    parsedRequest: effectiveRequest,
    supabaseResultCount: 0,
    aviationstackFallbackStatus,
    flightAwareEnrichmentStatus: 'skipped; no known live flight numbers available to enrich',
    finalItineraryCount: 0,
    apiResponseCounts: counts,
    supabaseQueryPath,
    emptyResults,
    rateLimits,
    invalidAirportCodes,
    invalidDates,
    providerStatuses: [
      providerStatus('supabase', supabaseWarning ? 'warning' : 'skipped', supabaseWarning || 'No Supabase itineraries matched this request.'),
      providerStatus('aviationstack', aviationstackWarning ? 'warning' : 'skipped', aviationstackFallbackStatus),
      providerStatus('flightaware', 'skipped', 'Skipped because neither Supabase nor Aviationstack returned known flight numbers.'),
      providerStatus('planning', 'success', 'Placeholder planning fallback is active in the UI.')
    ],
    safeErrors: finalWarnings
  })

  return NextResponse.json({
    ok: true,
    request: effectiveRequest,
    source: 'planning-fallback',
    sourceLabel: sourceLabel('planning', false),
    statusMessage: noResultsMessage,
    errorMessage: noResultsMessage,
    enrichedWithFlightAware: false,
    providerBadges: [providerLabels.planning],
    warnings: finalWarnings,
    debug,
    count: 0,
    itineraries: []
  })
}

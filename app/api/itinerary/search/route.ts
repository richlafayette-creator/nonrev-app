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

type ItineraryDebugMetadata = {
  parsedOrigin?: string
  parsedDestination?: string
  parsedDate?: string
  selectedCarrier: string
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
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
  if (status === 401 || status === 403) return `${provider} credentials rejected or endpoint not available for this key`
  if (status === 404 || status === 405 || status === 410 || status === 501) return `${provider} endpoint unsupported or unavailable for this request`
  if (status === 429) return `${provider} rate limit reached; skipped this provider safely`
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

async function fetchSupabaseFlights() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { flights: [] as FlightRecord[], warning: 'Supabase environment variables missing; skipped Supabase safely' }
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/flights?select=*&order=created_at.desc&limit=300`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        },
        cache: 'no-store'
      }
    )
    const data = await readJsonSafely(response)

    if (!response.ok) {
      return {
        flights: [] as FlightRecord[],
        warning: safeProviderMessage('Supabase', response.status, data?.message || data?.error || `Supabase flights request failed with ${response.status}`)
      }
    }

    const flights = Array.isArray(data) ? data as FlightRecord[] : []
    return {
      flights,
      warning: flights.length ? undefined : 'Supabase flights table returned no rows'
    }
  } catch {
    return { flights: [] as FlightRecord[], warning: 'Supabase flights request failed; skipped Supabase safely' }
  }
}

async function enrichWithFlightAware(flights: FlightRecord[]) {
  const apiKey = process.env.FLIGHTAWARE_API_KEY
  if (!apiKey) {
    return {
      enrichments: {} as Record<string, FlightRecord>,
      warning: 'FlightAware API key missing; enrichment skipped safely',
      status: 'not configured'
    }
  }

  const enrichments: Record<string, FlightRecord> = {}
  const idents = [...new Set(flights.map(flightIdent).filter(Boolean))].slice(0, 8)
  const warnings: string[] = []

  if (idents.length === 0) {
    return { enrichments, warning: undefined, status: 'no known flight numbers to enrich' }
  }

  await Promise.all(idents.map(async (ident) => {
    try {
      const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`, {
        headers: { 'x-apikey': apiKey },
        cache: 'no-store'
      })
      const data = await readJsonSafely(response)
      if (response.ok && Array.isArray(data?.flights) && data.flights[0]) {
        enrichments[ident] = data.flights[0]
        return
      }
      if (!response.ok) {
        warnings.push(safeProviderMessage('FlightAware', response.status, data?.error || data?.message || `FlightAware request failed with ${response.status}`))
      }
    } catch {
      warnings.push('FlightAware enrichment request failed; kept base provider results')
    }
  }))

  return {
    enrichments,
    warning: warnings.length ? uniqueMessages(warnings).join(' · ') : undefined,
    status: `${Object.keys(enrichments).length} of ${idents.length} known flight numbers enriched`
  }
}

async function fetchAviationstackFlights(request: ReturnType<typeof normalizeItineraryRequest>) {
  const apiKey = process.env.AVIATIONSTACK_API_KEY
  if (!apiKey) {
    return {
      flights: [] as FlightRecord[],
      warning: 'Aviationstack API key missing; fallback search skipped safely'
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
      const response = await fetch(`https://api.aviationstack.com/v1/flights?${params.toString()}`, {
        cache: 'no-store'
      })
      const data = await readJsonSafely(response)

      if (!response.ok || data?.error) {
        const status = response.status || 400
        const rawMessage = data?.error?.message || data?.error?.code || `Aviationstack request failed with ${status}`
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
    flights,
    warning: warnings.length ? uniqueMessages(warnings).join(' · ') : undefined
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
  providerStatuses,
  safeErrors
}: {
  parsedRequest: ReturnType<typeof normalizeItineraryRequest>
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
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
    providerExplanation: mergedProviderStatuses.map((status, index) => `${index + 1}. ${status.label}: ${status.detail}`),
    providerStatuses: mergedProviderStatuses,
    safeErrors
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsedRequest = normalizeItineraryRequest(searchParams)
  const warnings: string[] = []

  const { flights: supabaseFlights, warning: supabaseWarning } = await fetchSupabaseFlights()
  if (supabaseWarning) warnings.push(supabaseWarning)

  const supabaseItineraries = buildItinerariesFromFlights(supabaseFlights, parsedRequest)
  if (supabaseItineraries.length > 0) {
    const supabaseFlightsToEnrich = supabaseFlights.filter((flight) => flightMatchesRequest(flight, parsedRequest)).slice(0, 8)
    const { enrichments, warning: flightAwareWarning, status: flightAwareStatus } = await enrichWithFlightAware(supabaseFlightsToEnrich)
    if (flightAwareWarning) warnings.push(flightAwareWarning)
    const enrichedItineraries = buildItinerariesFromFlights(supabaseFlights, parsedRequest, enrichments)
    const enriched = Object.keys(enrichments).length > 0
    const itineraries = addProviderBadges(enrichedItineraries.length ? enrichedItineraries : supabaseItineraries, 'supabase', enriched)
    const debug = buildDebugMetadata({
      parsedRequest,
      supabaseResultCount: supabaseItineraries.length,
      aviationstackFallbackStatus: 'not needed; Supabase returned matching flights',
      flightAwareEnrichmentStatus: flightAwareStatus,
      finalItineraryCount: itineraries.length,
      providerStatuses: [
        providerStatus('supabase', 'success', `${supabaseItineraries.length} matching itinerary result${supabaseItineraries.length === 1 ? '' : 's'} found in the flights table.`),
        providerStatus('aviationstack', 'skipped', 'Skipped because Supabase produced itinerary results.'),
        providerStatus('flightaware', enriched ? 'success' : 'warning', flightAwareStatus),
        providerStatus('planning', 'skipped', 'Skipped because live provider results are available.')
      ],
      safeErrors: uniqueMessages(warnings)
    })
    return NextResponse.json({
      ok: true,
      request: parsedRequest,
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
  const { flights: aviationstackFlights, warning: aviationstackWarning } = await fetchAviationstackFlights(parsedRequest)
  if (aviationstackWarning) warnings.push(aviationstackWarning)

  const aviationstackItineraries = buildItinerariesFromFlights(aviationstackFlights, parsedRequest)
  if (aviationstackItineraries.length > 0) {
    const { enrichments, warning: flightAwareWarning, status: flightAwareStatus } = await enrichWithFlightAware(aviationstackFlights)
    if (flightAwareWarning) warnings.push(flightAwareWarning)
    const enrichedItineraries = buildItinerariesFromFlights(aviationstackFlights, parsedRequest, enrichments)
    const enriched = Object.keys(enrichments).length > 0
    const itineraries = addProviderBadges(enrichedItineraries.length ? enrichedItineraries : aviationstackItineraries, 'aviationstack', enriched)
    const aviationstackFallbackStatus = `queried; ${aviationstackFlights.length} flight record${aviationstackFlights.length === 1 ? '' : 's'} returned`
    const debug = buildDebugMetadata({
      parsedRequest,
      supabaseResultCount: 0,
      aviationstackFallbackStatus,
      flightAwareEnrichmentStatus: flightAwareStatus,
      finalItineraryCount: itineraries.length,
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
      request: parsedRequest,
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
    parsedRequest,
    supabaseResultCount: 0,
    aviationstackFallbackStatus,
    flightAwareEnrichmentStatus: 'skipped; no known live flight numbers available to enrich',
    finalItineraryCount: 0,
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
    request: parsedRequest,
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

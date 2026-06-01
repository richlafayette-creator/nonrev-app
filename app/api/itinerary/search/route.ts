import { NextResponse } from 'next/server'
import { buildItinerariesFromFlights, normalizeItineraryRequest } from '../../../../lib/itinerarySearch'

export const dynamic = 'force-dynamic'

type FlightRecord = Record<string, unknown>

type ItineraryDebugMetadata = {
  parsedOrigin?: string
  parsedDestination?: string
  parsedDate?: string
  selectedCarrier: string
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
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

function flightIdent(flight: FlightRecord) {
  const ident = flight.flight_number || flight.ident || flight.fa_flight_id
  return ident ? String(ident).replace(/\s+/g, '') : ''
}

function aviationstackCarrierCodes(carrier?: string) {
  if (!carrier || carrier === 'all') return [undefined]
  return carrierIataCodes[carrier] || [carrier.toUpperCase()]
}

async function fetchSupabaseFlights() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { flights: [] as FlightRecord[], warning: 'Supabase environment variables missing' }
  }

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
  const data = await response.json()

  if (!response.ok) {
    return {
      flights: [] as FlightRecord[],
      warning: data?.message || data?.error || `Supabase flights request failed with ${response.status}`
    }
  }

  return { flights: Array.isArray(data) ? data as FlightRecord[] : [], warning: undefined }
}

async function enrichWithFlightAware(flights: FlightRecord[]) {
  const apiKey = process.env.FLIGHTAWARE_API_KEY
  if (!apiKey) return { enrichments: {} as Record<string, FlightRecord>, warning: 'FlightAware API key missing; using current flight data only', status: 'not configured' }

  const enrichments: Record<string, FlightRecord> = {}
  const idents = [...new Set(flights.map(flightIdent).filter(Boolean))].slice(0, 8)

  if (idents.length === 0) {
    return { enrichments, warning: undefined, status: 'no known flight numbers to enrich' }
  }

  await Promise.all(idents.map(async (ident) => {
    try {
      const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`, {
        headers: { 'x-apikey': apiKey },
        cache: 'no-store'
      })
      const data = await response.json()
      if (response.ok && Array.isArray(data?.flights) && data.flights[0]) {
        enrichments[ident] = data.flights[0]
      }
    } catch {
      // Keep current source results if FlightAware enrichment fails for an individual flight.
    }
  }))

  return { enrichments, warning: undefined, status: `${Object.keys(enrichments).length} of ${idents.length} known flight numbers enriched` }
}

async function fetchAviationstackFlights(request: ReturnType<typeof normalizeItineraryRequest>) {
  const apiKey = process.env.AVIATIONSTACK_API_KEY
  if (!apiKey) {
    return {
      flights: [] as FlightRecord[],
      warning: 'Aviationstack API key missing; fallback search skipped'
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
      const data = await response.json()

      if (!response.ok || data?.error) {
        const errorMessage = data?.error?.message || data?.error?.code || `Aviationstack request failed with ${response.status}`
        warnings.push(errorMessage)
        return
      }

      if (Array.isArray(data?.data)) {
        flights.push(...data.data.map(normalizeAviationstackFlight))
      }
    } catch {
      warnings.push('Aviationstack request failed')
    }
  }))

  return {
    flights,
    warning: warnings.length ? [...new Set(warnings)].join(' · ') : undefined
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

function matchingFlightsForEnrichment(flights: FlightRecord[], request: ReturnType<typeof normalizeItineraryRequest>) {
  return flights.filter((flight) => {
    const origin = String(flight.origin || flight.origin_airport || flight.departure_airport || '').toUpperCase()
    const destination = String(flight.destination || flight.destination_airport || flight.arrival_airport || '').toUpperCase()
    const carrierText = `${flight.carrier || flight.airline || flight.operator || ''} ${flight.flight_number || flight.ident || ''}`.toLowerCase()
    const originMatches = request.origin ? origin.includes(request.origin) : true
    const destinationMatches = request.destination ? destination.includes(request.destination) : true
    const carrierMatches = !request.carrier || request.carrier === 'all'
      ? true
      : carrierText.includes(request.carrier.toLowerCase()) || carrierText.includes(request.carrier.split('-')[0])
    return originMatches && destinationMatches && carrierMatches
  })
}

function sourceLabel(source: string, enriched: boolean) {
  if (source === 'aviationstack-fallback') {
    return enriched ? 'Aviationstack fallback + FlightAware enrichment' : 'Aviationstack fallback'
  }
  return enriched ? 'Supabase flights + FlightAware enrichment' : 'Supabase flights table'
}

function buildDebugMetadata({
  parsedRequest,
  supabaseResultCount,
  aviationstackFallbackStatus,
  flightAwareEnrichmentStatus,
  finalItineraryCount,
  safeErrors
}: {
  parsedRequest: ReturnType<typeof normalizeItineraryRequest>
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
  safeErrors: string[]
}): ItineraryDebugMetadata {
  return {
    parsedOrigin: parsedRequest.origin,
    parsedDestination: parsedRequest.destination,
    parsedDate: parsedRequest.date,
    selectedCarrier: parsedRequest.carrier || 'all',
    supabaseResultCount,
    aviationstackFallbackStatus,
    flightAwareEnrichmentStatus,
    finalItineraryCount,
    safeErrors
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsedRequest = normalizeItineraryRequest(searchParams)
  const warnings: string[] = []
  const { flights, warning: supabaseWarning } = await fetchSupabaseFlights()
  if (supabaseWarning) warnings.push(supabaseWarning)

  const supabaseSeedFlights = matchingFlightsForEnrichment(flights, parsedRequest)
  const { enrichments: supabaseEnrichments, warning: supabaseFlightAwareWarning, status: supabaseFlightAwareStatus } = await enrichWithFlightAware(supabaseSeedFlights.length ? supabaseSeedFlights : flights.slice(0, 8))
  if (supabaseFlightAwareWarning) warnings.push(supabaseFlightAwareWarning)

  const supabaseItineraries = buildItinerariesFromFlights(flights, parsedRequest, supabaseEnrichments)
  if (supabaseItineraries.length > 0) {
    const enriched = Object.keys(supabaseEnrichments).length > 0
    const debug = buildDebugMetadata({
      parsedRequest,
      supabaseResultCount: supabaseItineraries.length,
      aviationstackFallbackStatus: 'not needed; Supabase returned matching flights',
      flightAwareEnrichmentStatus: supabaseFlightAwareStatus,
      finalItineraryCount: supabaseItineraries.length,
      safeErrors: warnings
    })
    return NextResponse.json({
      ok: true,
      request: parsedRequest,
      source: 'supabase-flights-first',
      sourceLabel: sourceLabel('supabase-flights-first', enriched),
      statusMessage: `${supabaseItineraries.length} itinerary result${supabaseItineraries.length === 1 ? '' : 's'} found in Supabase flights.`,
      enrichedWithFlightAware: enriched,
      warnings,
      debug,
      count: supabaseItineraries.length,
      itineraries: supabaseItineraries
    })
  }

  warnings.push('No matching Supabase flights found; trying Aviationstack fallback')
  const { flights: aviationstackFlights, warning: aviationstackWarning } = await fetchAviationstackFlights(parsedRequest)
  if (aviationstackWarning) warnings.push(aviationstackWarning)

  const { enrichments: aviationstackEnrichments, warning: aviationstackFlightAwareWarning, status: aviationstackFlightAwareStatus } = await enrichWithFlightAware(aviationstackFlights)
  if (aviationstackFlightAwareWarning && !warnings.includes(aviationstackFlightAwareWarning)) warnings.push(aviationstackFlightAwareWarning)

  const aviationstackItineraries = buildItinerariesFromFlights(aviationstackFlights, parsedRequest, aviationstackEnrichments)
  const enriched = Object.keys(aviationstackEnrichments).length > 0
  const noResultsMessage = 'No live flights found for this search. Showing fallback planning guidance.'
  const aviationstackFallbackStatus = aviationstackFlights.length
    ? `queried; ${aviationstackFlights.length} flight record${aviationstackFlights.length === 1 ? '' : 's'} returned`
    : aviationstackWarning ? 'queried; no usable flight records returned' : 'queried; no matching flights returned'
  const finalWarnings = aviationstackItineraries.length ? warnings : [...warnings, noResultsMessage]
  const debug = buildDebugMetadata({
    parsedRequest,
    supabaseResultCount: 0,
    aviationstackFallbackStatus,
    flightAwareEnrichmentStatus: aviationstackFlightAwareStatus,
    finalItineraryCount: aviationstackItineraries.length,
    safeErrors: finalWarnings
  })

  return NextResponse.json({
    ok: true,
    request: parsedRequest,
    source: 'aviationstack-fallback',
    sourceLabel: sourceLabel('aviationstack-fallback', enriched),
    statusMessage: aviationstackItineraries.length
      ? `${aviationstackItineraries.length} itinerary result${aviationstackItineraries.length === 1 ? '' : 's'} found through Aviationstack fallback.`
      : noResultsMessage,
    errorMessage: aviationstackItineraries.length ? undefined : noResultsMessage,
    enrichedWithFlightAware: enriched,
    warnings: finalWarnings,
    debug,
    count: aviationstackItineraries.length,
    itineraries: aviationstackItineraries
  })
}

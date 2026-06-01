import { NextResponse } from 'next/server'
import { buildItinerariesFromFlights, normalizeItineraryRequest } from '../../../../lib/itinerarySearch'

export const dynamic = 'force-dynamic'

type FlightRecord = Record<string, unknown>

function flightIdent(flight: FlightRecord) {
  const ident = flight.flight_number || flight.ident || flight.fa_flight_id
  return ident ? String(ident).replace(/\s+/g, '') : ''
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
  if (!apiKey) return { enrichments: {} as Record<string, FlightRecord>, warning: 'FlightAware API key missing; using Supabase-only flight data' }

  const enrichments: Record<string, FlightRecord> = {}
  const idents = [...new Set(flights.map(flightIdent).filter(Boolean))].slice(0, 8)

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
      // Keep Supabase results if FlightAware enrichment fails for an individual flight.
    }
  }))

  return { enrichments, warning: undefined }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsedRequest = normalizeItineraryRequest(searchParams)
  const { flights, warning: supabaseWarning } = await fetchSupabaseFlights()
  const matchingSeedFlights = flights.filter((flight) => {
    const origin = String(flight.origin || flight.origin_airport || flight.departure_airport || '').toUpperCase()
    const destination = String(flight.destination || flight.destination_airport || flight.arrival_airport || '').toUpperCase()
    const carrierText = `${flight.carrier || flight.airline || flight.operator || ''} ${flight.flight_number || flight.ident || ''}`.toLowerCase()
    const originMatches = parsedRequest.origin ? origin.includes(parsedRequest.origin) : true
    const destinationMatches = parsedRequest.destination ? destination.includes(parsedRequest.destination) : true
    const carrierMatches = !parsedRequest.carrier || parsedRequest.carrier === 'all'
      ? true
      : carrierText.includes(parsedRequest.carrier.toLowerCase()) || carrierText.includes(parsedRequest.carrier.split('-')[0])
    return originMatches && destinationMatches && carrierMatches
  })
  const enrichmentCandidates = matchingSeedFlights.length ? matchingSeedFlights : flights.slice(0, 8)
  const { enrichments, warning: flightAwareWarning } = await enrichWithFlightAware(enrichmentCandidates)
  const itineraries = buildItinerariesFromFlights(flights, parsedRequest, enrichments)

  return NextResponse.json({
    ok: true,
    request: parsedRequest,
    source: 'supabase-flights-first',
    enrichedWithFlightAware: Object.keys(enrichments).length > 0,
    warnings: [supabaseWarning, flightAwareWarning].filter(Boolean),
    count: itineraries.length,
    itineraries
  })
}

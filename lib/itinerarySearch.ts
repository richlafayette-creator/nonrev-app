export type ParsedItineraryRequest = {
  prompt?: string
  origin?: string
  destination?: string
  date?: string
  carrier?: string
  maxLegs: number
}

export type ItineraryLeg = {
  id?: string | number
  route: string
  origin: string
  destination: string
  carrier: string
  flightNumber: string
  departureTime: string
  arrivalTime: string
  aircraft: string
  status: string
  gate?: string
  terminal?: string
  delayMinutes?: number
  cancelled?: boolean
  diverted?: boolean
  disruptionSource?: string
  score: number
  risk: string
  source: string
}

export type ItineraryResult = {
  id: string
  route: string
  legs: ItineraryLeg[]
  carrier: string
  flightNumber: string
  departureTime: string
  arrivalTime: string
  aircraft: string
  status: string
  gate?: string
  terminal?: string
  score: number
  risk: string
  source: string
  providerBadges?: string[]
}

const carrierAliases: Record<string, string[]> = {
  united: ['united', 'ua', 'ual'],
  delta: ['delta', 'dl', 'dal'],
  'alaska-group': ['alaska', 'hawaiian', 'as', 'ha', 'alaska group']
}

const carrierLabels: Record<string, string> = {
  united: 'United',
  delta: 'Delta',
  'alaska-group': 'Alaska Group',
  all: 'All Supported Carriers'
}

function airportCode(value?: string | null) {
  const match = value?.toUpperCase().match(/\b[A-Z]{3}\b/)
  return match?.[0]
}

function dateFromRelative(value: string, now = new Date()) {
  const normalized = value.toLowerCase()
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (normalized.includes('tomorrow')) {
    date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString().slice(0, 10)
  }
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const nextWeekday = normalized.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/)
  if (nextWeekday) {
    const target = weekdays.indexOf(nextWeekday[1])
    const diff = (target - date.getUTCDay() + 7) % 7 || 7
    date.setUTCDate(date.getUTCDate() + diff)
    return date.toISOString().slice(0, 10)
  }
  const isoDate = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (isoDate) return isoDate[1]
  return undefined
}

function carrierFromText(value: string) {
  const normalized = value.toLowerCase()
  const matched = Object.entries(carrierAliases).find(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))
  return matched?.[0]
}

export function parseItineraryPrompt(prompt: string, now = new Date()): Partial<ParsedItineraryRequest> {
  const normalized = prompt.trim()
  const routeMatch = normalized.match(/\b([A-Za-z]{3})\b\s*(?:-|→|to)\s*\b([A-Za-z]{3})\b/i)

  return {
    prompt: normalized,
    origin: routeMatch?.[1]?.toUpperCase(),
    destination: routeMatch?.[2]?.toUpperCase(),
    date: dateFromRelative(normalized, now),
    carrier: carrierFromText(normalized)
  }
}

export function normalizeItineraryRequest(searchParams: URLSearchParams): ParsedItineraryRequest {
  const prompt = searchParams.get('q') || searchParams.get('query') || searchParams.get('prompt') || undefined
  const parsed = prompt ? parseItineraryPrompt(prompt) : {}
  const maxLegs = Number(searchParams.get('maxLegs') || '2')

  const explicitCarrier = searchParams.get('carrier')

  return {
    prompt,
    origin: airportCode(searchParams.get('origin')) || parsed.origin,
    destination: airportCode(searchParams.get('destination')) || parsed.destination,
    date: searchParams.get('date') || parsed.date,
    carrier: explicitCarrier && explicitCarrier !== 'all' ? explicitCarrier : parsed.carrier || explicitCarrier || 'all',
    maxLegs: Number.isFinite(maxLegs) ? Math.max(1, Math.min(3, Math.round(maxLegs))) : 2
  }
}

function valueFrom(flight: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = flight[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}

function numberFrom(flight: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = Number(flight[key])
    if (Number.isFinite(value)) return value
  }
  return fallback
}

function minutesBetween(later?: string, earlier?: string) {
  const laterTime = later ? Date.parse(later) : NaN
  const earlierTime = earlier ? Date.parse(earlier) : NaN
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime) || laterTime <= earlierTime) return 0
  return Math.round((laterTime - earlierTime) / 60000)
}

function carrierFromFlight(flight: Record<string, unknown>) {
  const explicitCarrier = valueFrom(flight, ['carrier', 'airline', 'operator', 'carrier_name'])
  if (explicitCarrier) return explicitCarrier
  const flightNumber = valueFrom(flight, ['flight_number', 'ident', 'fa_flight_id'])
  if (/^UA/i.test(flightNumber)) return 'United'
  if (/^DL/i.test(flightNumber)) return 'Delta'
  if (/^AS/i.test(flightNumber)) return 'Alaska Airlines'
  if (/^HA/i.test(flightNumber)) return 'Hawaiian Airlines'
  return 'Unknown Carrier'
}

function riskFromScore(score: number, status: string) {
  const loweredStatus = status.toLowerCase()
  if (loweredStatus.includes('cancel')) return 'High'
  if (loweredStatus.includes('delay')) return 'Medium-High'
  if (score >= 80) return 'Low'
  if (score >= 70) return 'Medium-Low'
  if (score >= 55) return 'Medium'
  return 'High'
}

function flightMatchesCarrier(flight: Record<string, unknown>, carrier?: string) {
  if (!carrier || carrier === 'all') return true
  const text = `${carrierFromFlight(flight)} ${valueFrom(flight, ['flight_number', 'ident'])}`.toLowerCase()
  return carrierAliases[carrier]?.some((alias) => text.includes(alias)) ?? text.includes(carrier.toLowerCase())
}

function flightMatchesDate(flight: Record<string, unknown>, date?: string) {
  if (!date) return true
  const text = [
    valueFrom(flight, ['date', 'flight_date', 'departure_date', 'scheduled_date']),
    valueFrom(flight, ['departure_time', 'scheduled_departure', 'scheduled_out', 'actual_out', 'created_at'])
  ].join(' ')
  return text.includes(date)
}

export function flightMatchesRequest(flight: Record<string, unknown>, request: ParsedItineraryRequest) {
  const origin = airportCode(valueFrom(flight, ['origin', 'origin_airport', 'departure_airport', 'departure_airport_code']))
  const destination = airportCode(valueFrom(flight, ['destination', 'destination_airport', 'arrival_airport', 'arrival_airport_code']))
  const originMatches = request.origin ? origin === request.origin : true
  const destinationMatches = request.destination ? destination === request.destination : true
  return originMatches && destinationMatches && flightMatchesCarrier(flight, request.carrier) && flightMatchesDate(flight, request.date)
}

export function normalizeFlightLeg(flight: Record<string, unknown>, enrichment?: Record<string, unknown>): ItineraryLeg {
  const origin = airportCode(valueFrom(flight, ['origin', 'origin_airport', 'departure_airport', 'departure_airport_code']) || valueFrom(enrichment || {}, ['origin', 'origin_airport'])) || 'TBD'
  const destination = airportCode(valueFrom(flight, ['destination', 'destination_airport', 'arrival_airport', 'arrival_airport_code']) || valueFrom(enrichment || {}, ['destination', 'destination_airport'])) || 'TBD'
  const departureTime = valueFrom(flight, ['departure_time', 'scheduled_departure', 'scheduled_out', 'actual_out', 'departure']) || valueFrom(enrichment || {}, ['scheduled_out', 'actual_out', 'scheduled_off', 'filed_departure_time']) || 'Pending'
  const arrivalTime = valueFrom(flight, ['arrival_time', 'scheduled_arrival', 'scheduled_in', 'actual_in', 'arrival']) || valueFrom(enrichment || {}, ['scheduled_in', 'actual_in', 'scheduled_on', 'estimated_in']) || 'Pending'
  const status = valueFrom(enrichment || {}, ['status']) || valueFrom(flight, ['status', 'flight_status']) || 'Unknown'
  const score = numberFrom(flight, ['score', 'load_score', 'availability_score'], status.toLowerCase().includes('cancel') ? 35 : 68)
  const departureGate = valueFrom(flight, ['departure_gate', 'gate']) || valueFrom(enrichment || {}, ['gate_origin', 'departure_gate'])
  const arrivalGate = valueFrom(flight, ['arrival_gate']) || valueFrom(enrichment || {}, ['gate_destination', 'arrival_gate'])
  const departureTerminal = valueFrom(flight, ['departure_terminal', 'terminal']) || valueFrom(enrichment || {}, ['terminal_origin', 'departure_terminal'])
  const arrivalTerminal = valueFrom(flight, ['arrival_terminal']) || valueFrom(enrichment || {}, ['terminal_destination', 'arrival_terminal'])
  const sourceProvider = valueFrom(flight, ['source_provider']) || 'supabase'
  const delayMinutes = Math.max(
    numberFrom(enrichment || {}, ['departure_delay', 'arrival_delay', 'delay_minutes'], 0),
    numberFrom(flight, ['departure_delay', 'arrival_delay', 'delay_minutes'], 0),
    minutesBetween(
      valueFrom(enrichment || {}, ['estimated_out', 'estimated_off', 'estimated_in', 'estimated_on']),
      valueFrom(enrichment || {}, ['scheduled_out', 'scheduled_off', 'scheduled_in', 'scheduled_on'])
    ),
    minutesBetween(
      valueFrom(flight, ['estimated_departure', 'estimated_arrival']),
      valueFrom(flight, ['scheduled_departure', 'scheduled_arrival'])
    )
  )
  const loweredStatus = status.toLowerCase()

  return {
    id: valueFrom(flight, ['id']) || undefined,
    route: `${origin} → ${destination}`,
    origin,
    destination,
    carrier: carrierFromFlight(flight),
    flightNumber: valueFrom(flight, ['flight_number', 'ident', 'fa_flight_id']) || 'Flight TBD',
    departureTime,
    arrivalTime,
    aircraft: valueFrom(enrichment || {}, ['aircraft_type']) || valueFrom(flight, ['aircraft', 'aircraft_type', 'equipment']) || 'Unknown',
    status,
    gate: [departureGate, arrivalGate].filter(Boolean).join(' → ') || undefined,
    terminal: [departureTerminal, arrivalTerminal].filter(Boolean).join(' → ') || undefined,
    delayMinutes,
    cancelled: loweredStatus.includes('cancel'),
    diverted: loweredStatus.includes('divert'),
    disruptionSource: enrichment ? 'FlightAware enrichment' : sourceProvider,
    score,
    risk: riskFromScore(score, status),
    source: enrichment ? `${sourceProvider}+flightaware` : sourceProvider
  }
}

function enrichmentKey(flight: Record<string, unknown>) {
  return String(flight.flight_number || flight.ident || flight.fa_flight_id || flight.id || '').replace(/\s+/g, '')
}

export function buildItinerariesFromFlights(flights: Record<string, unknown>[], request: ParsedItineraryRequest, enrichments: Record<string, Record<string, unknown>> = {}) {
  const directLegs = flights
    .filter((flight) => flightMatchesRequest(flight, request))
    .map((flight) => normalizeFlightLeg(flight, enrichments[enrichmentKey(flight)]))

  const directItineraries = directLegs.map((leg) => itineraryFromLegs([leg]))

  if (request.maxLegs < 2 || !request.origin || !request.destination) return directItineraries

  const candidateLegs = flights
    .filter((flight) => flightMatchesCarrier(flight, request.carrier) && flightMatchesDate(flight, request.date))
    .map((flight) => normalizeFlightLeg(flight, enrichments[enrichmentKey(flight)]))
  const firstLegs = candidateLegs.filter((leg) => leg.origin === request.origin && leg.destination !== request.destination)
  const secondLegs = candidateLegs.filter((leg) => leg.destination === request.destination && leg.origin !== request.origin)
  const connectionItineraries = firstLegs
    .flatMap((firstLeg) => secondLegs
      .filter((secondLeg) => secondLeg.origin === firstLeg.destination)
      .map((secondLeg) => itineraryFromLegs([firstLeg, secondLeg]))
    )

  return [...directItineraries, ...connectionItineraries]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
}

function itineraryFromLegs(legs: ItineraryLeg[]): ItineraryResult {
  const score = Math.round(average(legs.map((leg) => leg.score)) - (legs.length - 1) * 5)
  const route = legs.length === 1
    ? legs[0].route
    : [legs[0].origin, ...legs.map((leg) => leg.destination)].join(' → ')
  return {
    id: legs.map((leg) => leg.id || leg.flightNumber).join('-'),
    route,
    legs,
    carrier: [...new Set(legs.map((leg) => leg.carrier))].join(' + '),
    flightNumber: legs.map((leg) => leg.flightNumber).join(' / '),
    departureTime: legs[0].departureTime,
    arrivalTime: legs[legs.length - 1].arrivalTime,
    aircraft: [...new Set(legs.map((leg) => leg.aircraft))].join(' + '),
    status: legs.map((leg) => leg.status).every((status) => status === legs[0].status) ? legs[0].status : 'Mixed',
    gate: legs.map((leg) => leg.gate).filter(Boolean).join(' · ') || undefined,
    terminal: legs.map((leg) => leg.terminal).filter(Boolean).join(' · ') || undefined,
    score,
    risk: riskFromScore(score, legs.map((leg) => leg.status).join(' ')),
    source: legs.some((leg) => leg.source.includes('flightaware'))
      ? `${legs[0].source.replace('+flightaware', '')}+flightaware`
      : legs[0].source
  }
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function carrierLabel(value?: string) {
  return carrierLabels[value || 'all'] || value || 'All Supported Carriers'
}

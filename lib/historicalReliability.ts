export type ReliabilityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
export type ReliabilityConfidence = 'low' | 'medium' | 'high' | 'unknown'
export type ObservedPeriod = 'last-30-days' | 'last-90-days' | 'last-180-days' | 'last-365-days' | 'placeholder'

export type ReliabilitySignal = {
  level: ReliabilityLevel
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown'
  scoreAdjustment: number
  confidence: ReliabilityConfidence
  summary: string
  limitations: string[]
}

export type FlightReliability = {
  carrier: string
  flightNumber: string
  origin: string
  destination: string
  departureHour: number | null
  dayOfWeek: number | null
  onTimeRate: number | null
  averageDelayMinutes: number | null
  cancellationRate: number | null
  diversionRate: number | null
  reliabilityScore: number
  observedPeriod: ObservedPeriod
  confidence: ReliabilityConfidence
}

export type AirportReliability = {
  airport: string
  carrier?: string
  departureHour?: number | null
  dayOfWeek?: number | null
  onTimeRate: number | null
  averageDelayMinutes: number | null
  cancellationRate: number | null
  diversionRate: number | null
  reliabilityScore: number
  observedPeriod: ObservedPeriod
  confidence: ReliabilityConfidence
}

export type CarrierReliability = {
  carrier: string
  origin?: string
  destination?: string
  departureHour?: number | null
  dayOfWeek?: number | null
  onTimeRate: number | null
  averageDelayMinutes: number | null
  cancellationRate: number | null
  diversionRate: number | null
  reliabilityScore: number
  observedPeriod: ObservedPeriod
  confidence: ReliabilityConfidence
}

export type HistoricalReliability = {
  carrier: string
  flightNumber: string
  origin: string
  destination: string
  departureHour: number | null
  dayOfWeek: number | null
  onTimeRate: number | null
  averageDelayMinutes: number | null
  cancellationRate: number | null
  diversionRate: number | null
  reliabilityScore: number
  observedPeriod: ObservedPeriod
  confidence: ReliabilityConfidence
  signal: ReliabilitySignal
  flights: FlightReliability[]
  airports: AirportReliability[]
  carriers: CarrierReliability[]
  observedAt: string
  dataSources: string[]
  futureDataSources: string[]
}

type HistoricalReliabilityLegLike = {
  carrier?: string
  flightNumber?: string
  operatingFlightNumber?: string
  origin?: string
  destination?: string
  departureTime?: string
  status?: string
  delayMinutes?: number
  cancelled?: boolean
  diverted?: boolean
}

type HistoricalReliabilityItineraryLike = {
  carrier?: string
  flightNumber?: string
  route?: string
  legs?: HistoricalReliabilityLegLike[]
  departureTime?: string
  status?: string
  dataFreshnessRule?: string
}

export const historicalReliabilityFutureDataSources = [
  'FlightAware historical',
  'Cirium',
  'AviationStack',
  'FAA BTS',
  'Eurocontrol',
  'Internal analytics'
]

const constrainedAirports = new Set(['SBP', 'OGG', 'NRT', 'HND'])
const historicallyDelaySensitiveAirports = new Set(['BOS', 'EWR', 'JFK', 'LGA', 'ORD', 'SFO', 'LAX'])

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function normalizeAirport(value?: string) {
  return String(value || '').trim().toUpperCase().match(/\b[A-Z]{3}\b/)?.[0] || ''
}

function parseDeparture(value?: string) {
  const parsed = Date.parse(String(value || ''))
  if (!Number.isFinite(parsed)) return { departureHour: null, dayOfWeek: null }
  const date = new Date(parsed)
  return { departureHour: date.getUTCHours(), dayOfWeek: date.getUTCDay() }
}

function routeEndpoints(itinerary: HistoricalReliabilityItineraryLike) {
  const routeCodes = String(itinerary.route || '').split('→').map((code) => normalizeAirport(code)).filter(Boolean)
  return {
    origin: itinerary.legs?.[0]?.origin ? normalizeAirport(itinerary.legs[0].origin) : routeCodes[0] || '',
    destination: itinerary.legs?.length ? normalizeAirport(itinerary.legs[itinerary.legs.length - 1]?.destination) : routeCodes.at(-1) || ''
  }
}

function reliabilityLevel(score: number, confidence: ReliabilityConfidence): ReliabilityLevel {
  if (confidence === 'unknown') return 'unknown'
  if (score >= 86) return 'excellent'
  if (score >= 74) return 'good'
  if (score >= 58) return 'fair'
  return 'poor'
}

export function historicalReliabilityLabel(level: ReliabilityLevel) {
  if (level === 'excellent') return 'Excellent'
  if (level === 'good') return 'Good'
  if (level === 'fair') return 'Fair'
  if (level === 'poor') return 'Poor'
  return 'Unknown'
}

export function historicalReliabilityDisplayLabel(level: ReliabilityLevel) {
  if (level === 'excellent') return '🟢 Excellent'
  if (level === 'good') return '🟡 Good'
  if (level === 'fair') return '🟠 Fair'
  if (level === 'poor') return '🔴 Poor'
  return 'Unknown'
}

export function historicalReliabilityScoreAdjustment(reliability?: HistoricalReliability) {
  if (!reliability || reliability.signal.level === 'unknown') return 0
  const confidenceMultiplier = reliability.confidence === 'high' ? 1 : reliability.confidence === 'medium' ? 0.7 : reliability.confidence === 'low' ? 0.45 : 0
  const base = historicalReliabilityBaseAdjustment(reliability.signal.level)
  return Number((base * confidenceMultiplier).toFixed(2))
}

function historicalReliabilityBaseAdjustment(level: ReliabilityLevel) {
  return level === 'excellent' ? 2.5 : level === 'good' ? 1 : level === 'fair' ? 0 : level === 'poor' ? -3 : 0
}

export function historicalReliabilitySignal(score: number, confidence: ReliabilityConfidence): ReliabilitySignal {
  const level = reliabilityLevel(score, confidence)
  const label = historicalReliabilityLabel(level)
  return {
    level,
    label,
    scoreAdjustment: Number((historicalReliabilityBaseAdjustment(level) * (confidence === 'high' ? 1 : confidence === 'medium' ? 0.7 : confidence === 'low' ? 0.45 : 0)).toFixed(2)),
    confidence,
    summary: level === 'unknown'
      ? 'Historical reliability unavailable.'
      : `Historical reliability ${label.toLowerCase()} (${score}/100).`,
    limitations: [
      'Historical reliability is advisory and does not guarantee future operation.',
      'Placeholder architecture only; no provider integrations or airline scraping are used.'
    ]
  }
}

function flightReliabilityForLeg(leg: HistoricalReliabilityLegLike): FlightReliability {
  const { departureHour, dayOfWeek } = parseDeparture(leg.departureTime)
  const statusText = String(leg.status || '').toLowerCase()
  const cancelled = Boolean(leg.cancelled) || /cancel/.test(statusText)
  const diverted = Boolean(leg.diverted) || /divert/.test(statusText)
  const explicitDelay = typeof leg.delayMinutes === 'number' ? Math.max(0, leg.delayMinutes) : /delay/.test(statusText) ? 35 : 0
  const airportPenalty = [leg.origin, leg.destination].some((airport) => historicallyDelaySensitiveAirports.has(normalizeAirport(airport))) ? 5 : 0
  const constrainedPenalty = [leg.origin, leg.destination].some((airport) => constrainedAirports.has(normalizeAirport(airport))) ? 3 : 0
  const cancellationRate = cancelled ? 100 : 1.8 + constrainedPenalty * 0.25
  const diversionRate = diverted ? 100 : 0.3 + constrainedPenalty * 0.08
  const averageDelayMinutes = cancelled ? 180 : diverted ? 120 : explicitDelay + airportPenalty + constrainedPenalty
  const onTimeRate = clamp(92 - averageDelayMinutes * 0.55 - cancellationRate * 0.8 - diversionRate * 0.6)
  const reliabilityScore = clamp(onTimeRate - averageDelayMinutes * 0.18 - cancellationRate * 1.6 - diversionRate * 1.2)
  const confidence: ReliabilityConfidence = leg.departureTime || leg.status || typeof leg.delayMinutes === 'number' ? 'low' : 'unknown'

  return {
    carrier: leg.carrier || carrierFromFlightNumber(leg.operatingFlightNumber || leg.flightNumber) || 'Unknown',
    flightNumber: leg.operatingFlightNumber || leg.flightNumber || 'Unknown',
    origin: normalizeAirport(leg.origin),
    destination: normalizeAirport(leg.destination),
    departureHour,
    dayOfWeek,
    onTimeRate,
    averageDelayMinutes,
    cancellationRate,
    diversionRate,
    reliabilityScore,
    observedPeriod: 'placeholder',
    confidence
  }
}

function carrierFromFlightNumber(flightNumber?: string) {
  return String(flightNumber || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,3})/)?.[1]
}

function airportReliabilityFromFlights(flights: FlightReliability[]): AirportReliability[] {
  const airports = new Map<string, FlightReliability[]>()
  flights.forEach((flight) => [flight.origin, flight.destination].filter(Boolean).forEach((airport) => airports.set(airport, [...(airports.get(airport) || []), flight])))
  return Array.from(airports.entries()).map(([airport, items]) => ({
    airport,
    onTimeRate: average(items.map((item) => item.onTimeRate).filter((value): value is number => typeof value === 'number')),
    averageDelayMinutes: average(items.map((item) => item.averageDelayMinutes).filter((value): value is number => typeof value === 'number')),
    cancellationRate: average(items.map((item) => item.cancellationRate).filter((value): value is number => typeof value === 'number')),
    diversionRate: average(items.map((item) => item.diversionRate).filter((value): value is number => typeof value === 'number')),
    reliabilityScore: clamp(average(items.map((item) => item.reliabilityScore)) ?? 50),
    observedPeriod: 'placeholder',
    confidence: items.some((item) => item.confidence !== 'unknown') ? 'low' : 'unknown'
  }))
}

function carrierReliabilityFromFlights(flights: FlightReliability[]): CarrierReliability[] {
  const carriers = new Map<string, FlightReliability[]>()
  flights.forEach((flight) => carriers.set(flight.carrier, [...(carriers.get(flight.carrier) || []), flight]))
  return Array.from(carriers.entries()).map(([carrier, items]) => ({
    carrier,
    onTimeRate: average(items.map((item) => item.onTimeRate).filter((value): value is number => typeof value === 'number')),
    averageDelayMinutes: average(items.map((item) => item.averageDelayMinutes).filter((value): value is number => typeof value === 'number')),
    cancellationRate: average(items.map((item) => item.cancellationRate).filter((value): value is number => typeof value === 'number')),
    diversionRate: average(items.map((item) => item.diversionRate).filter((value): value is number => typeof value === 'number')),
    reliabilityScore: clamp(average(items.map((item) => item.reliabilityScore)) ?? 50),
    observedPeriod: 'placeholder',
    confidence: items.some((item) => item.confidence !== 'unknown') ? 'low' : 'unknown'
  }))
}

export function buildHistoricalReliabilityForItinerary(itinerary: HistoricalReliabilityItineraryLike): HistoricalReliability | undefined {
  if (itinerary.dataFreshnessRule === 'route-framework') return undefined
  const legs = itinerary.legs?.length ? itinerary.legs : [{
    carrier: itinerary.carrier,
    flightNumber: itinerary.flightNumber,
    departureTime: itinerary.departureTime,
    status: itinerary.status,
    ...routeEndpoints(itinerary)
  }]
  const flights = legs.map(flightReliabilityForLeg)
  if (!flights.length) return undefined
  const airports = airportReliabilityFromFlights(flights)
  const carriers = carrierReliabilityFromFlights(flights)
  const reliabilityScore = clamp(average(flights.map((flight) => flight.reliabilityScore)) ?? 50)
  const confidence: ReliabilityConfidence = flights.some((flight) => flight.confidence !== 'unknown') ? 'low' : 'unknown'
  const signal = historicalReliabilitySignal(reliabilityScore, confidence)
  const endpoints = routeEndpoints(itinerary)
  const firstFlight = flights[0]

  return {
    carrier: firstFlight.carrier || itinerary.carrier || 'Unknown',
    flightNumber: firstFlight.flightNumber || itinerary.flightNumber || 'Unknown',
    origin: endpoints.origin || firstFlight.origin,
    destination: endpoints.destination || flights.at(-1)?.destination || firstFlight.destination,
    departureHour: firstFlight.departureHour,
    dayOfWeek: firstFlight.dayOfWeek,
    onTimeRate: average(flights.map((flight) => flight.onTimeRate).filter((value): value is number => typeof value === 'number')),
    averageDelayMinutes: average(flights.map((flight) => flight.averageDelayMinutes).filter((value): value is number => typeof value === 'number')),
    cancellationRate: average(flights.map((flight) => flight.cancellationRate).filter((value): value is number => typeof value === 'number')),
    diversionRate: average(flights.map((flight) => flight.diversionRate).filter((value): value is number => typeof value === 'number')),
    reliabilityScore,
    observedPeriod: 'placeholder',
    confidence,
    signal,
    flights,
    airports,
    carriers,
    observedAt: new Date().toISOString(),
    dataSources: ['Deterministic placeholder reliability scaffold'],
    futureDataSources: historicalReliabilityFutureDataSources
  }
}

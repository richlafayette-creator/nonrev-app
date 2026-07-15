import { parseItineraryPrompt } from './itinerarySearch'

export type WorkspaceMode = 'collapsed' | 'expanded' | 'minimized'

export type TripContext = {
  origin?: string
  destination?: string
  date?: string
  travelerBenefits: string[]
  preferredAirlines: string[]
  avoidedAirports: string[]
  maxStops?: number
  connectionPreference?: string
  cabin?: string
  overnightTolerance?: 'allow' | 'avoid'
  selectedItineraryId?: string
  pinnedItineraryIds: string[]
  followUpIntent?: string
}

export type ConversationalLeg = {
  origin?: string
  destination?: string
  carrier?: string
  flightNumber?: string
  departureTime?: string
  arrivalTime?: string
  duration?: string
  aircraft?: string
  status?: string
  source?: string
  sourceProvider?: string
  sourceCheckedAt?: string
}

export type ConversationalItinerary = {
  id: string
  route?: string
  legs?: ConversationalLeg[]
  carrier?: string
  flightNumber?: string
  departureTime?: string
  arrivalTime?: string
  duration?: string
  status?: string
  score?: number
  risk?: string
  source?: string
  sourceProvider?: string
  sourceCheckedAt?: string
  providerBadges?: string[]
  dataFreshnessLabel?: string
  dataFreshnessDetail?: string
  dataFreshnessWarning?: string
  dataFreshnessRule?: string
  requestedDate?: string
  matchedDate?: string
  suggestedRecoveryPaths?: Array<{ id?: string; label: string; note?: string }>
}

export type WorkspaceFilters = {
  maxStops?: number
  exactStops?: number
  avoidAirports: string[]
  carriers: string[]
  sort: 'ranked' | 'earliest' | 'fewest-stops' | 'duration'
}

export type WorkspaceDebug = {
  originCoverage?: {
    status: 'sufficient' | 'insufficient' | 'unknown'
    message?: string
    limitations?: string[]
  }
  providerDiagnostics?: Array<{
    id: string
    category: string
    severity: string
    summary: string
    detail: string
  }>
  routeCoverageSuggestions?: Array<{ id: string; label: string; basis: string }>
  dataFreshnessExplanation?: string[]
  providerExplanation?: string[]
  trueLiveDataUnavailableReason?: string
  safeErrors?: string[]
}

export type WorkspaceResultSet = {
  id: string
  query: string
  context: TripContext
  itineraries: ConversationalItinerary[]
  frameworkRoutes: ConversationalItinerary[]
  warnings: string[]
  source: string
  dataMode: string
  status: string
  debug: WorkspaceDebug | null
  createdAt: string
}

export function emptyTripContext(): TripContext {
  return {
    travelerBenefits: [],
    preferredAirlines: [],
    avoidedAirports: [],
    pinnedItineraryIds: []
  }
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.toUpperCase())))
}

export function mergeTripContext(previous: TripContext, prompt: string): TripContext {
  const parsed = parseItineraryPrompt(prompt)
  const lower = prompt.toLowerCase()
  const airportCodes = unique(prompt.match(/\b[A-Za-z]{3}\b/g) || [])
  const avoided = unique([
    ...previous.avoidedAirports,
    ...(lower.match(/\bavoid\s+([a-z]{3})\b/g) || []).map((value) => value.replace(/avoid\s+/i, ''))
  ])
  const preferredAirlines = unique([
    ...previous.preferredAirlines,
    lower.includes('united') || /\bua\b/i.test(prompt) ? 'United' : undefined,
    lower.includes('ana') || /\bnh\b/i.test(prompt) ? 'ANA' : undefined,
    lower.includes('delta') || /\bdl\b/i.test(prompt) ? 'Delta' : undefined,
    lower.includes('american') || /\baa\b/i.test(prompt) ? 'American' : undefined,
    lower.includes('alaska') || /\bas\b/i.test(prompt) ? 'Alaska' : undefined,
    lower.includes('hawaiian') || /\bha\b/i.test(prompt) ? 'Hawaiian' : undefined
  ])

  const maxStops = /\bnonstop\b|\bdirect\b/.test(lower)
    ? 0
    : /\bone[-\s]?stop\b|\b1 stop\b/.test(lower)
      ? 1
      : /\btwo[-\s]?stop\b|\b2 stops?\b/.test(lower)
        ? 2
        : previous.maxStops

  const cabin = lower.includes('business')
    ? 'business'
    : lower.includes('first')
      ? 'first'
      : lower.includes('premium economy')
        ? 'premium economy'
        : lower.includes('economy')
          ? 'economy'
          : previous.cabin

  const overnightTolerance = lower.includes('avoid overnight') || lower.includes('no overnight')
    ? 'avoid'
    : lower.includes('overnight ok') || lower.includes('overnight is ok')
      ? 'allow'
      : previous.overnightTolerance

  return {
    ...previous,
    origin: parsed.origin || previous.origin,
    destination: parsed.destination || previous.destination,
    date: parsed.date || previous.date,
    travelerBenefits: previous.travelerBenefits,
    preferredAirlines,
    avoidedAirports: avoided.length ? avoided : airportCodes.filter((code) => lower.includes(`avoid ${code.toLowerCase()}`)),
    maxStops,
    cabin,
    overnightTolerance,
    connectionPreference: lower.includes('earliest') ? 'earliest arrival' : previous.connectionPreference,
    followUpIntent: classifyFollowUpIntent(prompt)
  }
}

export function classifyFollowUpIntent(prompt: string) {
  const lower = prompt.toLowerCase()
  if (/\bshow everything\b|\bshow all\b|\bclear filters\b/.test(lower)) return 'show-all'
  if (/\bone[-\s]?stop\b|\bnonstop\b|\bstops?\b/.test(lower)) return 'filter-stops'
  if (/\bavoid\s+[a-z]{3}\b/.test(lower)) return 'avoid-airport'
  if (/\bearliest\b|\barrives first\b/.test(lower)) return 'earliest-arrival'
  if (/\bsafest\b|\bbackup\b/.test(lower)) return 'backup'
  if (/\bana\b|\bunited\b|\bdelta\b|\bamerican\b|\balaska\b|\bhawaiian\b/.test(lower)) return 'carrier-filter'
  if (/\bcompare\b/.test(lower)) return 'compare'
  if (/\bfirst leg fills\b|\bfills\b/.test(lower)) return 'first-leg-fills'
  return 'new-search'
}

export function promptRequiresProviderRefresh(prompt: string, current: TripContext) {
  const parsed = parseItineraryPrompt(prompt)
  if (parsed.origin && parsed.origin !== current.origin) return true
  if (parsed.destination && parsed.destination !== current.destination) return true
  if (parsed.date && parsed.date !== current.date) return true
  return !current.origin && !current.destination
}

export function routeAirports(itinerary: ConversationalItinerary) {
  if (itinerary.legs?.length) {
    const firstOrigin = itinerary.legs[0]?.origin
    return unique([
      firstOrigin,
      ...itinerary.legs.map((leg) => leg.destination)
    ])
  }
  return unique(itinerary.route?.match(/\b[A-Za-z]{3}\b/g) || [])
}

export function itineraryStopCount(itinerary: ConversationalItinerary) {
  if (itinerary.legs?.length) return Math.max(0, itinerary.legs.length - 1)
  return Math.max(0, routeAirports(itinerary).length - 2)
}

function parseTime(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function parseDurationMinutes(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY
  const hourMatch = value.match(/(\d+)\s*h/i)
  const minuteMatch = value.match(/(\d+)\s*m/i)
  if (!hourMatch && !minuteMatch) return Number.POSITIVE_INFINITY
  return (hourMatch ? Number(hourMatch[1]) * 60 : 0) + (minuteMatch ? Number(minuteMatch[1]) : 0)
}

export function applyWorkspaceFilters(itineraries: ConversationalItinerary[], filters: WorkspaceFilters) {
  const visible = itineraries.filter((itinerary) => {
    if (typeof filters.exactStops === 'number' && itineraryStopCount(itinerary) !== filters.exactStops) return false
    if (typeof filters.maxStops === 'number' && itineraryStopCount(itinerary) > filters.maxStops) return false
    const airports = routeAirports(itinerary)
    if (filters.avoidAirports.some((airport) => airports.includes(airport.toUpperCase()))) return false
    if (filters.carriers.length) {
      const carrierText = `${itinerary.carrier || ''} ${itinerary.flightNumber || ''} ${itinerary.legs?.map((leg) => `${leg.carrier || ''} ${leg.flightNumber || ''}`).join(' ') || ''}`.toLowerCase()
      if (!filters.carriers.some((carrier) => carrierText.includes(carrier.toLowerCase()))) return false
    }
    return true
  })

  return [...visible].sort((a, b) => {
    if (filters.sort === 'earliest') return parseTime(a.arrivalTime || a.legs?.[a.legs.length - 1]?.arrivalTime) - parseTime(b.arrivalTime || b.legs?.[b.legs.length - 1]?.arrivalTime)
    if (filters.sort === 'fewest-stops') return itineraryStopCount(a) - itineraryStopCount(b)
    if (filters.sort === 'duration') return parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration)
    return (b.score || 0) - (a.score || 0)
  })
}

export function summarizeVerifiedResult(result: WorkspaceResultSet) {
  const count = result.itineraries.length
  if (count > 0) {
    return `${count} viable scheduled itinerar${count === 1 ? 'y' : 'ies'} found from verified structured result data. Load availability is separate and only shown when a verified source is attached.`
  }
  if (result.frameworkRoutes.length > 0) {
    return `${result.frameworkRoutes.length} route framework${result.frameworkRoutes.length === 1 ? '' : 's'} found, but current schedule availability was not attached. I will not treat frameworks as live availability.`
  }
  return result.status || 'No current live itinerary data is available for that request.'
}

export function noLoadDataLabel(itinerary: ConversationalItinerary) {
  const badges = itinerary.providerBadges?.join(' ').toLowerCase() || ''
  if (badges.includes('load') || badges.includes('seat')) return 'Load data attached by source'
  return 'Load data unavailable'
}

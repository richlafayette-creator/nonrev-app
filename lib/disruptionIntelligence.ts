import { airportCodesFromRoute } from './airportMapScaffold'
import type { ItineraryLeg } from './itinerarySearch'

export type RouteHealthIndicator = 'Green' | 'Yellow' | 'Red'

export type DisruptionSignal = {
  label: string
  count: number
  impact: number
  details: string[]
}

export type DisruptionIntelligence = {
  route: string
  routeHealth: RouteHealthIndicator
  disruptionImpactScore: number
  successProbabilityImpact: number
  routeRankingImpact: number
  delays: DisruptionSignal
  cancellations: DisruptionSignal
  diversions: DisruptionSignal
  airportOperationalAlerts: DisruptionSignal
  dataSources: string[]
  backupRouteRecommendations: string[]
  explanation: string[]
}

type DisruptionInput = {
  route: string
  legs?: Array<Partial<ItineraryLeg> & { delayMinutes?: number; cancelled?: boolean; diverted?: boolean; disruptionSource?: string }>
  fallbackStatus?: string
  sourceLabel?: string
  flightAwareStatus?: string
}

function clamp(value: number, min = 0, max = 99) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizedStatus(value?: string) {
  return (value || '').toLowerCase()
}

function statusDelayMinutes(status: string, explicitDelay?: number) {
  if (Number.isFinite(explicitDelay) && explicitDelay) return Math.max(0, Math.round(explicitDelay || 0))
  const minuteMatch = status.match(/(\d{1,3})\s*(?:m|min|minute)/i)
  if (minuteMatch) return Number(minuteMatch[1])
  if (status.includes('delayed') || status.includes('late')) return 45
  if (status.includes('weather') || status.includes('ground stop') || status.includes('ground delay')) return 60
  return 0
}

function airportAlertFor(code: string) {
  const alerts: Record<string, string> = {
    EWR: 'Newark congestion placeholder: expect flow-control sensitivity during irregular operations.',
    JFK: 'JFK operational alert placeholder: monitor international bank delays and gate holds.',
    LGA: 'LaGuardia operational alert placeholder: short-haul disruption can cascade quickly.',
    SFO: 'SFO weather/ceiling placeholder: fog or runway configuration changes can reduce throughput.',
    ORD: 'Chicago operational alert placeholder: weather and connection banks can amplify missed-connection risk.',
    DEN: 'Denver operational alert placeholder: thunderstorms or deicing windows can affect recovery routing.',
    DFW: 'DFW operational alert placeholder: storm cells can create rolling delay programs.',
    ATL: 'Atlanta operational alert placeholder: high-volume banks can compound late inbound aircraft.',
    LAX: 'LAX operational alert placeholder: gate congestion can slow turns and same-day recovery.',
    SEA: 'Seattle operational alert placeholder: weather and Alaska/Hawaiian flow can affect alternates.',
    HNL: 'Honolulu operational alert placeholder: island-hopper disruptions can limit same-day backup space.',
    OGG: 'Maui operational alert placeholder: fewer long-haul frequencies increase recovery risk.'
  }
  return alerts[code]
}

function routeHealthFromImpact(score: number): RouteHealthIndicator {
  if (score >= 50) return 'Red'
  if (score >= 22) return 'Yellow'
  return 'Green'
}

function signal(label: string, count: number, impact: number, details: string[]): DisruptionSignal {
  return { label, count, impact: clamp(impact, 0, 99), details }
}

export function routeHealthColor(health: RouteHealthIndicator) {
  if (health === 'Green') return '#22c55e'
  if (health === 'Yellow') return '#facc15'
  return '#f87171'
}

export function buildDisruptionIntelligence(input: DisruptionInput): DisruptionIntelligence {
  const legs = input.legs || []
  const routeAirports = [...new Set([...airportCodesFromRoute(input.route), ...legs.flatMap((leg) => [leg.origin, leg.destination].filter(Boolean) as string[])])]
  const statuses = legs.map((leg) => normalizedStatus(leg.status)).filter(Boolean)
  const statusText = [...statuses, normalizedStatus(input.fallbackStatus)].join(' ')
  const flightAwareAvailable = legs.some((leg) => String(leg.source || '').toLowerCase().includes('flightaware')) || String(input.sourceLabel || '').toLowerCase().includes('flightaware') || String(input.flightAwareStatus || '').includes('enriched')

  const delayDetails = legs
    .map((leg) => ({ leg, minutes: statusDelayMinutes(normalizedStatus(leg.status), leg.delayMinutes) }))
    .filter((item) => item.minutes > 0)
    .map((item) => `${item.leg.flightNumber || item.leg.route || 'Flight'} shows about ${item.minutes} minute${item.minutes === 1 ? '' : 's'} of delay signal.`)
  const fallbackDelay = !delayDetails.length && (statusText.includes('delayed') || statusText.includes('late') || statusText.includes('weather'))
    ? ['Status text indicates delay/weather risk; no exact delay minutes available yet.']
    : []
  const totalDelayMinutes = legs.reduce((total, leg) => total + statusDelayMinutes(normalizedStatus(leg.status), leg.delayMinutes), 0) || (fallbackDelay.length ? 45 : 0)

  const cancellationDetails = legs
    .filter((leg) => leg.cancelled || normalizedStatus(leg.status).includes('cancel'))
    .map((leg) => `${leg.flightNumber || leg.route || 'Flight'} is marked cancelled or cancellation-risk.`)
  const fallbackCancellation = !cancellationDetails.length && statusText.includes('cancel')
    ? ['Status text contains cancellation risk; exact impacted flight is pending.']
    : []

  const diversionDetails = legs
    .filter((leg) => leg.diverted || normalizedStatus(leg.status).includes('divert'))
    .map((leg) => `${leg.flightNumber || leg.route || 'Flight'} is marked diverted or diversion-risk.`)
  const fallbackDiversion = !diversionDetails.length && statusText.includes('divert')
    ? ['Status text contains diversion risk; exact diversion airport is pending.']
    : []

  const airportAlertDetails = routeAirports
    .map((code) => airportAlertFor(code))
    .filter(Boolean) as string[]
  const activeAirportAlerts = airportAlertDetails.slice(0, 3)

  const delays = signal('Delays', delayDetails.length + fallbackDelay.length, Math.min(28, totalDelayMinutes / 4), delayDetails.length ? delayDetails : fallbackDelay)
  const cancellations = signal('Cancellations', cancellationDetails.length + fallbackCancellation.length, (cancellationDetails.length + fallbackCancellation.length) * 38, cancellationDetails.length ? cancellationDetails : fallbackCancellation)
  const diversions = signal('Diversions', diversionDetails.length + fallbackDiversion.length, (diversionDetails.length + fallbackDiversion.length) * 32, diversionDetails.length ? diversionDetails : fallbackDiversion)
  const airportOperationalAlerts = signal('Airport operational alerts', activeAirportAlerts.length, activeAirportAlerts.length * 7, activeAirportAlerts)

  const disruptionImpactScore = clamp(delays.impact + cancellations.impact + diversions.impact + airportOperationalAlerts.impact, 0, 99)
  const routeHealth = routeHealthFromImpact(disruptionImpactScore)
  const successProbabilityImpact = -clamp(disruptionImpactScore * 0.38, 0, 32)
  const routeRankingImpact = -clamp(disruptionImpactScore * 0.3, 0, 28)
  const cleanRoute = input.route.replace(/\s+/g, ' ')

  return {
    route: input.route,
    routeHealth,
    disruptionImpactScore,
    successProbabilityImpact,
    routeRankingImpact,
    delays,
    cancellations,
    diversions,
    airportOperationalAlerts,
    dataSources: [
      flightAwareAvailable ? 'FlightAware enrichment available' : 'FlightAware not configured/available; using local status scaffold',
      legs.length ? `${legs.length} live itinerary leg${legs.length === 1 ? '' : 's'}` : 'Fallback planning route shape',
      activeAirportAlerts.length ? 'Local airport operational alert scaffold' : 'No local airport alert match'
    ],
    backupRouteRecommendations: [
      routeHealth === 'Green'
        ? `${cleanRoute} is healthy; keep the next ranked route as a monitor-only backup.`
        : `${cleanRoute} has ${routeHealth.toLowerCase()} health; prioritize the next ranked route with fewer impacted airports.`,
      cancellations.count || diversions.count
        ? 'Use a nonstop or alternate-hub backup before relying on a disrupted connection.'
        : 'Prefer backups with lower delay signal, fewer connections, and larger same-day frequency.',
      activeAirportAlerts.length
        ? `Watch alternates that avoid ${routeAirports.slice(0, 2).join(' / ')} if airport alerts intensify.`
        : 'No specific airport-alert avoidance needed yet; keep normal backup monitoring active.'
    ],
    explanation: [
      `Disruption impact score is ${disruptionImpactScore}/99 from delays (${delays.impact}), cancellations (${cancellations.impact}), diversions (${diversions.impact}), and airport alerts (${airportOperationalAlerts.impact}).`,
      `Success probability receives a ${successProbabilityImpact} point adjustment and route ranking receives a ${routeRankingImpact} point adjustment in this placeholder model.`,
      flightAwareAvailable
        ? 'Existing FlightAware enrichment is included when present on live itinerary legs.'
        : 'FlightAware is not available for this route right now, so the scaffold falls back to current itinerary status and local airport alerts.',
      `Route health is ${routeHealth}: Green means normal monitoring, Yellow means backup should be ready, Red means route should be actively avoided or heavily backed up.`
    ]
  }
}

import { airportMapScaffolds, airportScaffoldFor } from './airportMapScaffold'
import { positioningHubsForOrigin } from './routeCoverageFallback'

export type OriginCoverageStatus = 'sufficient' | 'insufficient' | 'unknown'

export type OriginCoverageRecommendation = {
  code: string
  name: string
  distanceMiles?: number
  searchQuery?: string
  reason: string
}

export type OriginCoverageDiagnostic = {
  status: OriginCoverageStatus
  origin?: string
  destination?: string
  providerOriginRowCount: number
  frameworkRouteCount: number
  message: string
  recommendations: OriginCoverageRecommendation[]
  limitations: string[]
}

export type OriginCoverageDiagnosticInput = {
  origin?: string
  destination?: string
  providerOriginRowCount?: number
  frameworkRouteCount?: number
  recommendationLimit?: number
}

const supportedProviderOriginCodes = [
  'ATL', 'BUR', 'CDG', 'CLT', 'DCA', 'DEN', 'DFW', 'DTW', 'EWR', 'FCO', 'HND', 'HNL', 'IAD', 'IAH', 'JFK', 'LAX', 'LGA', 'LGW', 'LHR', 'MSP', 'NRT', 'OAK', 'OGG', 'ORD', 'ORY', 'PHX', 'SEA', 'SFO', 'SJC', 'SNA'
]

export const supportedProviderOriginAirports = new Set(supportedProviderOriginCodes)

const limitations = [
  'Origin coverage guidance is advisory and does not confirm standby availability, seat inventory, load factor, clearance probability, delay, or cancellation.',
  'Nearest supported airports are alternate search origins only; any ground/positioning travel from the requested origin must be planned separately.',
  'No flights are fabricated when requested-origin provider coverage is limited.'
]

function normalizeAirportCode(value?: string) {
  const code = value?.trim().toUpperCase()
  return code && /^[A-Z]{3}$/.test(code) ? code : undefined
}

function radians(value: number) {
  return value * Math.PI / 180
}

function milesBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthRadiusMiles = 3958.8
  const dLat = radians(b.latitude - a.latitude)
  const dLon = radians(b.longitude - a.longitude)
  const lat1 = radians(a.latitude)
  const lat2 = radians(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return Math.round(earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)))
}

function recommendationFor(code: string, originScaffold: NonNullable<ReturnType<typeof airportScaffoldFor>>, destination?: string): OriginCoverageRecommendation | null {
  const scaffold = airportScaffoldFor(code)
  if (!scaffold || code === originScaffold.code) return null
  return {
    code,
    name: scaffold.name,
    distanceMiles: milesBetween(originScaffold, scaffold),
    searchQuery: destination ? `${code} → ${destination}` : code,
    reason: destination
      ? `Search ${code} → ${destination} as a supported alternate origin; keep travel from ${originScaffold.code} to ${code} separate from flight availability.`
      : `Use ${code} as a supported alternate origin; keep travel from ${originScaffold.code} to ${code} separate from flight availability.`
  }
}

export function nearestSupportedOriginAirports(origin?: string, destination?: string, limit = 3): OriginCoverageRecommendation[] {
  const code = normalizeAirportCode(origin)
  const originScaffold = airportScaffoldFor(code)
  if (!code || !originScaffold) return []

  const mappedHubs = positioningHubsForOrigin(code).filter((hub) => supportedProviderOriginAirports.has(hub))
  const nearest = Object.keys(airportMapScaffolds)
    .filter((candidate) => supportedProviderOriginAirports.has(candidate) && candidate !== code)
    .map((candidate) => recommendationFor(candidate, originScaffold, destination))
    .filter((candidate): candidate is OriginCoverageRecommendation => Boolean(candidate))
    .sort((a, b) => (a.distanceMiles ?? Number.MAX_SAFE_INTEGER) - (b.distanceMiles ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code))

  const orderedCodes = [...new Set([...mappedHubs, ...nearest.map((item) => item.code)])]
  return orderedCodes
    .map((candidate) => recommendationFor(candidate, originScaffold, destination))
    .filter((candidate): candidate is OriginCoverageRecommendation => Boolean(candidate))
    .slice(0, limit)
}

export function buildOriginCoverageDiagnostic(input: OriginCoverageDiagnosticInput): OriginCoverageDiagnostic {
  const origin = normalizeAirportCode(input.origin)
  const destination = normalizeAirportCode(input.destination)
  const providerOriginRowCount = Math.max(0, Math.floor(input.providerOriginRowCount || 0))
  const frameworkRouteCount = Math.max(0, Math.floor(input.frameworkRouteCount || 0))
  const recommendationLimit = input.recommendationLimit || 3

  if (!origin) {
    return {
      status: 'unknown',
      origin,
      destination,
      providerOriginRowCount,
      frameworkRouteCount,
      message: 'Origin coverage could not be evaluated because the search did not contain a valid three-letter origin.',
      recommendations: [],
      limitations
    }
  }

  if (providerOriginRowCount > 0 || supportedProviderOriginAirports.has(origin)) {
    return {
      status: 'sufficient',
      origin,
      destination,
      providerOriginRowCount,
      frameworkRouteCount,
      message: providerOriginRowCount > 0
        ? `${providerOriginRowCount} provider row${providerOriginRowCount === 1 ? '' : 's'} included requested origin ${origin}; origin coverage was not treated as a blocker.`
        : `${origin} is in the supported origin set; missing rows are treated as route/date/provider availability, not an origin-coverage failure.`,
      recommendations: [],
      limitations
    }
  }

  const recommendations = nearestSupportedOriginAirports(origin, destination, recommendationLimit)
  const recommendationText = recommendations.length
    ? ` Try nearby supported origin${recommendations.length === 1 ? '' : 's'} ${recommendations.map((item) => item.code).join(', ')} instead.`
    : ' No nearby supported origin recommendation is available from the local airport scaffold yet.'
  const frameworkText = frameworkRouteCount > 0
    ? ` ${frameworkRouteCount} complete route framework${frameworkRouteCount === 1 ? '' : 's'} may still be shown as planning guidance only.`
    : ' No complete endpoint-safe route framework could be built from this origin right now.'

  return {
    status: 'insufficient',
    origin,
    destination,
    providerOriginRowCount,
    frameworkRouteCount,
    message: `Provider coverage from requested origin ${origin} is limited for this search, so Nonrevy will not fail the request or invent ${origin} flights.${recommendationText}${frameworkText}`,
    recommendations,
    limitations
  }
}

import { buildRouteCoverageFallbackSuggestions, destinationAirportGroup, positioningHubsForOrigin, type RouteCoverageSuggestion } from './routeCoverageFallback'
import type { ItineraryResult, ParsedItineraryRequest } from './itinerarySearch'

export type RecoveryFactorBreakdown = {
  flightsPerDay: number
  flightsPerDayScore: number
  alternateAirportCount: number
  alternateAirportScore: number
  carrierCount: number
  carrierScore: number
  historicalAvailabilityCount: number
  historicalAvailabilityScore: number
  positioningHubCount: number
  positioningHubScore: number
  communityLoadSignal: 'none' | 'available'
  communityLoadScore: number
}

export type SuggestedRecoveryPath = {
  id: string
  label: string
  route?: string
  kind: 'nearby-origin' | 'nearby-destination' | 'alternate-carrier' | 'next-day' | 'positioning' | 'positioning-connection'
  confidence: 'Conservative'
  note: string
}

export type RecoveryIntelligence = {
  recoveryStrength: number
  label: 'Strong recovery options' | 'Some recovery options' | 'Limited recovery options'
  explanation: string
  factors: RecoveryFactorBreakdown
  suggestedRecoveryPaths: SuggestedRecoveryPath[]
  evaluated: {
    nearbyOriginAirports: string[]
    nearbyDestinationAirports: string[]
    alternateCarriers: string[]
    nextDayDeparture?: string
    positioningHubs: string[]
  }
}

export type RecoveryInput = {
  request: ParsedItineraryRequest
  itineraries?: ItineraryResult[]
  routeCoverageSuggestions?: RouteCoverageSuggestion[]
  exactFlightCount?: number
  candidateFlightCount?: number
  providerCacheCount?: number
  historicalAvailabilityCount?: number
  communityReportCount?: number
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim().toUpperCase()).filter(Boolean) as string[])]
}

function nextDay(date?: string) {
  if (!date) return undefined
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return undefined
  parsed.setUTCDate(parsed.getUTCDate() + 1)
  return parsed.toISOString().slice(0, 10)
}

function carrierCodes(itineraries: ItineraryResult[] = []) {
  return unique(itineraries.flatMap((itinerary) => [itinerary.carrier, ...itinerary.legs.map((leg) => leg.carrier)]))
}

function routeFromSuggestion(suggestion: RouteCoverageSuggestion): SuggestedRecoveryPath {
  return {
    id: `recovery-route-${suggestion.id}`,
    label: suggestion.searchQuery,
    route: suggestion.searchQuery,
    kind: 'positioning-connection',
    confidence: 'Conservative',
    note: suggestion.providerResultCount > 0
      ? `${suggestion.providerResultCount} provider/cache row${suggestion.providerResultCount === 1 ? '' : 's'} support checking this path, but it is still route guidance only.`
      : 'Complete route framework only. Search live availability before acting.'
  }
}

function recoveryAirportPath(origin: string | undefined, airport: string, kind: SuggestedRecoveryPath['kind']): SuggestedRecoveryPath {
  return {
    id: `recovery-airport-${origin || 'any'}-${airport}`.toLowerCase(),
    label: `Position to ${airport}`,
    route: origin ? `${origin} → ${airport}` : airport,
    kind,
    confidence: 'Conservative',
    note: 'Recovery guidance only'
  }
}

function buildSuggestedPaths(input: RecoveryInput, routeSuggestions: RouteCoverageSuggestion[], hubs: string[], destinationAlternates: string[]) {
  const paths: SuggestedRecoveryPath[] = []
  routeSuggestions.slice(0, 6).forEach((suggestion) => paths.push(routeFromSuggestion(suggestion)))

  const recoveryAirportCandidates = unique([
    ...hubs.slice(0, 5).flatMap((hub) => [hub, ...destinationAirportGroup(hub).filter((alternate) => alternate !== hub)]),
    ...destinationAlternates.slice(0, 3)
  ])
  recoveryAirportCandidates.forEach((airport) => {
    if (airport !== input.request.origin && airport !== input.request.destination) paths.push(recoveryAirportPath(input.request.origin, airport, 'positioning'))
  })

  const dayAfter = nextDay(input.request.date)

  if (dayAfter) {
    paths.push({
      id: `recovery-next-day-${dayAfter}`,
      label: `Try ${dayAfter} departure`,
      kind: 'next-day',
      confidence: 'Conservative',
      note: 'Experienced nonrev travelers often compare the next departure day when the current day is weak.'
    })
  }

  if (input.request.carrier && input.request.carrier !== 'all') {
    paths.push({
      id: 'recovery-alternate-carriers',
      label: 'Search with carrier set to all',
      kind: 'alternate-carrier',
      confidence: 'Conservative',
      note: 'Carrier flexibility can improve recovery, but only live returned flights should be treated as availability.'
    })
  }

  const deduped = new Map<string, SuggestedRecoveryPath>()
  paths.forEach((path) => {
    const key = [path.kind, path.route || path.label].join('|')
    if (!deduped.has(key)) deduped.set(key, path)
  })
  return [...deduped.values()].slice(0, 10)
}

function recoveryExplanation(score: number, hubs: string[], destinationAlternates: string[], carriers: string[]) {
  const hubsText = hubs.slice(0, 2).join(' and ')
  if (score >= 70 && hubsText) return `Multiple backup options exist through ${hubsText}.`
  if (score >= 55 && (hubs.length || destinationAlternates.length || carriers.length > 1)) return 'Some backup options exist, but recovery should stay conservative until live availability appears.'
  if (hubsText) return `Recovery opportunities are limited, but positioning through ${hubsText} may be worth checking.`
  return 'Recovery opportunities are limited for this route right now.'
}

export function buildRecoveryIntelligence(input: RecoveryInput): RecoveryIntelligence {
  const itineraries = input.itineraries || []
  const fallbackSuggestions = input.routeCoverageSuggestions?.length
    ? input.routeCoverageSuggestions
    : buildRouteCoverageFallbackSuggestions(input.request, 8)
  const hubs = positioningHubsForOrigin(input.request.origin)
  const destinationAlternates = destinationAirportGroup(input.request.destination).filter((code) => code !== input.request.destination)
  const nearbyOriginAirports = unique([...hubs, ...fallbackSuggestions.map((suggestion) => suggestion.via || suggestion.origin).filter((code) => code !== input.request.origin)])
  const carriers = carrierCodes(itineraries)
  const historicalAvailabilityCount = Math.max(
    input.historicalAvailabilityCount || 0,
    input.providerCacheCount || 0,
    fallbackSuggestions.reduce((total, suggestion) => total + suggestion.providerResultCount, 0)
  )
  const flightsPerDay = Math.max(input.exactFlightCount || 0, itineraries.length)
  const alternateAirportCount = unique([...nearbyOriginAirports, ...destinationAlternates]).length
  const carrierCount = Math.max(carriers.length, input.request.carrier && input.request.carrier !== 'all' ? 1 : 0)
  const communityReportCount = input.communityReportCount || 0

  const factors: RecoveryFactorBreakdown = {
    flightsPerDay,
    flightsPerDayScore: clamp(flightsPerDay * 8, 0, 25),
    alternateAirportCount,
    alternateAirportScore: clamp(alternateAirportCount * 5, 0, 20),
    carrierCount,
    carrierScore: clamp(carrierCount * 7, 0, 15),
    historicalAvailabilityCount,
    historicalAvailabilityScore: clamp(historicalAvailabilityCount * 4, 0, 20),
    positioningHubCount: hubs.length,
    positioningHubScore: clamp(hubs.length * 4, 0, 20),
    communityLoadSignal: communityReportCount > 0 ? 'available' : 'none',
    communityLoadScore: clamp(communityReportCount * 5, 0, 10)
  }

  const recoveryStrength = clamp(
    factors.flightsPerDayScore +
    factors.alternateAirportScore +
    factors.carrierScore +
    factors.historicalAvailabilityScore +
    factors.positioningHubScore +
    factors.communityLoadScore
  )

  return {
    recoveryStrength,
    label: recoveryStrength >= 70 ? 'Strong recovery options' : recoveryStrength >= 45 ? 'Some recovery options' : 'Limited recovery options',
    explanation: recoveryExplanation(recoveryStrength, hubs, destinationAlternates, carriers),
    factors,
    suggestedRecoveryPaths: buildSuggestedPaths(input, fallbackSuggestions, hubs, destinationAlternates),
    evaluated: {
      nearbyOriginAirports,
      nearbyDestinationAirports: destinationAlternates,
      alternateCarriers: carriers,
      nextDayDeparture: nextDay(input.request.date),
      positioningHubs: hubs
    }
  }
}

export function blendRecoveryIntoItineraryScores(itineraries: ItineraryResult[], recovery: RecoveryIntelligence) {
  return itineraries.map((itinerary) => {
    const historicalRouteStrength = recovery.factors.historicalAvailabilityScore * 5
    const communityLoadStrength = recovery.factors.communityLoadScore * 10
    const scoreCap = itinerary.productionAvailability === false
      ? itinerary.dataFreshnessRule === 'cached-provider-current' ? 82 : 74
      : 99
    const blendedScore = clamp(
      itinerary.score * 0.76 +
      historicalRouteStrength * 0.08 +
      communityLoadStrength * 0.04 +
      recovery.recoveryStrength * 0.12,
      1,
      scoreCap
    )
    return {
      ...itinerary,
      score: blendedScore,
      recoveryStrength: recovery.recoveryStrength,
      recoveryExplanation: recovery.explanation,
      recoveryFactors: recovery.factors,
      suggestedRecoveryPaths: recovery.suggestedRecoveryPaths.slice(0, 5)
    }
  })
}

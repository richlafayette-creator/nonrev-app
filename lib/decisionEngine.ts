import { buildEndToEndTripPlan } from './endToEndTrip'
import type { ItineraryLeg, ItineraryResult, ParsedItineraryRequest } from './itinerarySearch'

export type DecisionStatus = 'Green' | 'Yellow' | 'Red'

export type RecommendationLabel = 'Best overall choice' | 'Earliest arrival' | 'Shortest travel day' | 'Strong backup options' | 'Safest connection'

export type DecisionScore = {
  arrivalScore: number
  travelTimeScore: number
  stopsScore: number
  connectionSafetyScore: number
  backupStrengthScore: number
  completionScore: number
  weatherRiskScore: number
  misconnectRiskScore: number
  airportComplexityScore: number
  airlinePreferenceScore: number
  alternateAirportScore: number
  overnightPenaltyScore: number
  overallScore: number
}

export type Recommendation = {
  label: RecommendationLabel
  status: DecisionStatus
  sentence: string
  reasons: string[]
}

export type DecisionFactors = {
  arrivalRank: number
  totalItineraries: number
  departureTime: number | null
  arrivalTime: number | null
  totalTravelMinutes: number | null
  connectionCount: number
  stops: number
  connectionBuffers: number[]
  minimumConnectionBuffer: number | null
  backupOpportunities: number
  airlineChanges: number
  airportDiscontinuities: number
  overnightRequired: boolean
  completionState: 'complete' | 'framework' | 'incomplete'
  weatherRiskLevel: 'unknown' | 'low' | 'medium' | 'high'
  preferredAirlineMatched: boolean
  alternateAirportUsed: boolean
  airportComplexity: number
  sourceProvider?: string
}

export type RankingWeights = Partial<Record<keyof Omit<DecisionScore, 'overallScore'>, number>>

export type DecisionEngineResult<TItinerary extends ItineraryResult = ItineraryResult> = {
  itinerary: TItinerary
  decisionScore: DecisionScore
  recommendation: Recommendation
  factors: DecisionFactors
  status: DecisionStatus
  rank: number
}

type FactorScorer = {
  key: keyof Omit<DecisionScore, 'overallScore'>
  score: (factors: DecisionFactors, context: DecisionEngineContext) => number
}

type DecisionEngineContext = {
  request?: ParsedItineraryRequest
  itineraries: ItineraryResult[]
  earliestArrival: number | null
  latestArrival: number | null
  shortestTravelMinutes: number | null
  longestTravelMinutes: number | null
  weights: Required<RankingWeights>
  airportComplexityScores: Record<string, number>
}

export type DecisionEngineOptions = {
  request?: ParsedItineraryRequest
  weights?: RankingWeights
  airportComplexityScores?: Record<string, number>
}

const defaultRankingWeights: Required<RankingWeights> = {
  arrivalScore: 0.2,
  travelTimeScore: 0.12,
  stopsScore: 0.08,
  connectionSafetyScore: 0.13,
  backupStrengthScore: 0.13,
  completionScore: 0.11,
  weatherRiskScore: 0.06,
  misconnectRiskScore: 0.1,
  airportComplexityScore: 0.06,
  airlinePreferenceScore: 0.04,
  alternateAirportScore: 0.03,
  overnightPenaltyScore: 0.06
}

const defaultAirportComplexityScores: Record<string, number> = {
  ATL: 58,
  BOS: 68,
  DEN: 64,
  DFW: 60,
  EWR: 52,
  HND: 72,
  HNL: 76,
  IAD: 68,
  IAH: 64,
  JFK: 50,
  LAX: 56,
  NRT: 72,
  OGG: 78,
  ORD: 55,
  PDX: 82,
  PHX: 76,
  SAN: 80,
  SBP: 86,
  SEA: 70,
  SFO: 62
}

const factorScorers: FactorScorer[] = [
  {
    key: 'arrivalScore',
    score: (factors, context) => lowerIsBetter(factors.arrivalTime, context.earliestArrival, context.latestArrival, factors.arrivalTime ? 74 : 46)
  },
  {
    key: 'travelTimeScore',
    score: (factors, context) => lowerIsBetter(factors.totalTravelMinutes, context.shortestTravelMinutes, context.longestTravelMinutes, factors.totalTravelMinutes ? 72 : 50)
  },
  {
    key: 'stopsScore',
    score: (factors) => clamp(96 - factors.stops * 18, 35, 96)
  },
  {
    key: 'connectionSafetyScore',
    score: (factors) => {
      if (!factors.connectionCount) return 96
      const minimum = factors.minimumConnectionBuffer ?? 0
      const bufferScore = minimum >= 120 ? 94 : minimum >= 90 ? 88 : minimum >= 60 ? 74 : minimum >= 45 ? 56 : 32
      return clamp(bufferScore - Math.max(0, factors.connectionCount - 1) * 8 - factors.airportDiscontinuities * 22)
    }
  },
  {
    key: 'backupStrengthScore',
    score: (factors) => clamp((factors.backupOpportunities * 18) + (factors.connectionCount === 0 ? 72 : 44) - factors.airlineChanges * 4)
  },
  {
    key: 'completionScore',
    score: (factors) => factors.completionState === 'complete' ? 96 : factors.completionState === 'framework' ? 42 : 20
  },
  {
    key: 'weatherRiskScore',
    score: (factors) => ({ unknown: 70, low: 90, medium: 62, high: 34 })[factors.weatherRiskLevel]
  },
  {
    key: 'misconnectRiskScore',
    score: (factors) => {
      if (!factors.connectionCount) return 96
      const minimum = factors.minimumConnectionBuffer ?? 0
      const bufferPenalty = minimum < 45 ? 42 : minimum < 60 ? 28 : minimum < 90 ? 14 : 4
      return clamp(100 - factors.connectionCount * 10 - bufferPenalty - factors.airlineChanges * 8 - factors.airportDiscontinuities * 26)
    }
  },
  {
    key: 'airportComplexityScore',
    score: (factors) => clamp(factors.airportComplexity)
  },
  {
    key: 'airlinePreferenceScore',
    score: (factors, context) => context.request?.carrier && context.request.carrier !== 'all'
      ? factors.preferredAirlineMatched ? 94 : 46
      : 78
  },
  {
    key: 'alternateAirportScore',
    score: (factors) => factors.alternateAirportUsed ? 62 : 88
  },
  {
    key: 'overnightPenaltyScore',
    score: (factors) => factors.overnightRequired ? 42 : 92
  }
]

export function scoreItinerary(itinerary: ItineraryResult, context: DecisionEngineContext): DecisionEngineResult['decisionScore'] {
  const factors = decisionFactorsForItinerary(itinerary, context)
  const partialScores = factorScorers.reduce((scores, scorer) => ({
    ...scores,
    [scorer.key]: scorer.score(factors, context)
  }), {} as Omit<DecisionScore, 'overallScore'>)
  const weightTotal = Object.values(context.weights).reduce((sum, weight) => sum + weight, 0) || 1
  const overallScore = clamp(Object.entries(partialScores).reduce((sum, [key, value]) => {
    return sum + value * context.weights[key as keyof Omit<DecisionScore, 'overallScore'>]
  }, 0) / weightTotal)

  return { ...partialScores, overallScore }
}

export function rankItineraries<TItinerary extends ItineraryResult>(itineraries: TItinerary[], options: DecisionEngineOptions = {}): DecisionEngineResult<TItinerary>[] {
  const context = decisionEngineContext(itineraries, options)
  return itineraries
    .map((itinerary) => {
      const factors = decisionFactorsForItinerary(itinerary, context)
      const decisionScore = scoreItinerary(itinerary, context)
      const recommendation = recommendationFor(decisionScore, factors)
      const status = decisionStatus(decisionScore.overallScore)
      return {
        itinerary: {
          ...itinerary,
          decisionScore,
          decisionFactors: factors,
          recommendation,
          decisionStatus: status,
          endToEnd: buildEndToEndTripPlan(itinerary, options.request),
          topRouteScore: decisionScore.overallScore,
          topRouteRankingFactors: decisionScore,
          whyThisRoute: recommendation.sentence,
          topRouteWhy: recommendation.reasons
        },
        decisionScore,
        recommendation,
        factors,
        status,
        rank: 0
      }
    })
    .sort(compareDecisionResults)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      itinerary: {
        ...result.itinerary,
        topRouteRank: index + 1,
        topRouteLabel: index === 0 ? `#1 Recommended ${result.itinerary.route}` : `#${index + 1} ${result.itinerary.route}`,
        providerBadges: index === 0 ? ['#1 Recommended', ...(result.itinerary.providerBadges || [])] : result.itinerary.providerBadges
      }
    }))
}

export function createDecisionEngine(options: DecisionEngineOptions = {}) {
  return {
    rank: <TItinerary extends ItineraryResult>(itineraries: TItinerary[]) => rankItineraries(itineraries, options),
    score: (itinerary: ItineraryResult, itineraries: ItineraryResult[] = [itinerary]) => {
      const context = decisionEngineContext(itineraries, options)
      return scoreItinerary(itinerary, context)
    }
  }
}

function decisionEngineContext(itineraries: ItineraryResult[], options: DecisionEngineOptions): DecisionEngineContext {
  const arrivalTimes = itineraries.map(arrivalTime).filter((value): value is number => value !== null)
  const travelTimes = itineraries.map(totalTravelMinutes).filter((value): value is number => value !== null)
  return {
    request: options.request,
    itineraries,
    earliestArrival: arrivalTimes.length ? Math.min(...arrivalTimes) : null,
    latestArrival: arrivalTimes.length ? Math.max(...arrivalTimes) : null,
    shortestTravelMinutes: travelTimes.length ? Math.min(...travelTimes) : null,
    longestTravelMinutes: travelTimes.length ? Math.max(...travelTimes) : null,
    weights: { ...defaultRankingWeights, ...(options.weights || {}) },
    airportComplexityScores: { ...defaultAirportComplexityScores, ...(options.airportComplexityScores || {}) }
  }
}

function decisionFactorsForItinerary(itinerary: ItineraryResult, context: DecisionEngineContext): DecisionFactors {
  const buffers = connectionBuffersMinutes(itinerary)
  const path = airportPath(itinerary)
  const transferAirports = path.slice(1, -1)
  const airportComplexity = transferAirports.length
    ? transferAirports.reduce((sum, airport) => sum + (context.airportComplexityScores[airport] || 64), 0) / transferAirports.length
    : 88
  const arrival = arrivalTime(itinerary)
  const sortedArrivals = [...new Set(context.itineraries.map(arrivalTime).filter((value): value is number => value !== null))].sort((a, b) => a - b)
  const arrivalRank = arrival === null ? context.itineraries.length : sortedArrivals.findIndex((value) => value === arrival) + 1

  return {
    arrivalRank: arrivalRank > 0 ? arrivalRank : context.itineraries.length,
    totalItineraries: context.itineraries.length,
    departureTime: departureTime(itinerary),
    arrivalTime: arrival,
    totalTravelMinutes: totalTravelMinutes(itinerary),
    connectionCount: Math.max(0, itinerary.legs.length - 1),
    stops: Math.max(0, itinerary.legs.length - 1),
    connectionBuffers: buffers,
    minimumConnectionBuffer: buffers.length ? Math.min(...buffers) : null,
    backupOpportunities: backupOpportunities(itinerary, context.itineraries),
    airlineChanges: airlineChanges(itinerary),
    airportDiscontinuities: airportDiscontinuities(itinerary),
    overnightRequired: overnightRequired(itinerary),
    completionState: completionState(itinerary),
    weatherRiskLevel: weatherRiskLevel(itinerary),
    preferredAirlineMatched: preferredAirlineMatched(itinerary, context.request?.carrier),
    alternateAirportUsed: alternateAirportUsed(itinerary, context.request),
    airportComplexity,
    sourceProvider: itinerary.sourceProvider
  }
}

function compareDecisionResults(a: DecisionEngineResult, b: DecisionEngineResult) {
  return b.decisionScore.overallScore - a.decisionScore.overallScore ||
    (a.factors.arrivalTime ?? Number.MAX_SAFE_INTEGER) - (b.factors.arrivalTime ?? Number.MAX_SAFE_INTEGER) ||
    (a.factors.totalTravelMinutes ?? Number.MAX_SAFE_INTEGER) - (b.factors.totalTravelMinutes ?? Number.MAX_SAFE_INTEGER) ||
    a.factors.connectionCount - b.factors.connectionCount ||
    a.itinerary.route.localeCompare(b.itinerary.route)
}

function recommendationFor(score: DecisionScore, factors: DecisionFactors): Recommendation {
  const label = recommendationLabel(score)
  const reasons = [
    score.arrivalScore >= 82 ? 'Earliest realistic arrival.' : '',
    score.travelTimeScore >= 82 ? 'Short travel day.' : '',
    score.backupStrengthScore >= 76 ? 'Strong backup opportunities.' : '',
    score.connectionSafetyScore >= 78 ? 'Comfortable connection buffer.' : '',
    score.misconnectRiskScore >= 78 ? 'Low misconnect exposure.' : '',
    score.overnightPenaltyScore >= 80 && factors.overnightRequired === false ? 'No overnight penalty.' : ''
  ].filter(Boolean).slice(0, 3)

  return {
    label,
    status: decisionStatus(score.overallScore),
    sentence: `${label}.`,
    reasons
  }
}

function recommendationLabel(score: DecisionScore): RecommendationLabel {
  const candidates: Array<[RecommendationLabel, number]> = [
    ['Best overall choice', score.overallScore],
    ['Earliest arrival', score.arrivalScore],
    ['Shortest travel day', score.travelTimeScore],
    ['Strong backup options', score.backupStrengthScore],
    ['Safest connection', score.connectionSafetyScore]
  ]
  return candidates.sort((a, b) => b[1] - a[1])[0][0]
}

function decisionStatus(score: number): DecisionStatus {
  if (score >= 78) return 'Green'
  if (score >= 58) return 'Yellow'
  return 'Red'
}

function lowerIsBetter(value: number | null, min: number | null, max: number | null, fallback: number) {
  if (value === null || min === null || max === null || max <= min) return clamp(fallback)
  return clamp(100 - ((value - min) / (max - min)) * 45, 45, 100)
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function departureTime(itinerary: ItineraryResult) {
  return parsedTime(itinerary.legs[0]?.departureTime || itinerary.departureTime)
}

function arrivalTime(itinerary: ItineraryResult) {
  return parsedTime(itinerary.legs[itinerary.legs.length - 1]?.arrivalTime || itinerary.arrivalTime)
}

function parsedTime(value?: string) {
  if (!value || /pending|unavailable/i.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function totalTravelMinutes(itinerary: ItineraryResult) {
  const departure = departureTime(itinerary)
  const arrival = arrivalTime(itinerary)
  if (departure !== null && arrival !== null && arrival > departure) return Math.round((arrival - departure) / 60000)
  const path = airportPath(itinerary)
  if (path.length < 2) return null
  const longHaul = path.some((airport) => ['HND', 'NRT', 'FCO', 'FRA', 'LHR', 'CDG', 'AMS', 'DUB'].includes(airport))
  const international = longHaul || path.some((airport) => ['HNL', 'OGG'].includes(airport))
  const legMinutes = longHaul ? 390 : international ? 300 : 165
  return (path.length - 1) * legMinutes + Math.max(0, path.length - 2) * 80
}

function connectionBuffersMinutes(itinerary: ItineraryResult) {
  return itinerary.legs.slice(0, -1).map((leg, index) => {
    const arrival = parsedTime(leg.arrivalTime)
    const nextDeparture = parsedTime(itinerary.legs[index + 1]?.departureTime)
    if (arrival === null || nextDeparture === null || nextDeparture <= arrival) return null
    return Math.round((nextDeparture - arrival) / 60000)
  }).filter((value): value is number => value !== null)
}

function carrierCode(leg: ItineraryLeg) {
  const normalizedFlight = (leg.operatingFlightNumber || leg.flightNumber || '').replace(/\s+/g, '').toUpperCase()
  const flightCode = normalizedFlight.match(/^([A-Z]{1,2}|[A-Z]\d|\d[A-Z])\d{1,4}$/)?.[1]
  const carrierCode = leg.carrier.trim().split(/\s+/).find((word) => /^[A-Z0-9]{2,3}$/.test(word))
  return carrierCode || flightCode || leg.carrier.trim().toUpperCase()
}

function airlineChanges(itinerary: ItineraryResult) {
  if (itinerary.legs.length < 2) return 0
  return itinerary.legs.slice(0, -1).filter((leg, index) => carrierCode(leg) !== carrierCode(itinerary.legs[index + 1])).length
}

function airportDiscontinuities(itinerary: ItineraryResult) {
  if (itinerary.legs.length < 2) return 0
  return itinerary.legs.slice(0, -1).filter((leg, index) => leg.destination !== itinerary.legs[index + 1]?.origin).length
}

function backupOpportunities(itinerary: ItineraryResult, itineraries: ItineraryResult[]) {
  if (itinerary.legs.length < 2) return 0
  const alternatives = new Set<string>()
  itinerary.legs.slice(0, -1).forEach((leg, index) => {
    const connectionAirport = leg.destination
    const missedLeg = itinerary.legs[index + 1]
    const missedDeparture = parsedTime(missedLeg?.departureTime)
    if (missedDeparture === null) return
    itineraries.forEach((candidate) => candidate.legs.forEach((candidateLeg) => {
      const departure = parsedTime(candidateLeg.departureTime)
      if (candidateLeg.origin !== connectionAirport || departure === null || departure <= missedDeparture) return
      alternatives.add(`${candidateLeg.origin}-${candidateLeg.destination}-${candidateLeg.operatingFlightNumber || candidateLeg.flightNumber}-${candidateLeg.departureTime}`)
    }))
  })
  return alternatives.size
}

function overnightRequired(itinerary: ItineraryResult) {
  const departure = departureTime(itinerary)
  const arrival = arrivalTime(itinerary)
  if (departure === null || arrival === null) return false
  const departureDate = new Date(departure)
  const arrivalDate = new Date(arrival)
  return Date.UTC(arrivalDate.getUTCFullYear(), arrivalDate.getUTCMonth(), arrivalDate.getUTCDate()) > Date.UTC(departureDate.getUTCFullYear(), departureDate.getUTCMonth(), departureDate.getUTCDate())
}

function completionState(itinerary: ItineraryResult): DecisionFactors['completionState'] {
  if (itinerary.source === 'route-framework' || itinerary.dataFreshnessRule === 'route-framework') return 'framework'
  if (itinerary.legs.length && itinerary.legs.every((leg) => parsedTime(leg.departureTime) !== null && parsedTime(leg.arrivalTime) !== null)) return 'complete'
  return 'incomplete'
}

function weatherRiskLevel(itinerary: ItineraryResult): DecisionFactors['weatherRiskLevel'] {
  const text = `${itinerary.status} ${itinerary.risk}`.toLowerCase()
  if (/storm|weather|snow|thunder|high/.test(text)) return 'high'
  if (/medium|delay/.test(text)) return 'medium'
  if (/low|on time|scheduled/.test(text)) return 'low'
  return 'unknown'
}

function preferredAirlineMatched(itinerary: ItineraryResult, carrier?: string) {
  if (!carrier || carrier === 'all') return true
  const normalizedCarrier = carrier.toUpperCase()
  const text = [itinerary.carrier, itinerary.flightNumber, itinerary.operatingFlightNumber, ...(itinerary.marketingFlightNumbers || [])].join(' ').toUpperCase()
  return text.includes(normalizedCarrier) || text.includes(normalizedCarrier.slice(0, 2))
}

function alternateAirportUsed(itinerary: ItineraryResult, request?: ParsedItineraryRequest) {
  if (!request?.origin || !request.destination) return false
  const path = airportPath(itinerary)
  return path[0] !== request.origin || path[path.length - 1] !== request.destination
}

function airportPath(itinerary: ItineraryResult) {
  const rawPath = itinerary.legs.length
    ? [itinerary.legs[0]?.origin, ...itinerary.legs.map((leg) => leg.destination)]
    : itinerary.route.split('→')
  return rawPath.map((code) => String(code || '').trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code))
}

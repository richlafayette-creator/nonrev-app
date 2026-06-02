import { type RouteRecommendation } from './carrierScope'
import { type HistoricalRoute } from './historicalRoutes'
import { type PredictionEngineResult } from './predictionEngine'
import { type TravelerProfileScaffold } from './travelerProfile'

export type ParsedTripPlannerRequest = {
  prompt: string
  origin: string
  destination: string
  destinationLabel: string
  dateRange: string
  preferences: string[]
}

export type AiTripPlanResult = {
  parsed: ParsedTripPlannerRequest
  bestRoute: string
  backupRoute: string
  estimatedSuccessProbability: number
  riskLevel: string
  whyThisRoute: string[]
}

const destinationAliases: { terms: string[]; airport: string; label: string }[] = [
  { terms: ['maui', 'ogg', 'kahului'], airport: 'OGG', label: 'Maui' },
  { terms: ['hawaii', 'honolulu', 'hnl', 'oahu'], airport: 'HNL', label: 'Hawaii' },
  { terms: ['tokyo', 'hnd', 'nrt', 'japan'], airport: 'HND', label: 'Tokyo' },
  { terms: ['paris', 'cdg'], airport: 'CDG', label: 'Paris' },
  { terms: ['london', 'lhr'], airport: 'LHR', label: 'London' }
]

function airportFromPrompt(prompt: string, fallback: string) {
  const fromMatch = prompt.match(/\bfrom\s+([A-Za-z]{3})\b/i)
  if (fromMatch) return fromMatch[1].toUpperCase()
  const airportCodes = prompt.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  return airportCodes[0] || fallback
}

function destinationFromPrompt(prompt: string) {
  const normalized = prompt.toLowerCase()
  const explicitTo = prompt.match(/\b(?:to|get me to|path to)\s+([A-Za-z]{3})\b/i)
  if (explicitTo) {
    const airport = explicitTo[1].toUpperCase()
    return { airport, label: airport }
  }
  const matched = destinationAliases.find((alias) => alias.terms.some((term) => normalized.includes(term)))
  return matched ? { airport: matched.airport, label: matched.label } : { airport: 'HNL', label: 'Hawaii' }
}

function dateRangeFromPrompt(prompt: string) {
  const normalized = prompt.toLowerCase()
  const isoDate = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (isoDate) return isoDate[1]
  if (normalized.includes('tomorrow')) return 'Tomorrow'
  if (normalized.includes('this weekend') || normalized.includes('weekend')) return 'This weekend'
  if (normalized.includes('next week')) return 'Next week'
  if (normalized.includes('tonight')) return 'Tonight'
  return 'Flexible dates'
}

function preferencesFromPrompt(prompt: string) {
  const normalized = prompt.toLowerCase()
  const preferences: string[] = []
  if (normalized.includes('cheap')) preferences.push('Cheapest nonrev path')
  if (normalized.includes('best')) preferences.push('Best overall route')
  if (normalized.includes('fast') || normalized.includes('quick')) preferences.push('Fastest workable route')
  if (normalized.includes('backup') || normalized.includes('safe')) preferences.push('More backup options')
  if (normalized.includes('hawaii') || normalized.includes('maui') || normalized.includes('beach')) preferences.push('Island/beach destination')
  return preferences.length ? preferences : ['Best balance of probability, backups, and risk']
}

function clamp(value: number) {
  return Math.max(1, Math.min(99, Math.round(value)))
}

function routeContainsDestination(route: string, destination: string) {
  return route.toUpperCase().includes(destination)
}

function bestRecommendationForDestination(recommendations: RouteRecommendation[], destination: string) {
  return recommendations.find((recommendation) => routeContainsDestination(recommendation.route, destination)) || recommendations[0]
}

function bestHistoricalForDestination(routes: HistoricalRoute[], destination: string) {
  return routes.find((route) => routeContainsDestination(route.route, destination)) || routes[0]
}

function backupHub(routeIntelligence: Record<string, string>, fallback = 'SFO') {
  const hub = routeIntelligence['Best Hub']?.match(/\b[A-Z]{3}\b/)?.[0]
  return hub || fallback
}

export function parseTripPlannerPrompt(prompt: string, travelerProfile: TravelerProfileScaffold): ParsedTripPlannerRequest {
  const trimmedPrompt = prompt.trim()
  const destination = destinationFromPrompt(trimmedPrompt)
  return {
    prompt: trimmedPrompt,
    origin: airportFromPrompt(trimmedPrompt, travelerProfile.homeAirport),
    destination: destination.airport,
    destinationLabel: destination.label,
    dateRange: dateRangeFromPrompt(trimmedPrompt),
    preferences: preferencesFromPrompt(trimmedPrompt)
  }
}

export function generateAiTripPlan(input: {
  prompt: string
  travelerProfile: TravelerProfileScaffold
  routeIntelligence: Record<string, string>
  routeRecommendations: RouteRecommendation[]
  historicalRoutes: HistoricalRoute[]
  predictionEngine: PredictionEngineResult
}) {
  const parsed = parseTripPlannerPrompt(input.prompt, input.travelerProfile)
  const recommendation = bestRecommendationForDestination(input.routeRecommendations, parsed.destination)
  const historicalRoute = bestHistoricalForDestination(input.historicalRoutes, parsed.destination)
  const hub = backupHub(input.routeIntelligence, parsed.destination === 'HND' ? 'SFO' : 'HNL')
  const directOrRecommended = recommendation?.route && routeContainsDestination(recommendation.route, parsed.destination)
    ? recommendation.route
    : `${parsed.origin} → ${parsed.destination}`
  const backupRoute = historicalRoute?.route && historicalRoute.route !== directOrRecommended
    ? historicalRoute.route
    : `${parsed.origin} → ${hub} → ${parsed.destination}`
  const preferenceBoost = parsed.preferences.some((preference) => preference.includes('backup')) ? 2 : 0
  const historicalBoost = historicalRoute ? Math.round((historicalRoute.successRate - 70) * 0.15) : 0
  const recommendationScore = recommendation?.score || 76
  const estimatedSuccessProbability = clamp(
    input.predictionEngine.successProbability * 0.58 +
    recommendationScore * 0.24 +
    (historicalRoute?.successRate || input.predictionEngine.inputSummary.historicalSuccessRate || 70) * 0.18 +
    preferenceBoost +
    historicalBoost
  )

  return {
    parsed,
    bestRoute: directOrRecommended,
    backupRoute,
    estimatedSuccessProbability,
    riskLevel: input.predictionEngine.riskCategory,
    whyThisRoute: [
      `Parsed ${parsed.origin} to ${parsed.destinationLabel} (${parsed.destination}) for ${parsed.dateRange}.`,
      `Traveler profile starts from ${input.travelerProfile.homeAirport} with ${input.travelerProfile.travelerType} / ${input.travelerProfile.passPriority} assumptions.`,
      `Route intelligence prefers ${input.routeIntelligence['Best Hub'] || 'the strongest available hub'} with ${input.routeIntelligence['Connection Count'] || 'connection flexibility'}.`,
      historicalRoute
        ? `Historical route ${historicalRoute.route} contributes ${historicalRoute.successRate}% success from ${historicalRoute.reportCount} reports.`
        : 'Historical route scaffold has no exact destination match yet, so carrier defaults carry more weight.',
      `Probability engine baseline is ${input.predictionEngine.successProbability}% before AI planner preference adjustments.`,
      `Preferences detected: ${parsed.preferences.join(', ')}.`
    ]
  } satisfies AiTripPlanResult
}

'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { flightMatchesSearch } from '../../lib/flightSearch'
import { delayRiskScore, rankItinerary } from '../../lib/intelligence'
import { allFlightFields, fieldValue, passengerFlightCoverageNotes, richFlightFieldLabels } from '../../lib/flightDataScaffold'
import { airportCodesFromRoute } from '../../lib/airportMapScaffold'
import { buildRouteAirportIntelligence, connectionRiskColor, type RouteAirportIntelligence } from '../../lib/airportIntelligence'
import { generateAiTripPlan, parseTripPlannerPrompt } from '../../lib/aiTripPlanner'
import { carrierScoringProfiles, getCarrierScoringScaffold, normalizeCarrierFamily, supportedCarrierOptions } from '../../lib/carrierScope'
import { historicalRouteStats, type HistoricalRoute } from '../../lib/historicalRoutes'
import { loadLoadReports, type LoadReport } from '../../lib/loadReports'
import { calculatePredictionEngine } from '../../lib/predictionEngine'
import { buildDisruptionIntelligence, routeHealthColor, type DisruptionIntelligence } from '../../lib/disruptionIntelligence'
import { calculateRouteConfidence, confidenceBadgeColor, confidenceTrendColor, confidenceUpdateTriggerLabel, type ConfidenceTrend, type ConfidenceUpdateTrigger, type RouteConfidence } from '../../lib/routeConfidence'
import { getRouteWeatherRisk, weatherRiskColor, type WeatherRisk } from '../../lib/weatherIntelligence'
import { defaultTravelerProfile, loadTravelerProfileFromStorage, travelerProfileAssumptions, type TravelerProfileScaffold } from '../../lib/travelerProfile'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'
import { loadSavedTripWatchlist, saveTripWatch } from '../../lib/watchlist'
import {
  clearSavedItineraryComparisons,
  loadSavedItineraryComparisons,
  removeSavedItineraryComparison,
  saveItineraryComparison,
  type SavedItineraryComparison
} from '../../lib/savedItineraryComparisons'
import MapboxAirportMap from '../MapboxAirportMap'
import OutcomeCapture from '../OutcomeCapture'

const mockItineraries = [
  {
    id: 1,
    title: 'Island hop with backup options',
    route: 'LAX → HNL → OGG',
    confidence: 'Strong',
    window: 'Apr 12-18',
    notes: 'Start with the earliest LAX-HNL bank, keep OGG as a same-day fallback, and verify return loads 48 hours out.',
    segments: ['LAX to HNL: morning widebody preferred', 'HNL to OGG: flexible island hop', 'OGG to LAX: midweek return'],
    backupOptions: 4,
    travelerFriction: 4
  },
  {
    id: 2,
    title: 'Europe shoulder-season sprint',
    route: 'JFK → LHR → CDG',
    confidence: 'Verify',
    window: 'May 3-9',
    notes: 'Prioritize nonstop transatlantic options, then use rail or short-haul backup positioning if Paris loads tighten.',
    segments: ['JFK to LHR: overnight departure', 'London stopover: 2 nights', 'CDG return: monitor premium spillover'],
    backupOptions: 3,
    travelerFriction: 9
  },
  {
    id: 3,
    title: 'Long weekend mileage saver',
    route: 'SFO → DEN → SFO',
    confidence: 'Strong',
    window: 'Next 3-day weekend',
    notes: 'A simple out-and-back with multiple daily frequencies and easy same-day recovery options.',
    segments: ['SFO to DEN: Friday afternoon', 'Denver: flexible stay', 'DEN to SFO: Monday morning'],
    backupOptions: 5,
    travelerFriction: 2
  }
]

const rankedItineraries = [...mockItineraries]
  .map((itinerary) => ({ ...itinerary, ranking: rankItinerary(itinerary) }))
  .sort((a, b) => b.ranking.score - a.ranking.score)

function confidenceColor(confidence: string) {
  if (confidence === 'Strong') return '#22c55e'
  if (confidence === 'Verify') return '#facc15'
  return '#f87171'
}

type LiveItineraryLeg = {
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

type LiveItineraryResult = {
  id: string
  route: string
  legs: LiveItineraryLeg[]
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

type ProviderStatus = {
  provider: 'supabase' | 'aviationstack' | 'flightaware' | 'planning'
  label: string
  state: 'pending' | 'success' | 'skipped' | 'warning' | 'error'
  detail: string
}

type ApiResponseCounts = {
  supabaseFetched: number
  supabaseMatchedFlights: number
  supabaseItineraries: number
  aviationstackRequests: number
  aviationstackFetched: number
  aviationstackItineraries: number
  flightAwareRequested: number
  flightAwareEnriched: number
  finalItineraries: number
}

type ItineraryDebugMetadata = {
  parsedOrigin?: string
  parsedDestination?: string
  parsedDate?: string
  selectedCarrier: string
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
  apiResponseCounts?: ApiResponseCounts
  emptyResults?: string[]
  rateLimits?: string[]
  invalidAirportCodes?: string[]
  unsupportedAirportCodes?: string[]
  invalidDates?: string[]
  providerExplanation?: string[]
  providerStatuses?: ProviderStatus[]
  safeErrors: string[]
}

function riskColor(risk: string) {
  if (risk.includes('Low')) return '#22c55e'
  if (risk.includes('Medium')) return '#facc15'
  return '#f87171'
}

function providerBadgeStyle(label: string) {
  if (label.includes('Supabase')) return { border: '#22c55e', text: '#bbf7d0', background: 'rgba(34, 197, 94, 0.12)' }
  if (label.includes('Aviationstack')) return { border: '#38bdf8', text: '#bae6fd', background: 'rgba(56, 189, 248, 0.12)' }
  if (label.includes('FlightAware')) return { border: '#c084fc', text: '#e9d5ff', background: 'rgba(192, 132, 252, 0.12)' }
  return { border: '#facc15', text: '#fef3c7', background: 'rgba(250, 204, 21, 0.12)' }
}

function ProviderBadge({ label }: { label: string }) {
  const style = providerBadgeStyle(label)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${style.border}`, borderRadius: 999, padding: '4px 9px', color: style.text, background: style.background, fontSize: 12, fontWeight: 'bold', letterSpacing: 0.3 }}>
      {label}
    </span>
  )
}

function WeatherRiskBadge({ weatherRisk }: { weatherRisk: WeatherRisk }) {
  const color = weatherRiskColor(weatherRisk.category)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${color}`, borderRadius: 999, padding: '4px 9px', color, background: '#020617', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.3 }}>
      Weather {weatherRisk.category}
    </span>
  )
}

type ItineraryComparison = {
  id: string
  route: string
  carrier: string
  score: number
  successProbability: number
  riskLevel: string
  connections: number
  totalTravelTime: string
  flightNumber: string
  isLive: boolean
  providerBadges: string[]
  disruption: DisruptionIntelligence
  routeConfidence: RouteConfidence
  weatherRisk: WeatherRisk
  airportIntelligence: RouteAirportIntelligence
  why: string[]
  explanation: ScoringExplanation
}

type ScoringExplanation = {
  whyRankedHere: string[]
  probabilityFactors: string[]
  carrierFactors: string[]
  historicalRouteFactors: string[]
  travelerProfileFactors: string[]
  communityIntelligenceFactors: string[]
  disruptionFactors: string[]
  confidenceFactors: string[]
  airportFactors: string[]
  weatherFactors: string[]
  placeholderWeights: string[]
}

type ScoringExplanationInput = {
  route: string
  carrier: string
  score: number
  successProbability: number
  riskLevel: string
  connections: number
  isLive: boolean
  sourceScore: number
  predictionEngine: ReturnType<typeof calculatePredictionEngine>
  historicalRoute?: HistoricalRoute
  historicalScore: number
  historicalSuccess: number
  routeReports: LoadReport[]
  routeOutcomes: TripOutcome[]
  outcomeRate: number | null
  loadAdjustment: number
  travelerProfile: TravelerProfileScaffold
  routeIntelligence: Record<string, string>
  carrierWeights: Record<string, string>
  recommendationScope: string
  disruption: DisruptionIntelligence
  routeConfidence: RouteConfidence
  weatherRisk: WeatherRisk
  airportIntelligence: RouteAirportIntelligence
}

type FallbackItineraryResult = (typeof rankedItineraries)[number]

function clampScore(value: number) {
  return Math.max(1, Math.min(99, Math.round(value)))
}

function normalizeRouteText(route: string) {
  return route
    .toUpperCase()
    .replace(/\s*(?:→|->|–|—|-)\s*/g, ' → ')
    .replace(/\s+/g, ' ')
    .trim()
}

function routeLooksRelated(sourceRoute: string, targetRoute: string) {
  const source = normalizeRouteText(sourceRoute)
  const target = normalizeRouteText(targetRoute)
  return source === target || source.includes(target) || target.includes(source)
}

function matchingHistoricalRoute(route: string, historicalRoutes: HistoricalRoute[]) {
  return historicalRoutes.find((historicalRoute) => routeLooksRelated(route, historicalRoute.route))
}

function matchingRouteLoadReports(route: string, loadReports: LoadReport[]) {
  return loadReports.filter((report) => routeLooksRelated(route, report.route))
}

function matchingRouteOutcomes(route: string, outcomes: TripOutcome[]) {
  return outcomes.filter((outcome) => routeLooksRelated(route, outcome.route))
}

function loadReportAdjustment(reports: LoadReport[]) {
  return reports.reduce((total, report) => {
    const weight = report.trustedWeight || 1
    if (report.loadStatus === 'Seats open') return total + 3 * weight
    if (report.loadStatus === 'Looks workable') return total + 1.5 * weight
    if (report.loadStatus === 'Tight') return total - 2 * weight
    if (report.loadStatus === 'Full') return total - 5 * weight
    return total
  }, 0)
}

function outcomeSuccessRate(outcomes: TripOutcome[]) {
  if (!outcomes.length) return null
  const successes = outcomes.filter((outcome) => outcome.status === 'Yes, got on').length
  return Math.round((successes / outcomes.length) * 100)
}

function riskFromProbability(probability: number, fallbackRisk: string) {
  if (fallbackRisk && fallbackRisk !== 'Unknown') return fallbackRisk
  if (probability >= 82) return 'Low'
  if (probability >= 72) return 'Medium-Low'
  if (probability >= 60) return 'Medium'
  if (probability >= 48) return 'Medium-High'
  return 'High'
}

function buildScoringExplanation(input: ScoringExplanationInput): ScoringExplanation {
  const carrierWeightSummary = Object.entries(input.carrierWeights).map(([label, weight]) => `${label} ${weight}`).join(' · ')
  const routeIntelligenceSummary = Object.entries(input.routeIntelligence)
    .map(([label, value]) => `${label}: ${value}`)
    .join(' · ')
  const travelerFactors = travelerProfileAssumptions(input.travelerProfile)
  const loadDirection = input.loadAdjustment > 0 ? 'positive' : input.loadAdjustment < 0 ? 'negative' : 'neutral'

  return {
    whyRankedHere: [
      `Rank is driven by composite score ${input.score}/100 and success probability ${input.successProbability}%, then sorted against the other itinerary recommendations.`,
      input.isLive
        ? `Live itinerary score ${input.sourceScore}/100 receives extra weight because it reflects current flight data for ${input.route}.`
        : `Planning scaffold rank ${input.sourceScore}/100 is used when no live matching itinerary is available.`,
      input.connections === 0
        ? 'Nonstop routing avoids connection failure points, so no connection penalty is applied.'
        : `${input.connections} connection${input.connections === 1 ? '' : 's'} adds a placeholder connection-risk penalty before ranking.`,
      `Risk label ${input.riskLevel} is carried into ranking as a tie-breaker and display signal.`
    ],
    probabilityFactors: [
      `Probability engine baseline starts at ${input.predictionEngine.successProbability}% with ${input.predictionEngine.confidencePercent}% confidence.`,
      `Current formula blends baseline probability, source route score, historical success ${input.historicalSuccess}%, historical score ${input.historicalScore}, community load adjustment ${input.loadAdjustment >= 0 ? '+' : ''}${input.loadAdjustment.toFixed(1)}, outcome calibration, and connection penalty.`,
      `Prediction summary: carrier base ${input.predictionEngine.inputSummary.carrierDefaultProbability}%, route risk ${input.predictionEngine.inputSummary.routeRisk}, community report count ${input.predictionEngine.inputSummary.communityReportCount}, outcome success ${input.predictionEngine.inputSummary.outcomeSuccessRate}%.`
    ],
    carrierFactors: [
      `Carrier scope is ${input.recommendationScope}; this card is labeled ${input.carrier}.`,
      `Placeholder weighting: ${carrierWeightSummary}.`,
      `Route intelligence applied: ${routeIntelligenceSummary}.`
    ],
    historicalRouteFactors: [
      input.historicalRoute
        ? `Matched historical route ${input.historicalRoute.route} with ${input.historicalRoute.successRate}% success, score ${input.historicalRoute.score}, and ${input.historicalRoute.reportCount} reports.`
        : `No exact historical route match for ${input.route}; using carrier historical averages instead.`,
      `Historical averages feeding the engine: score ${input.predictionEngine.inputSummary.historicalAverageScore}, success ${input.predictionEngine.inputSummary.historicalSuccessRate}%.`
    ],
    travelerProfileFactors: [
      `Traveler profile: ${input.travelerProfile.travelerType} at ${input.travelerProfile.passPriority} from ${input.travelerProfile.homeAirport}.`,
      `Employee airline ${input.travelerProfile.employeeAirline}; preferred airports ${input.travelerProfile.preferredAirports.join(', ') || 'not set'}.`,
      ...travelerFactors
    ],
    communityIntelligenceFactors: [
      input.routeReports.length
        ? `${input.routeReports.length} matching community load report${input.routeReports.length === 1 ? '' : 's'} create a ${loadDirection} ${input.loadAdjustment >= 0 ? '+' : ''}${input.loadAdjustment.toFixed(1)} point load signal.`
        : 'No matching community load reports yet; route keeps the neutral community-load assumption.',
      input.routeOutcomes.length
        ? `${input.routeOutcomes.length} saved outcome${input.routeOutcomes.length === 1 ? '' : 's'} calibrate this route at ${input.outcomeRate}% success.`
        : 'No saved outcomes for this exact route yet; community outcome calibration remains neutral.',
      'Community intelligence remains local/static in this scaffold and is ready for future realtime load/outcome signals.'
    ],
    disruptionFactors: [
      `Route health is ${input.disruption.routeHealth} with disruption impact score ${input.disruption.disruptionImpactScore}/99.`,
      `Disruption adjustment: ${input.disruption.successProbabilityImpact} points to success probability and ${input.disruption.routeRankingImpact} points to route ranking.`,
      ...input.disruption.explanation
    ],
    confidenceFactors: [
      `Route Confidence Score is ${input.routeConfidence.score}/100 with ${input.routeConfidence.badge} confidence and a ${input.routeConfidence.trend} trend.`,
      `Confidence blend: success ${input.routeConfidence.components.successProbability}, historical ${input.routeConfidence.components.historicalRouteData}, community ${input.routeConfidence.components.communityLoadReports}, traveler profile ${input.routeConfidence.components.travelerProfile}, disruption ${input.routeConfidence.components.disruptionIntelligence}, weather ${input.routeConfidence.components.weatherImpact}.`,
      ...input.routeConfidence.explanation
    ],
    weatherFactors: [
      `Weather risk is ${input.weatherRisk.category} with ${input.weatherRisk.scoreImpact}/40 placeholder impact.`,
      `Weather adjustment: ${input.weatherRisk.successProbabilityImpact} points to success probability and ${input.weatherRisk.routeRankingImpact} points to route ranking.`,
      `Weather source: ${input.weatherRisk.source}; status: ${input.weatherRisk.status}.`,
      ...input.weatherRisk.details,
      ...input.weatherRisk.diagnostics
    ],
    airportFactors: [
      `Connection Risk Score is ${input.airportIntelligence.connectionRiskScore}/100 with ${input.airportIntelligence.overallConnectionDifficulty} connection difficulty.`,
      `Walking distance category is ${input.airportIntelligence.walkingDistanceCategory}; backup availability is ${input.airportIntelligence.backupFlightAvailability}.`,
      `Hub strength summary: ${input.airportIntelligence.hubStrengthSummary}.`,
      ...input.airportIntelligence.explanation
    ],
    placeholderWeights: [
      'Live/source route score: about 24–52% depending on data source.',
      'Probability engine baseline: about 34–36% of success probability.',
      'Historical success and score: about 34% combined before adjustments.',
      'Community load reports: capped between -8 and +8 points.',
      'Flight disruption intelligence: delays, cancellations, diversions, and airport alerts can reduce probability and ranking after the base score.',
      'Weather intelligence layer: weather risk can reduce success probability and route ranking through live or placeholder provider signals.',
      'Route confidence engine: success probability, historical route data, community reports, traveler profile, disruption, and weather are blended into a 0–100 confidence score.',
      'Airport intelligence layer: static terminal, connection, walking, hub-strength, and backup availability data produce a connection risk score.',
      'Connections: -4 points per connection in the recommendation comparison.'
    ]
  }
}

function parseScheduleTime(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function totalTravelTimeFromItinerary(itinerary: LiveItineraryResult) {
  const departure = parseScheduleTime(itinerary.legs[0]?.departureTime || itinerary.departureTime)
  const arrival = parseScheduleTime(itinerary.legs[itinerary.legs.length - 1]?.arrivalTime || itinerary.arrivalTime)
  if (!departure || !arrival || arrival <= departure) return 'Pending schedule data'
  const totalMinutes = Math.round((arrival - departure) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

function fallbackTravelTimeEstimate(itinerary: FallbackItineraryResult) {
  const airportCount = itinerary.route.split('→').length
  if (airportCount <= 1) return 'Pending schedule data'
  const estimatedMinutes = (airportCount - 1) * 165 + Math.max(0, airportCount - 2) * 75
  const hours = Math.floor(estimatedMinutes / 60)
  const minutes = estimatedMinutes % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m estimate`
}

function buildLiveItineraryComparison(
  itinerary: LiveItineraryResult,
  predictionEngine: ReturnType<typeof calculatePredictionEngine>,
  historicalRoutes: HistoricalRoute[],
  loadReports: LoadReport[],
  outcomes: TripOutcome[],
  travelerProfile: TravelerProfileScaffold,
  routeIntelligence: Record<string, string>,
  carrierWeights: Record<string, string>,
  recommendationScope: string,
  updateTrigger: ConfidenceUpdateTrigger
): ItineraryComparison {
  const historicalRoute = matchingHistoricalRoute(itinerary.route, historicalRoutes)
  const routeReports = matchingRouteLoadReports(itinerary.route, loadReports)
  const routeOutcomes = matchingRouteOutcomes(itinerary.route, outcomes)
  const outcomeRate = outcomeSuccessRate(routeOutcomes)
  const connections = Math.max(0, itinerary.legs.length - 1)
  const loadAdjustment = Math.max(-8, Math.min(8, loadReportAdjustment(routeReports)))
  const historicalScore = historicalRoute?.score || predictionEngine.inputSummary.historicalAverageScore || itinerary.score
  const historicalSuccess = historicalRoute?.successRate || predictionEngine.inputSummary.historicalSuccessRate || predictionEngine.successProbability
  const outcomeSignal = outcomeRate === null ? 0 : (outcomeRate - historicalSuccess) * 0.16
  const connectionPenalty = connections * 4
  const disruption = buildDisruptionIntelligence({
    route: itinerary.route,
    legs: itinerary.legs,
    fallbackStatus: itinerary.status,
    sourceLabel: itinerary.source
  })
  const weatherRisk = getRouteWeatherRisk(itinerary.route)
  const airportIntelligence = buildRouteAirportIntelligence(itinerary.route)
  const successProbability = clampScore(
    predictionEngine.successProbability * 0.34 +
    itinerary.score * 0.26 +
    historicalSuccess * 0.22 +
    historicalScore * 0.12 +
    loadAdjustment +
    outcomeSignal -
    connectionPenalty +
    disruption.successProbabilityImpact +
    weatherRisk.successProbabilityImpact
  )
  const score = clampScore(itinerary.score * 0.52 + successProbability * 0.32 + historicalScore * 0.16 - connectionPenalty + disruption.routeRankingImpact + weatherRisk.routeRankingImpact)
  const riskLevel = riskFromProbability(successProbability, itinerary.risk)
  const routeConfidence = calculateRouteConfidence({
    route: itinerary.route,
    successProbability,
    historicalScore,
    historicalSuccessRate: historicalSuccess,
    historicalReportCount: historicalRoute?.reportCount || predictionEngine.sampleSize.historicalRouteReports,
    communityReportCount: routeReports.length,
    communityLoadAdjustment: loadAdjustment,
    travelerProfile,
    disruption,
    weatherRisk,
    updateTrigger
  })
  const explanation = buildScoringExplanation({
    route: itinerary.route,
    carrier: itinerary.carrier,
    score,
    successProbability,
    riskLevel,
    connections,
    isLive: true,
    sourceScore: itinerary.score,
    predictionEngine,
    historicalRoute,
    historicalScore,
    historicalSuccess,
    routeReports,
    routeOutcomes,
    outcomeRate,
    loadAdjustment,
    travelerProfile,
    routeIntelligence,
    carrierWeights,
    recommendationScope,
    disruption,
    routeConfidence,
    weatherRisk,
    airportIntelligence
  })

  return {
    id: `live-${itinerary.id}`,
    route: itinerary.route,
    carrier: itinerary.carrier,
    score,
    successProbability,
    riskLevel,
    connections,
    totalTravelTime: totalTravelTimeFromItinerary(itinerary),
    flightNumber: itinerary.flightNumber,
    isLive: true,
    providerBadges: itinerary.providerBadges?.length ? itinerary.providerBadges : [itinerary.source.includes('aviationstack') ? 'Aviationstack' : 'Live Supabase', ...(itinerary.source.includes('flightaware') ? ['FlightAware enriched'] : [])],
    disruption,
    routeConfidence,
    weatherRisk,
    airportIntelligence,
    why: [
      `Blends live itinerary score ${itinerary.score}/100 with probability engine baseline ${predictionEngine.successProbability}%.`,
      `Route confidence engine scores this option ${routeConfidence.score}/100 (${routeConfidence.badge}) with a ${routeConfidence.trend} trend.`,
      `Weather intelligence labels this route ${weatherRisk.category} and adjusts success probability by ${weatherRisk.successProbabilityImpact} point${weatherRisk.successProbabilityImpact === 1 || weatherRisk.successProbabilityImpact === -1 ? '' : 's'}.`,
      `Airport intelligence gives this route a ${airportIntelligence.connectionRiskScore}/100 connection risk score and ${airportIntelligence.backupFlightAvailability} backup flight availability.`,
      `Disruption intelligence adjusts this option by ${disruption.successProbabilityImpact} probability points and ${disruption.routeRankingImpact} ranking points; route health is ${disruption.routeHealth}.`,
      historicalRoute
        ? `Historical route match ${historicalRoute.route} contributes ${historicalRoute.successRate}% success and ${historicalRoute.reportCount} reports.`
        : `Carrier historical scaffold contributes ${predictionEngine.inputSummary.historicalSuccessRate}% average success.` ,
      routeReports.length
        ? `${routeReports.length} community load report${routeReports.length === 1 ? '' : 's'} add a ${loadAdjustment >= 0 ? '+' : ''}${loadAdjustment.toFixed(1)} weighted load signal.`
        : 'No matching community load reports yet, so the comparison keeps the route-neutral load assumption.',
      routeOutcomes.length
        ? `${routeOutcomes.length} saved outcome${routeOutcomes.length === 1 ? '' : 's'} calibrate this route at ${outcomeRate}% success.`
        : 'No saved outcomes for this exact route yet; traveler profile and historical signals carry more weight.',
      connections === 0 ? 'Nonstop option avoids connection risk.' : `${connections} connection${connections === 1 ? '' : 's'} adds a controlled recovery-risk penalty.`
    ],
    explanation
  }
}

function buildFallbackItineraryComparison(
  itinerary: FallbackItineraryResult,
  predictionEngine: ReturnType<typeof calculatePredictionEngine>,
  historicalRoutes: HistoricalRoute[],
  loadReports: LoadReport[],
  outcomes: TripOutcome[],
  carrierLabel: string,
  travelerProfile: TravelerProfileScaffold,
  routeIntelligence: Record<string, string>,
  carrierWeights: Record<string, string>,
  updateTrigger: ConfidenceUpdateTrigger
): ItineraryComparison {
  const historicalRoute = matchingHistoricalRoute(itinerary.route, historicalRoutes)
  const routeReports = matchingRouteLoadReports(itinerary.route, loadReports)
  const routeOutcomes = matchingRouteOutcomes(itinerary.route, outcomes)
  const outcomeRate = outcomeSuccessRate(routeOutcomes)
  const airportCount = itinerary.route.split('→').length
  const connections = Math.max(0, airportCount - 2)
  const loadAdjustment = Math.max(-8, Math.min(8, loadReportAdjustment(routeReports)))
  const historicalScore = historicalRoute?.score || predictionEngine.inputSummary.historicalAverageScore || itinerary.ranking.score
  const historicalSuccess = historicalRoute?.successRate || predictionEngine.inputSummary.historicalSuccessRate || predictionEngine.successProbability
  const outcomeSignal = outcomeRate === null ? 0 : (outcomeRate - historicalSuccess) * 0.16
  const connectionPenalty = connections * 4
  const disruption = buildDisruptionIntelligence({
    route: itinerary.route,
    fallbackStatus: itinerary.confidence
  })
  const weatherRisk = getRouteWeatherRisk(itinerary.route)
  const airportIntelligence = buildRouteAirportIntelligence(itinerary.route)
  const successProbability = clampScore(
    predictionEngine.successProbability * 0.36 +
    itinerary.ranking.score * 0.24 +
    historicalSuccess * 0.22 +
    historicalScore * 0.12 +
    loadAdjustment +
    outcomeSignal -
    connectionPenalty +
    disruption.successProbabilityImpact +
    weatherRisk.successProbabilityImpact
  )
  const score = clampScore(itinerary.ranking.score * 0.5 + successProbability * 0.34 + historicalScore * 0.16 - connectionPenalty + disruption.routeRankingImpact + weatherRisk.routeRankingImpact)
  const riskLevel = riskFromProbability(successProbability, itinerary.confidence === 'Strong' ? 'Medium-Low' : 'Medium')
  const routeConfidence = calculateRouteConfidence({
    route: itinerary.route,
    successProbability,
    historicalScore,
    historicalSuccessRate: historicalSuccess,
    historicalReportCount: historicalRoute?.reportCount || predictionEngine.sampleSize.historicalRouteReports,
    communityReportCount: routeReports.length,
    communityLoadAdjustment: loadAdjustment,
    travelerProfile,
    disruption,
    weatherRisk,
    updateTrigger
  })
  const explanation = buildScoringExplanation({
    route: itinerary.route,
    carrier: carrierLabel,
    score,
    successProbability,
    riskLevel,
    connections,
    isLive: false,
    sourceScore: itinerary.ranking.score,
    predictionEngine,
    historicalRoute,
    historicalScore,
    historicalSuccess,
    routeReports,
    routeOutcomes,
    outcomeRate,
    loadAdjustment,
    travelerProfile,
    routeIntelligence,
    carrierWeights,
    recommendationScope: carrierLabel,
    disruption,
    routeConfidence,
    weatherRisk,
    airportIntelligence
  })

  return {
    id: `fallback-${itinerary.id}`,
    route: itinerary.route,
    carrier: carrierLabel,
    score,
    successProbability,
    riskLevel,
    connections,
    totalTravelTime: fallbackTravelTimeEstimate(itinerary),
    flightNumber: itinerary.title,
    isLive: false,
    providerBadges: ['Planning fallback'],
    disruption,
    routeConfidence,
    weatherRisk,
    airportIntelligence,
    why: [
      `Combines fallback ranking ${itinerary.ranking.score}/100 with probability engine baseline ${predictionEngine.successProbability}%.`,
      `Route confidence engine scores this option ${routeConfidence.score}/100 (${routeConfidence.badge}) with a ${routeConfidence.trend} trend.`,
      `Weather intelligence labels this route ${weatherRisk.category} and adjusts success probability by ${weatherRisk.successProbabilityImpact} point${weatherRisk.successProbabilityImpact === 1 || weatherRisk.successProbabilityImpact === -1 ? '' : 's'}.`,
      `Airport intelligence gives this route a ${airportIntelligence.connectionRiskScore}/100 connection risk score and ${airportIntelligence.backupFlightAvailability} backup flight availability.`,
      `Disruption intelligence adjusts this option by ${disruption.successProbabilityImpact} probability points and ${disruption.routeRankingImpact} ranking points; route health is ${disruption.routeHealth}.`,
      historicalRoute
        ? `Historical route match ${historicalRoute.route} contributes ${historicalRoute.successRate}% success and ${historicalRoute.reportCount} reports.`
        : `Historical carrier scaffold contributes ${predictionEngine.inputSummary.historicalSuccessRate}% average success.`,
      routeReports.length
        ? `${routeReports.length} community load report${routeReports.length === 1 ? '' : 's'} add a ${loadAdjustment >= 0 ? '+' : ''}${loadAdjustment.toFixed(1)} weighted load signal.`
        : 'No matching community load reports yet; use this as planning guidance only.',
      routeOutcomes.length
        ? `${routeOutcomes.length} saved outcome${routeOutcomes.length === 1 ? '' : 's'} calibrate this route at ${outcomeRate}% success.`
        : 'No saved route outcomes yet; traveler profile and route intelligence remain the main signals.',
      connections === 0 ? 'Nonstop shape keeps connection risk low.' : `${connections} connection${connections === 1 ? '' : 's'} creates backup flexibility but adds transfer risk.`
    ],
    explanation
  }
}

function comparisonMetricColor(value: number) {
  if (value >= 80) return '#22c55e'
  if (value >= 70) return '#38bdf8'
  if (value >= 60) return '#facc15'
  return '#f87171'
}

function savedConfidenceTrend(value?: string): ConfidenceTrend | null {
  if (value === 'Improving' || value === 'Stable' || value === 'Declining') return value
  return null
}

function savedConfidenceTrendColor(value?: string) {
  const trend = savedConfidenceTrend(value)
  return trend ? confidenceTrendColor(trend) : '#94a3b8'
}

function explanationSectionColor(label: string) {
  if (label.includes('Probability')) return '#38bdf8'
  if (label.includes('Carrier')) return '#c084fc'
  if (label.includes('Historical')) return '#facc15'
  if (label.includes('Traveler')) return '#34d399'
  if (label.includes('Community')) return '#22c55e'
  if (label.includes('Weather')) return '#22c55e'
  if (label.includes('Confidence')) return '#38bdf8'
  if (label.includes('Airport')) return '#facc15'
  if (label.includes('Backup')) return '#fb7185'
  return '#f8fafc'
}

function backupRouteReasoning(comparison: ItineraryComparison, backup?: ItineraryComparison) {
  if (!backup) {
    return [
      'No lower-ranked backup is available in the current recommendation set; add broader carrier scope or more legs to create fallback choices.',
      'Use the watched-route and saved-comparison tools to preserve this option while you search alternates.'
    ]
  }

  const scoreGap = comparison.score - backup.score
  return [
    `${backup.route} is the current backup because it ranks next after ${comparison.route} with score ${backup.score}/100 and ${backup.successProbability}% success probability.`,
    scoreGap >= 0
      ? `Primary route leads by ${scoreGap} point${scoreGap === 1 ? '' : 's'}, so the backup should be monitored if loads tighten or delays appear.`
      : `Backup currently scores higher on one signal, but this card remains ordered by the blended recommendation sort.`,
    backup.connections > comparison.connections
      ? `Backup adds connection complexity (${backup.connections} vs ${comparison.connections}), trading probability recovery for transfer risk.`
      : `Backup has equal or lower connection complexity, making it a practical same-day recovery candidate.`
  ]
}

function ScoringExplanationDetails({ comparison, backup }: { comparison: ItineraryComparison; backup?: ItineraryComparison }) {
  const sections = [
    ['Why this route ranked here', comparison.explanation.whyRankedHere],
    ['Probability factors', comparison.explanation.probabilityFactors],
    ['Carrier factors', comparison.explanation.carrierFactors],
    ['Historical route factors', comparison.explanation.historicalRouteFactors],
    ['Traveler profile factors', comparison.explanation.travelerProfileFactors],
    ['Community intelligence factors', comparison.explanation.communityIntelligenceFactors],
    ['Disruption intelligence factors', comparison.explanation.disruptionFactors],
    ['Weather intelligence factors', comparison.explanation.weatherFactors],
    ['Confidence explanation', comparison.explanation.confidenceFactors],
    ['Airport intelligence factors', comparison.explanation.airportFactors],
    ['Backup route reasoning', backupRouteReasoning(comparison, backup)],
    ['Placeholder weighting', comparison.explanation.placeholderWeights]
  ] as const

  return (
    <details open style={{ marginTop: 14, border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
      <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Why this route?</summary>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {sections.map(([label, reasons]) => (
          <section key={label} style={{ border: '1px solid #1e293b', borderRadius: 12, padding: 12, background: '#0f172a' }}>
            <strong style={{ color: explanationSectionColor(label) }}>{label}</strong>
            <ul style={{ color: '#cbd5e1', paddingLeft: 20, margin: '8px 0 0' }}>
              {reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}

function DisruptionIntelligenceSection({ comparisons }: { comparisons: ItineraryComparison[] }) {
  if (!comparisons.length) return null

  const mostImpacted = [...comparisons].sort((a, b) => b.disruption.disruptionImpactScore - a.disruption.disruptionImpactScore)[0]
  const healthiest = [...comparisons].sort((a, b) => a.disruption.disruptionImpactScore - b.disruption.disruptionImpactScore)[0]
  const totalDelaySignals = comparisons.reduce((total, comparison) => total + comparison.disruption.delays.count, 0)
  const totalCancellationSignals = comparisons.reduce((total, comparison) => total + comparison.disruption.cancellations.count, 0)
  const totalDiversionSignals = comparisons.reduce((total, comparison) => total + comparison.disruption.diversions.count, 0)
  const totalAirportAlerts = comparisons.reduce((total, comparison) => total + comparison.disruption.airportOperationalAlerts.count, 0)
  const averageImpact = Math.round(comparisons.reduce((total, comparison) => total + comparison.disruption.disruptionImpactScore, 0) / comparisons.length)

  return (
    <section style={{ border: '1px solid #fb7185', borderRadius: 22, padding: 18, background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.28), rgba(15, 23, 42, 0.96))', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#fb7185', textTransform: 'uppercase', letterSpacing: 1 }}>Disruption Intelligence</strong>
          <h3 style={{ fontSize: 26, margin: '8px 0' }}>Flight disruption impact engine</h3>
          <p style={{ color: '#cbd5e1', margin: 0 }}>
            Uses FlightAware enrichment when present, then falls back to itinerary status and local airport operational alert scaffolds.
          </p>
        </div>
        <span style={{ border: `1px solid ${routeHealthColor(mostImpacted.disruption.routeHealth)}`, borderRadius: 999, color: routeHealthColor(mostImpacted.disruption.routeHealth), padding: '8px 12px', fontWeight: 'bold' }}>
          Highest impact: {mostImpacted.disruption.disruptionImpactScore}/99 · {mostImpacted.disruption.routeHealth}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 14 }}>
        {[
          ['Avg Impact Score', `${averageImpact}/99`, averageImpact >= 50 ? '#f87171' : averageImpact >= 22 ? '#facc15' : '#22c55e'],
          ['Delays', totalDelaySignals, totalDelaySignals ? '#facc15' : '#22c55e'],
          ['Cancellations', totalCancellationSignals, totalCancellationSignals ? '#f87171' : '#22c55e'],
          ['Diversions', totalDiversionSignals, totalDiversionSignals ? '#f87171' : '#22c55e'],
          ['Airport Alerts', totalAirportAlerts, totalAirportAlerts ? '#facc15' : '#22c55e']
        ].map(([label, value, color]) => (
          <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
            <small style={{ color: '#94a3b8' }}>{label}</small>
            <h4 style={{ color: String(color), margin: '6px 0 0', fontSize: 22 }}>{value}</h4>
          </article>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 14 }}>
        <article style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}>
          <strong style={{ color: '#38bdf8' }}>Impact on Success Probability</strong>
          <p style={{ color: '#cbd5e1' }}>{mostImpacted.route}: {mostImpacted.disruption.successProbabilityImpact} points from disruption signals.</p>
          <p style={{ color: '#94a3b8', marginBottom: 0 }}>Probability is reduced after the community-weighted probability engine so disruption reflects current operational risk.</p>
        </article>
        <article style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}>
          <strong style={{ color: '#c084fc' }}>Impact on Route Ranking</strong>
          <p style={{ color: '#cbd5e1' }}>{mostImpacted.route}: {mostImpacted.disruption.routeRankingImpact} ranking points.</p>
          <p style={{ color: '#94a3b8', marginBottom: 0 }}>Routes with Red or Yellow health can move below cleaner backup options even when their baseline score is strong.</p>
        </article>
        <article style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}>
          <strong style={{ color: '#22c55e' }}>Backup Route Recommendations</strong>
          <p style={{ color: '#cbd5e1' }}>Healthiest current option: {healthiest.route} · {healthiest.disruption.routeHealth}</p>
          <ul style={{ color: '#94a3b8', marginBottom: 0, paddingLeft: 20 }}>
            {mostImpacted.disruption.backupRouteRecommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
          </ul>
        </article>
      </div>

      <details open style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
        <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Disruption explanation</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
          {comparisons.map((comparison) => (
            <article key={`disruption-${comparison.id}`} style={{ border: '1px solid #1e293b', borderRadius: 14, padding: 12, background: '#0f172a' }}>
              <strong style={{ color: routeHealthColor(comparison.disruption.routeHealth) }}>{comparison.route} · {comparison.disruption.routeHealth}</strong>
              <ul style={{ color: '#cbd5e1', paddingLeft: 20, margin: '8px 0' }}>
                {comparison.disruption.explanation.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <small style={{ color: '#94a3b8' }}>{comparison.disruption.dataSources.join(' · ')}</small>
            </article>
          ))}
        </div>
      </details>
    </section>
  )
}

function WeatherIntelligenceSection({ comparisons }: { comparisons: ItineraryComparison[] }) {
  if (!comparisons.length) return null

  const highestRisk = [...comparisons].sort((a, b) => b.weatherRisk.scoreImpact - a.weatherRisk.scoreImpact)[0]
  const lowestRisk = [...comparisons].sort((a, b) => a.weatherRisk.scoreImpact - b.weatherRisk.scoreImpact)[0]
  const averageImpact = Math.round(comparisons.reduce((total, comparison) => total + comparison.weatherRisk.scoreImpact, 0) / comparisons.length)
  const sources = Array.from(new Set(comparisons.map((comparison) => `${comparison.weatherRisk.source} (${comparison.weatherRisk.status})`)))

  return (
    <section style={{ border: '1px solid #22c55e', borderRadius: 22, padding: 18, background: 'linear-gradient(135deg, rgba(20, 83, 45, 0.28), rgba(15, 23, 42, 0.96))', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#22c55e', textTransform: 'uppercase', letterSpacing: 1 }}>Weather Intelligence</strong>
          <h3 style={{ fontSize: 26, margin: '8px 0' }}>Route weather risk layer</h3>
          <p style={{ color: '#cbd5e1', margin: 0 }}>
            Uses a provider abstraction for live weather, currently backed by placeholder airport weather sensitivity when live data is unavailable.
          </p>
        </div>
        <span style={{ border: `1px solid ${weatherRiskColor(highestRisk.weatherRisk.category)}`, borderRadius: 999, color: weatherRiskColor(highestRisk.weatherRisk.category), padding: '8px 12px', fontWeight: 'bold' }}>
          Highest weather risk: {highestRisk.weatherRisk.category}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 14 }}>
        {[
          ['Avg Weather Impact', `${averageImpact}/40`, averageImpact >= 30 ? '#f87171' : averageImpact >= 18 ? '#fb7185' : averageImpact >= 7 ? '#facc15' : '#22c55e'],
          ['Lowest Risk Route', lowestRisk.route, weatherRiskColor(lowestRisk.weatherRisk.category)],
          ['Provider Source', sources.join(' · '), '#38bdf8'],
          ['Status', highestRisk.weatherRisk.status, '#facc15']
        ].map(([label, value, color]) => (
          <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
            <small style={{ color: '#94a3b8' }}>{label}</small>
            <h4 style={{ color: String(color), margin: '6px 0 0', fontSize: 20 }}>{value}</h4>
          </article>
        ))}
      </div>

      <details open style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
        <summary style={{ color: '#22c55e', cursor: 'pointer', fontWeight: 'bold' }}>Weather diagnostics</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
          {comparisons.map((comparison) => (
            <article key={`weather-${comparison.id}`} style={{ border: '1px solid #1e293b', borderRadius: 14, padding: 12, background: '#0f172a' }}>
              <strong style={{ color: weatherRiskColor(comparison.weatherRisk.category) }}>{comparison.route} · {comparison.weatherRisk.category}</strong>
              <p style={{ color: '#cbd5e1', margin: '8px 0' }}>
                Impact {comparison.weatherRisk.scoreImpact}/40 · Probability {comparison.weatherRisk.successProbabilityImpact} · Ranking {comparison.weatherRisk.routeRankingImpact}
              </p>
              <small style={{ color: '#94a3b8' }}>Source: {comparison.weatherRisk.source} · Status: {comparison.weatherRisk.status}</small>
              <ul style={{ color: '#cbd5e1', paddingLeft: 20, margin: '8px 0 0' }}>
                {[...comparison.weatherRisk.details, ...comparison.weatherRisk.diagnostics].map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </details>
    </section>
  )
}

function RouteConfidenceSection({ comparisons }: { comparisons: ItineraryComparison[] }) {
  if (!comparisons.length) return null

  const bestConfidence = [...comparisons].sort((a, b) => b.routeConfidence.score - a.routeConfidence.score)[0]
  const averageConfidence = Math.round(comparisons.reduce((total, comparison) => total + comparison.routeConfidence.score, 0) / comparisons.length)
  const trendSummary = comparisons.reduce<Record<string, number>>((totals, comparison) => {
    totals[comparison.routeConfidence.trend] = (totals[comparison.routeConfidence.trend] || 0) + 1
    return totals
  }, {})

  return (
    <section style={{ border: '1px solid #38bdf8', borderRadius: 22, padding: 18, background: 'linear-gradient(135deg, rgba(14, 116, 144, 0.22), rgba(15, 23, 42, 0.96))', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 1 }}>Route Confidence Engine</strong>
          <h3 style={{ fontSize: 26, margin: '8px 0' }}>Real-time confidence score</h3>
          <p style={{ color: '#cbd5e1', margin: 0 }}>
            Combines success probability, historical route data, community reports, traveler profile, disruption intelligence, and weather impact.
          </p>
          <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>
            Last confidence update: {new Date(bestConfidence.routeConfidence.lastUpdated).toLocaleString()} · Trigger: {confidenceUpdateTriggerLabel(bestConfidence.routeConfidence.updateTrigger)}
          </p>
        </div>
        <span style={{ border: `1px solid ${confidenceBadgeColor(bestConfidence.routeConfidence.badge)}`, borderRadius: 999, color: confidenceBadgeColor(bestConfidence.routeConfidence.badge), padding: '8px 12px', fontWeight: 'bold' }}>
          Best confidence: {bestConfidence.routeConfidence.score}/100 · {bestConfidence.routeConfidence.badge}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
        {[
          ['Avg Route Confidence', `${averageConfidence}/100`, averageConfidence >= 85 ? '#22c55e' : averageConfidence >= 72 ? '#38bdf8' : averageConfidence >= 58 ? '#facc15' : '#f87171'],
          ['Top Badge', bestConfidence.routeConfidence.badge, confidenceBadgeColor(bestConfidence.routeConfidence.badge)],
          ['Top Trend', bestConfidence.routeConfidence.trend, confidenceTrendColor(bestConfidence.routeConfidence.trend)],
          ['Weather Impact', bestConfidence.routeConfidence.weatherImpact.label, weatherRiskColor(bestConfidence.routeConfidence.weatherImpact.label)]
        ].map(([label, value, color]) => (
          <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
            <small style={{ color: '#94a3b8' }}>{label}</small>
            <h4 style={{ color: String(color), margin: '6px 0 0', fontSize: 22 }}>{value}</h4>
          </article>
        ))}
      </div>

      <details open style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
        <summary style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}>Confidence explanation</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
          {comparisons.map((comparison) => (
            <article key={`confidence-${comparison.id}`} style={{ border: '1px solid #1e293b', borderRadius: 14, padding: 12, background: '#0f172a' }}>
              <strong style={{ color: confidenceBadgeColor(comparison.routeConfidence.badge) }}>{comparison.route} · {comparison.routeConfidence.score}/100 · {comparison.routeConfidence.badge}</strong>
              <p style={{ color: confidenceTrendColor(comparison.routeConfidence.trend), margin: '8px 0' }}>
                Trend: {comparison.routeConfidence.trend}{comparison.routeConfidence.trendDelta ? ` (${comparison.routeConfidence.trendDelta > 0 ? '+' : ''}${comparison.routeConfidence.trendDelta})` : ''}
              </p>
              <p style={{ color: '#94a3b8', margin: '8px 0' }}>
                Last confidence update: {new Date(comparison.routeConfidence.lastUpdated).toLocaleString()} · {confidenceUpdateTriggerLabel(comparison.routeConfidence.updateTrigger)}
              </p>
              <p style={{ color: '#cbd5e1', margin: '8px 0' }}>{comparison.routeConfidence.updateExplanation}</p>
              <ul style={{ color: '#cbd5e1', paddingLeft: 20, margin: '8px 0' }}>
                {comparison.routeConfidence.explanation.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
        <p style={{ color: '#94a3b8', marginBottom: 0 }}>Trend mix: {Object.entries(trendSummary).map(([label, count]) => `${label} ${count}`).join(' · ')}</p>
      </details>
    </section>
  )
}

function AirportIntelligenceSection({ comparisons }: { comparisons: ItineraryComparison[] }) {
  if (!comparisons.length) return null

  const highestRisk = [...comparisons].sort((a, b) => b.airportIntelligence.connectionRiskScore - a.airportIntelligence.connectionRiskScore)[0]
  const easiest = [...comparisons].sort((a, b) => a.airportIntelligence.connectionRiskScore - b.airportIntelligence.connectionRiskScore)[0]
  const averageRisk = Math.round(comparisons.reduce((total, comparison) => total + comparison.airportIntelligence.connectionRiskScore, 0) / comparisons.length)
  const supportedAirports = Array.from(new Set(comparisons.flatMap((comparison) => comparison.airportIntelligence.airports.map((airport) => airport.code))))

  return (
    <section style={{ border: '1px solid #facc15', borderRadius: 22, padding: 18, background: 'linear-gradient(135deg, rgba(113, 63, 18, 0.28), rgba(15, 23, 42, 0.96))', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#facc15', textTransform: 'uppercase', letterSpacing: 1 }}>Airport Intelligence</strong>
          <h3 style={{ fontSize: 26, margin: '8px 0' }}>Connection and terminal risk layer</h3>
          <p style={{ color: '#cbd5e1', margin: 0 }}>
            Static major-hub data for terminal notes, typical connection terminals, walking distance, hub strength, backup availability, and connection risk.
          </p>
        </div>
        <span style={{ border: `1px solid ${connectionRiskColor(highestRisk.airportIntelligence.connectionRiskScore)}`, borderRadius: 999, color: connectionRiskColor(highestRisk.airportIntelligence.connectionRiskScore), padding: '8px 12px', fontWeight: 'bold' }}>
          Highest connection risk: {highestRisk.airportIntelligence.connectionRiskScore}/100
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 14 }}>
        {[
          ['Avg Connection Risk', `${averageRisk}/100`, connectionRiskColor(averageRisk)],
          ['Easiest Route', easiest.route, '#22c55e'],
          ['Backup Availability', highestRisk.airportIntelligence.backupFlightAvailability, '#38bdf8'],
          ['Airport Profiles', supportedAirports.join(' · ') || 'Pending', '#facc15']
        ].map(([label, value, color]) => (
          <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
            <small style={{ color: '#94a3b8' }}>{label}</small>
            <h4 style={{ color: String(color), margin: '6px 0 0', fontSize: 20 }}>{value}</h4>
          </article>
        ))}
      </div>

      <details open style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
        <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Airport intelligence details</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12, marginTop: 12 }}>
          {comparisons.map((comparison) => (
            <article key={`airport-${comparison.id}`} style={{ border: '1px solid #1e293b', borderRadius: 14, padding: 12, background: '#0f172a' }}>
              <strong style={{ color: connectionRiskColor(comparison.airportIntelligence.connectionRiskScore) }}>{comparison.route} · Risk {comparison.airportIntelligence.connectionRiskScore}/100</strong>
              <p style={{ color: '#cbd5e1', margin: '8px 0' }}>
                Difficulty: {comparison.airportIntelligence.overallConnectionDifficulty} · Walking: {comparison.airportIntelligence.walkingDistanceCategory} · Backup: {comparison.airportIntelligence.backupFlightAvailability}
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {comparison.airportIntelligence.airports.map((airport) => (
                  <div key={`${comparison.id}-${airport.code}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <strong style={{ color: '#f8fafc' }}>{airport.code} · {airport.name}</strong>
                    <p style={{ color: '#94a3b8', margin: '6px 0' }}>{airport.terminalInformation}</p>
                    <small style={{ color: '#cbd5e1' }}>Typical connections: {airport.typicalConnectionTerminals}</small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </details>
    </section>
  )
}

function RouteAirportDetails({ route }: { route: string }) {
  const airportIntelligence = buildRouteAirportIntelligence(route)
  const weatherRisk = getRouteWeatherRisk(route)

  return (
    <details style={{ marginTop: 12, border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
      <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>
        Route details · Connection risk {airportIntelligence.connectionRiskScore}/100 · Weather {weatherRisk.category}
      </summary>
      <p style={{ color: '#cbd5e1' }}>
        Difficulty: {airportIntelligence.overallConnectionDifficulty} · Walking: {airportIntelligence.walkingDistanceCategory} · Backup availability: {airportIntelligence.backupFlightAvailability}
      </p>
      <div style={{ border: `1px solid ${weatherRiskColor(weatherRisk.category)}`, borderRadius: 12, padding: 10, background: '#0f172a', marginBottom: 10 }}>
        <strong style={{ color: weatherRiskColor(weatherRisk.category) }}>Weather risk: {weatherRisk.category}</strong>
        <p style={{ color: '#cbd5e1', margin: '6px 0' }}>
          Impact {weatherRisk.scoreImpact}/40 · Probability {weatherRisk.successProbabilityImpact} · Ranking {weatherRisk.routeRankingImpact}
        </p>
        <small style={{ color: '#94a3b8' }}>Source: {weatherRisk.source} · Status: {weatherRisk.status}</small>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {airportIntelligence.airports.map((airport) => (
          <article key={`${route}-${airport.code}`} style={{ border: '1px solid #1e293b', borderRadius: 12, padding: 10, background: '#0f172a' }}>
            <strong style={{ color: connectionRiskColor(airport.connectionRiskScore) }}>{airport.code} · {airport.name}</strong>
            <p style={{ color: '#94a3b8', margin: '6px 0' }}>{airport.terminalInformation}</p>
            <small style={{ color: '#cbd5e1' }}>
              Typical terminals: {airport.typicalConnectionTerminals} · Walking {airport.walkingDistanceCategory} · Hub {airport.hubStrength} · Backup {airport.backupFlightAvailability}
            </small>
          </article>
        ))}
      </div>
    </details>
  )
}

function ItineraryComparisonPanel({ comparisons, travelDate }: { comparisons: ItineraryComparison[]; travelDate: string }) {
  const [watchStatus, setWatchStatus] = useState('')
  const [compareStatus, setCompareStatus] = useState('')
  const [savedComparisons, setSavedComparisons] = useState<SavedItineraryComparison[]>([])

  useEffect(() => {
    function refreshSavedComparisons() {
      setSavedComparisons(loadSavedItineraryComparisons())
    }

    refreshSavedComparisons()
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refreshSavedComparisons)
    window.addEventListener('storage', refreshSavedComparisons)
    return () => {
      window.removeEventListener('nonrevy-itinerary-comparisons-updated', refreshSavedComparisons)
      window.removeEventListener('storage', refreshSavedComparisons)
    }
  }, [])

  if (comparisons.length < 2 && savedComparisons.length === 0) return null

  function watchRoute(comparison: ItineraryComparison) {
    const saved = saveTripWatch({
      travelDate: travelDate.trim() || 'Flexible',
      carrier: comparison.carrier,
      selectedItinerary: comparison.route,
      score: comparison.score,
      successProbability: comparison.successProbability,
      routeConfidenceScore: comparison.routeConfidence.score,
      confidenceBadge: comparison.routeConfidence.badge,
      confidenceTrend: comparison.routeConfidence.trend,
      lastConfidenceUpdate: comparison.routeConfidence.lastUpdated,
      confidenceUpdateExplanation: comparison.routeConfidence.updateExplanation,
      riskLevel: comparison.riskLevel,
      connections: comparison.connections,
      totalTravelTime: comparison.totalTravelTime
    })

    if (saved) {
      setWatchStatus(`Watching ${saved.origin} → ${saved.destination} for ${saved.travelDate}.`)
    }
  }


  function saveForComparison(comparison: ItineraryComparison) {
    const saved = saveItineraryComparison({
      route: comparison.route,
      carrier: comparison.carrier,
      score: comparison.score,
      successProbability: comparison.successProbability,
      routeConfidenceScore: comparison.routeConfidence.score,
      confidenceBadge: comparison.routeConfidence.badge,
      confidenceTrend: comparison.routeConfidence.trend,
      lastConfidenceUpdate: comparison.routeConfidence.lastUpdated,
      confidenceUpdateExplanation: comparison.routeConfidence.updateExplanation,
      riskLevel: comparison.riskLevel,
      connections: comparison.connections,
      totalTravelTime: comparison.totalTravelTime,
      travelDate: travelDate.trim() || undefined,
      why: comparison.why,
      sourceLabel: comparison.isLive ? 'Live itinerary option' : 'Planning scaffold option'
    })

    if (saved) {
      setSavedComparisons(loadSavedItineraryComparisons())
      setCompareStatus(`Saved ${saved.route} for side-by-side comparison.`)
    }
  }

  function removeComparison(id: string) {
    setSavedComparisons(removeSavedItineraryComparison(id))
    setCompareStatus('Removed saved itinerary option.')
  }

  function clearComparisons() {
    setSavedComparisons(clearSavedItineraryComparisons())
    setCompareStatus('Cleared saved itinerary comparisons.')
  }

  return (
    <section style={{ border: '1px solid #38bdf8', borderRadius: 24, padding: 20, background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.9))', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 1 }}>Itinerary comparison engine</strong>
          <h3 style={{ fontSize: 28, margin: '8px 0' }}>Top 3 recommended itineraries</h3>
          <p style={{ color: '#94a3b8', marginTop: 0 }}>
            Ranked with traveler profile, route intelligence, historical routes, community load reports, saved outcomes, disruption intelligence, weather impact, and the route confidence engine.
          </p>
        </div>
        <span style={{ border: '1px solid #22c55e', borderRadius: 999, color: '#22c55e', padding: '8px 12px', fontWeight: 'bold' }}>
          Best: {comparisons[0]?.route}
        </span>
      </div>

      {watchStatus && <p style={{ color: '#22c55e', fontWeight: 'bold' }}>{watchStatus} <a href="/watchlist" style={{ color: '#38bdf8' }}>Open watchlist</a></p>}
      {compareStatus && <p style={{ color: '#c084fc', fontWeight: 'bold' }}>{compareStatus}</p>}

      <WeatherIntelligenceSection comparisons={comparisons} />
      <RouteConfidenceSection comparisons={comparisons} />
      <AirportIntelligenceSection comparisons={comparisons} />
      <DisruptionIntelligenceSection comparisons={comparisons} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
        {comparisons.map((comparison, index) => {
          const isBest = index === 0
          return (
            <article
              key={comparison.id}
              className="flight-card"
              style={{
                border: isBest ? '2px solid #22c55e' : '1px solid #334155',
                borderRadius: 20,
                padding: 18,
                background: isBest ? 'linear-gradient(135deg, rgba(20, 83, 45, 0.42), #0f172a)' : '#0f172a',
                position: 'relative'
              }}
            >
              {isBest && (
                <div style={{ position: 'absolute', top: -12, right: 16, borderRadius: 999, background: '#22c55e', color: '#020617', padding: '5px 10px', fontWeight: 'bold', fontSize: 12 }}>
                  Best Recommendation
                </div>
              )}
              <small style={{ color: isBest ? '#86efac' : '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1 }}>
                #{index + 1} · {comparison.isLive ? 'Live option' : 'Planning scaffold'}
              </small>
              <h4 style={{ color: '#f8fafc', fontSize: 22, margin: '8px 0' }}>{comparison.route}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {comparison.providerBadges.map((badge) => (
                  <ProviderBadge key={`${comparison.id}-${badge}`} label={badge} />
                ))}
                <WeatherRiskBadge weatherRisk={comparison.weatherRisk} />
              </div>
              <p style={{ color: '#cbd5e1', margin: '0 0 12px' }}>
                Carrier: {comparison.carrier} · {comparison.flightNumber}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {[
                  ['Score', comparison.score, comparisonMetricColor(comparison.score)],
                  ['Success Probability', `${comparison.successProbability}%`, comparisonMetricColor(comparison.successProbability)],
                  ['Route Confidence', `${comparison.routeConfidence.score}/100 · ${comparison.routeConfidence.badge}`, confidenceBadgeColor(comparison.routeConfidence.badge)],
                  ['Confidence Trend', comparison.routeConfidence.trend, confidenceTrendColor(comparison.routeConfidence.trend)],
                  ['Last Confidence Update', new Date(comparison.routeConfidence.lastUpdated).toLocaleString(), '#94a3b8'],
                  ['Weather Risk', `${comparison.weatherRisk.category} · ${comparison.weatherRisk.scoreImpact}/40`, weatherRiskColor(comparison.weatherRisk.category)],
                  ['Connection Risk', `${comparison.airportIntelligence.connectionRiskScore}/100`, connectionRiskColor(comparison.airportIntelligence.connectionRiskScore)],
                  ['Airport Backup', comparison.airportIntelligence.backupFlightAvailability, '#38bdf8'],
                  ['Risk Level', comparison.riskLevel, riskColor(comparison.riskLevel)],
                  ['Route Health', comparison.disruption.routeHealth, routeHealthColor(comparison.disruption.routeHealth)],
                  ['Disruption Impact', `${comparison.disruption.disruptionImpactScore}/99`, routeHealthColor(comparison.disruption.routeHealth)],
                  ['Connections', comparison.connections, comparison.connections === 0 ? '#22c55e' : '#facc15'],
                  ['Total Travel Time', comparison.totalTravelTime, '#38bdf8']
                ].map(([label, value, color]) => (
                  <div key={`${comparison.id}-${label}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>{label}</small>
                    <p style={{ margin: '4px 0 0', color: String(color), fontWeight: 'bold' }}>{value}</p>
                  </div>
                ))}
              </div>
              <p style={{ color: '#cbd5e1', margin: '12px 0 0' }}>{comparison.routeConfidence.updateExplanation}</p>

              <RouteAirportDetails route={comparison.route} />
              <ScoringExplanationDetails comparison={comparison} backup={comparisons[index + 1] || comparisons.find((item) => item.id !== comparison.id)} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => watchRoute(comparison)}
                  style={{ padding: 12, borderRadius: 12, border: 'none', background: isBest ? '#22c55e' : '#facc15', color: '#020617', fontWeight: 'bold' }}
                >
                  Watch Route
                </button>
                <button
                  type="button"
                  onClick={() => saveForComparison(comparison)}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #c084fc', background: '#1e1b4b', color: '#f5d0fe', fontWeight: 'bold' }}
                >
                  Save to Compare
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <section style={{ border: '1px solid #334155', borderRadius: 20, padding: 18, background: '#020617', marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <strong style={{ color: '#c084fc', textTransform: 'uppercase', letterSpacing: 1 }}>Saved itinerary comparison</strong>
            <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>
              Save multiple options from /plan and compare them side by side. Stored locally in this browser for now.
            </p>
          </div>
          {savedComparisons.length > 0 && (
            <button type="button" onClick={clearComparisons} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #475569', background: '#0f172a', color: '#f8fafc', fontWeight: 'bold' }}>
              Clear saved comparisons
            </button>
          )}
        </div>

        {savedComparisons.length === 0 ? (
          <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
            <p style={{ color: '#cbd5e1', margin: 0 }}>No saved itinerary options yet. Use “Save to Compare” on any recommendation above.</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 14 }}>
            {savedComparisons.map((item) => (
              <article key={item.id} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <small style={{ color: '#c084fc', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{item.sourceLabel}</small>
                    <h4 style={{ color: '#f8fafc', margin: '6px 0', fontSize: 22 }}>{item.route}</h4>
                    <p style={{ color: '#94a3b8', margin: 0 }}>{item.carrier} · Saved {new Date(item.savedAt).toLocaleString()}</p>
                  </div>
                  <button type="button" onClick={() => removeComparison(item.id)} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #f87171', background: '#1f2937', color: '#fecaca', fontWeight: 'bold' }}>
                    Remove
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
                  {[
                    ['Score', item.score, comparisonMetricColor(item.score)],
                    ['Success Probability', `${item.successProbability}%`, comparisonMetricColor(item.successProbability)],
                    ['Route Confidence', item.routeConfidenceScore ? `${item.routeConfidenceScore}/100 · ${item.confidenceBadge || 'Fair'}` : 'Pending confidence', item.routeConfidenceScore ? comparisonMetricColor(item.routeConfidenceScore) : '#94a3b8'],
                    ['Confidence Trend', savedConfidenceTrend(item.confidenceTrend) || 'Pending', savedConfidenceTrendColor(item.confidenceTrend)],
                    ['Last Confidence Update', item.lastConfidenceUpdate ? new Date(item.lastConfidenceUpdate).toLocaleString() : 'Pending', '#94a3b8'],
                    ['Risk', item.riskLevel, riskColor(item.riskLevel)],
                    ['Connections', item.connections, item.connections === 0 ? '#22c55e' : '#facc15'],
                    ['Total Travel Time', item.totalTravelTime, '#38bdf8']
                  ].map(([label, value, color]) => (
                    <div key={`${item.id}-${label}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                      <small style={{ color: '#94a3b8' }}>{label}</small>
                      <p style={{ margin: '4px 0 0', color: String(color), fontWeight: 'bold' }}>{value}</p>
                    </div>
                ))}
                </div>
                {item.confidenceUpdateExplanation && <p style={{ color: '#cbd5e1', margin: '12px 0 0' }}>{item.confidenceUpdateExplanation}</p>}
                <details style={{ marginTop: 12 }}>
                  <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Why this route?</summary>
                  <ul style={{ color: '#cbd5e1', paddingLeft: 20, marginBottom: 0 }}>
                    {item.why.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

export default function PlanPage() {
  const [tripGoal, setTripGoal] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [travelWindow, setTravelWindow] = useState('')
  const [travelerCount, setTravelerCount] = useState('1')
  const [maxLegs, setMaxLegs] = useState('2')
  const [carrier, setCarrier] = useState('all')
  const [voiceStatus, setVoiceStatus] = useState('Voice capture scaffold ready.')
  const [submitted, setSubmitted] = useState(false)
  const [itineraryStatus, setItineraryStatus] = useState('Enter an itinerary request to search live flight data.')
  const [itineraryLoading, setItineraryLoading] = useState(false)
  const [liveItineraries, setLiveItineraries] = useState<LiveItineraryResult[]>([])
  const [itineraryWarnings, setItineraryWarnings] = useState<string[]>([])
  const [itinerarySource, setItinerarySource] = useState('Supabase flights table')
  const [itineraryDataMode, setItineraryDataMode] = useState('Awaiting live search')
  const [itineraryDebug, setItineraryDebug] = useState<ItineraryDebugMetadata | null>(null)
  const [query, setQuery] = useState('')
  const [flights, setFlights] = useState<any[]>([])
  const [lastUpdated, setLastUpdated] = useState('')
  const [travelerProfile, setTravelerProfile] = useState(defaultTravelerProfile)
  const [loadReports, setLoadReports] = useState<LoadReport[]>([])
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [routeConfidenceScores, setRouteConfidenceScores] = useState<number[]>([])
  const [confidenceUpdateTrigger, setConfidenceUpdateTrigger] = useState<ConfidenceUpdateTrigger>('local-signal-refresh')
  const [aiTripPrompt, setAiTripPrompt] = useState('get me to Maui this weekend')
  const [aiPlannerStatus, setAiPlannerStatus] = useState('AI planner scaffold ready for natural language trip requests.')
  const voiceInput = useVoiceInput({
    onTranscript: (transcript) => {
      setTripGoal(transcript)
      setQuery(transcript)
    },
    onStatus: setVoiceStatus,
    idleStatus: 'Voice capture ready. Review the captured trip request, then update planner results.'
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialQuery = params.get('q') || ''
    const initialAiTrip = params.get('aiTrip') || ''
    setQuery(initialQuery || initialAiTrip)
    if (initialAiTrip) {
      setAiTripPrompt(initialAiTrip)
      setTripGoal(initialAiTrip)
      setAiPlannerStatus('AI trip planner scaffold parsed your homepage request.')
      runItinerarySearch(initialAiTrip)
    } else if (initialQuery) {
      setTripGoal(initialQuery)
      runItinerarySearch(initialQuery)
    }
  }, [])

  useEffect(() => {
    function refreshLocalScaffolds(trigger: ConfidenceUpdateTrigger = 'local-signal-refresh') {
      setConfidenceUpdateTrigger(trigger)
      setTravelerProfile(loadTravelerProfileFromStorage())
      setLoadReports(loadLoadReports())
      setOutcomes(loadTripOutcomes())
      setRouteConfidenceScores([
        ...loadSavedItineraryComparisons().map((comparison) => comparison.routeConfidenceScore),
        ...loadSavedTripWatchlist().map((watch) => watch.routeConfidenceScore)
      ].filter((score): score is number => Number.isFinite(score)))
    }

    refreshLocalScaffolds()
    const refreshForLoadReports = () => refreshLocalScaffolds('community-load-report-updated')
    const refreshForOutcomes = () => refreshLocalScaffolds('outcome-history-changed')
    const refreshForWeather = () => refreshLocalScaffolds('weather-risk-changed')
    const refreshForDisruption = () => refreshLocalScaffolds('disruption-status-changed')
    const refreshForLocal = () => refreshLocalScaffolds('local-signal-refresh')

    window.addEventListener('nonrevy-load-reports-updated', refreshForLoadReports)
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshForOutcomes)
    window.addEventListener('nonrevy-weather-risk-updated', refreshForWeather)
    window.addEventListener('nonrevy-disruption-status-updated', refreshForDisruption)
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refreshForLocal)
    window.addEventListener('nonrevy-watchlist-updated', refreshForLocal)
    window.addEventListener('storage', refreshForLocal)
    return () => {
      window.removeEventListener('nonrevy-load-reports-updated', refreshForLoadReports)
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshForOutcomes)
      window.removeEventListener('nonrevy-weather-risk-updated', refreshForWeather)
      window.removeEventListener('nonrevy-disruption-status-updated', refreshForDisruption)
      window.removeEventListener('nonrevy-itinerary-comparisons-updated', refreshForLocal)
      window.removeEventListener('nonrevy-watchlist-updated', refreshForLocal)
      window.removeEventListener('storage', refreshForLocal)
    }
  }, [])

  useEffect(() => {
    async function loadFlights() {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/flights?select=*&order=created_at.desc&limit=100`,
        { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }
      )
      const data = await res.json()
      setFlights(Array.isArray(data) ? data : [])
      setLastUpdated(new Date().toLocaleTimeString())
    }

    loadFlights()
    const refresh = window.setInterval(loadFlights, 30000)
    return () => window.clearInterval(refresh)
  }, [])

  async function runItinerarySearch(searchText: string) {
    const trimmedSearch = searchText.trim()
    if (!trimmedSearch && !homeAirport.trim()) {
      setLiveItineraries([])
      setItineraryDebug(null)
      setItineraryStatus('Enter an itinerary request to search live flight data.')
      setItineraryDataMode('Awaiting live search')
      return
    }

    setItineraryLoading(true)
    setConfidenceUpdateTrigger('itinerary-search-run')
    setItineraryStatus('Searching Supabase flights first, then enriching matches when FlightAware is configured...')
    setItineraryDataMode('Searching live providers')
    setItineraryWarnings([])
    setItineraryDebug(null)

    const params = new URLSearchParams()
    if (trimmedSearch) params.set('q', trimmedSearch)
    if (homeAirport.trim()) params.set('origin', homeAirport.trim().toUpperCase())
    if (travelWindow.trim()) params.set('date', travelWindow.trim())
    params.set('carrier', carrier)
    params.set('maxLegs', maxLegs)

    try {
      const response = await fetch(`/api/itinerary/search?${params.toString()}`)
      const data = await response.json()
      const itineraries = Array.isArray(data?.itineraries) ? data.itineraries as LiveItineraryResult[] : []
      setLiveItineraries(itineraries)
      const apiWarnings = Array.isArray(data?.warnings) ? data.warnings : []
      setItineraryWarnings(data?.errorMessage ? [...new Set([...apiWarnings, data.errorMessage])] : apiWarnings)
      setItinerarySource(data?.sourceLabel || (data?.enrichedWithFlightAware ? 'Supabase flights + FlightAware enrichment' : 'Supabase flights table'))
      setItineraryDataMode(data?.dataMode === 'fallback' || itineraries.length === 0 ? 'Fallback planning guidance' : 'Live provider data')
      setItineraryDebug(data?.debug || null)
      setItineraryStatus(data?.statusMessage || (itineraries.length
        ? `${itineraries.length} live itinerary result${itineraries.length === 1 ? '' : 's'} found for ${data?.request?.origin || 'any origin'} → ${data?.request?.destination || 'any destination'}.`
        : 'No live flights found for this search. Showing fallback planning guidance.'
      ))
    } catch {
      setLiveItineraries([])
      setItineraryDebug(null)
      setItineraryStatus('Live itinerary search failed. Showing fallback planning guidance.')
      setItineraryDataMode('Fallback planning guidance')
      setItineraryWarnings(['Itinerary API request failed'])
    } finally {
      setItineraryLoading(false)
    }
  }

  async function submitPlanRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (tripGoal.trim()) {
      setQuery(tripGoal.trim())
      window.history.replaceState(null, '', `/plan?q=${encodeURIComponent(tripGoal.trim())}`)
    }
    await runItinerarySearch(tripGoal)
  }

  function startVoiceScaffold() {
    voiceInput.start()
  }

  async function submitAiTripPlanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = aiTripPrompt.trim()
    if (!prompt) {
      setAiPlannerStatus('Add a natural language trip request to generate an AI planning scaffold.')
      return
    }

    setTripGoal(prompt)
    setQuery(prompt)
    setSubmitted(true)
    setAiPlannerStatus('AI planner scaffold generated route guidance and refreshed itinerary results.')
    window.history.replaceState(null, '', `/plan?aiTrip=${encodeURIComponent(prompt)}`)
    await runItinerarySearch(prompt)
  }

  const matchingFlights = useMemo(
    () => flights.filter((flight) => flightMatchesSearch(flight, query || tripGoal)),
    [flights, query, tripGoal]
  )
  const scoringScaffold = useMemo(() => getCarrierScoringScaffold(carrier, travelerProfile), [carrier, travelerProfile])
  const historicalStats = useMemo(() => historicalRouteStats(carrier), [carrier])
  const carrierProfile = useMemo(() => {
    const normalizedCarrier = normalizeCarrierFamily(carrier)
    return normalizedCarrier === 'all' ? carrierScoringProfiles.united : carrierScoringProfiles[normalizedCarrier]
  }, [carrier])
  const predictionEngine = useMemo(() => calculatePredictionEngine({
    carrier,
    travelerProfile,
    carrierProfile,
    recommendationScope: scoringScaffold.recommendationScope,
    routeIntelligence: scoringScaffold.routeIntelligence,
    routeRecommendations: scoringScaffold.routeRecommendations,
    historicalStats,
    loadReports,
    outcomes,
    routeConfidenceScores
  }), [carrier, travelerProfile, carrierProfile, scoringScaffold, historicalStats, loadReports, outcomes, routeConfidenceScores])

  const itineraryComparisons = useMemo(() => {
    const comparisons = liveItineraries.length > 0
      ? liveItineraries.map((itinerary) => buildLiveItineraryComparison(
        itinerary,
        predictionEngine,
        historicalStats.routes,
        loadReports,
        outcomes,
        travelerProfile,
        scoringScaffold.routeIntelligence,
        scoringScaffold.weights,
        scoringScaffold.recommendationScope,
        confidenceUpdateTrigger
      ))
      : rankedItineraries.map((itinerary) => buildFallbackItineraryComparison(
        itinerary,
        predictionEngine,
        historicalStats.routes,
        loadReports,
        outcomes,
        scoringScaffold.recommendationScope,
        travelerProfile,
        scoringScaffold.routeIntelligence,
        scoringScaffold.weights,
        confidenceUpdateTrigger
      ))

    return comparisons
      .sort((a, b) => b.routeConfidence.score - a.routeConfidence.score || b.score - a.score || b.successProbability - a.successProbability)
      .slice(0, 3)
  }, [liveItineraries, predictionEngine, historicalStats.routes, loadReports, outcomes, travelerProfile, scoringScaffold.routeIntelligence, scoringScaffold.weights, scoringScaffold.recommendationScope, confidenceUpdateTrigger])

  const aiTripPreview = useMemo(
    () => parseTripPlannerPrompt(aiTripPrompt, travelerProfile),
    [aiTripPrompt, travelerProfile]
  )
  const aiTripPlan = useMemo(() => generateAiTripPlan({
    prompt: aiTripPrompt,
    travelerProfile,
    routeIntelligence: scoringScaffold.routeIntelligence,
    routeRecommendations: scoringScaffold.routeRecommendations,
    historicalRoutes: historicalStats.routes,
    predictionEngine
  }), [aiTripPrompt, travelerProfile, scoringScaffold.routeIntelligence, scoringScaffold.routeRecommendations, historicalStats.routes, predictionEngine])

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/historical-routes" style={{ marginRight: 16, color: '#facc15' }}>Historical Routes</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        <a href="/load-reports" style={{ marginRight: 16, color: '#facc15' }}>Load Reports</a>
        <a href="/profile" style={{ marginRight: 16, color: '#34d399' }}>Profile</a>
        <a href="/login" style={{ color: '#f472b6' }}>Login</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#fb7185', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
          Search and itinerary planner
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>
          Plan your nonrevy route.
        </h1>
        <p style={{ color: '#94a3b8', maxWidth: 720, fontSize: 18 }}>
          Flight results, itinerary results, and searchable flight data live here so the homepage can stay focused on search.
        </p>
        <div style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a', color: '#cbd5e1' }}>
          <strong style={{ color: '#38bdf8' }}>Passenger flight coverage scaffold</strong>
          <ul style={{ marginBottom: 0 }}>
            {passengerFlightCoverageNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>

        <section style={{ border: '1px solid #c084fc', borderRadius: 24, padding: 22, background: 'linear-gradient(135deg, rgba(49, 46, 129, 0.66), rgba(15, 23, 42, 0.96))', marginTop: 24 }}>
          <p style={{ color: '#c084fc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>AI Trip Planner scaffold</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)', gap: 18, alignItems: 'start' }}>
            <form onSubmit={submitAiTripPlanner}>
              <h2 style={{ fontSize: 30, margin: '0 0 10px' }}>Ask in natural language.</h2>
              <p style={{ color: '#cbd5e1' }}>
                Examples: “get me to Maui this weekend”, “best Hawaii trip from LAX tomorrow”, “cheapest nonrev path to Tokyo”.
              </p>
              <textarea
                value={aiTripPrompt}
                onChange={(event) => setAiTripPrompt(event.target.value)}
                rows={4}
                placeholder="cheapest nonrev path to Tokyo"
                style={{ boxSizing: 'border-box', width: '100%', padding: 14, borderRadius: 16, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
                {[
                  ['Origin', aiTripPreview.origin],
                  ['Destination', `${aiTripPreview.destinationLabel} (${aiTripPreview.destination})`],
                  ['Date range', aiTripPreview.dateRange],
                  ['Preferences', aiTripPreview.preferences.join(', ')]
                ].map(([label, value]) => (
                  <article key={label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>{label}</small>
                    <p style={{ margin: '4px 0 0', color: '#f8fafc', fontWeight: 'bold' }}>{value}</p>
                  </article>
                ))}
              </div>
              <button type="submit" style={{ marginTop: 14, padding: '14px 18px', borderRadius: 12, border: 'none', background: '#c084fc', color: '#020617', fontWeight: 'bold' }}>
                Generate AI trip plan
              </button>
              <p style={{ color: '#d8b4fe', marginBottom: 0 }}>{aiPlannerStatus}</p>
            </form>

            <aside style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#020617' }}>
              <strong style={{ color: '#22c55e' }}>Recommended plan</strong>
              <h3 style={{ color: '#f8fafc', margin: '8px 0' }}>{aiTripPlan.bestRoute}</h3>
              <p style={{ color: '#38bdf8', fontWeight: 'bold' }}>Backup: {aiTripPlan.backupRoute}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>Estimated success</small>
                  <p style={{ margin: '4px 0 0', color: '#22c55e', fontWeight: 'bold' }}>{aiTripPlan.estimatedSuccessProbability}%</p>
                </div>
                <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>Risk level</small>
                  <p style={{ margin: '4px 0 0', color: riskColor(aiTripPlan.riskLevel), fontWeight: 'bold' }}>{aiTripPlan.riskLevel}</p>
                </div>
              </div>
              <details open style={{ marginTop: 12 }}>
                <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Why this route?</summary>
                <ul style={{ color: '#cbd5e1', paddingLeft: 20, marginBottom: 0 }}>
                  {aiTripPlan.whyThisRoute.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </details>
            </aside>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 28 }}>
          <form
            onSubmit={submitPlanRequest}
            style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}
          >
            <h2 style={{ marginTop: 0 }}>Itinerary request</h2>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Trip goal or flight search
              <textarea
                value={tripGoal}
                onChange={(event) => setTripGoal(event.target.value)}
                placeholder="LAX-HNL, LAX to HNL, AA123, beach weekend from SFO..."
                rows={4}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Home airport
              <input
                value={homeAirport}
                onChange={(event) => setHomeAirport(event.target.value.toUpperCase())}
                placeholder="LAX"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
                Travel window
                <input
                  value={travelWindow}
                  onChange={(event) => setTravelWindow(event.target.value)}
                  placeholder="Apr 12-18"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
                />
              </label>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
                Travelers
                <input
                  value={travelerCount}
                  onChange={(event) => setTravelerCount(event.target.value)}
                  inputMode="numeric"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
                />
              </label>
            </div>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Max legs
              <select
                value={maxLegs}
                onChange={(event) => setMaxLegs(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                <option value="1">Nonstop only</option>
                <option value="2">Up to 2 legs</option>
                <option value="3">Up to 3 legs scaffold</option>
              </select>
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Carrier scope scaffold
              <select
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                {supportedCarrierOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <p style={{ color: '#94a3b8' }}>
              Supported today: United, Delta, Alaska Group. Alaska Group includes Alaska and Hawaiian. Search uses Supabase first, then Aviationstack fallback and FlightAware enrichment when configured.
            </p>
            <button
              type="submit"
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}
            >
              Update planner results
            </button>
            {submitted && (
              <p style={{ color: '#38bdf8', marginBottom: 0 }}>
                Draft request staged for {homeAirport || 'your home airport'} · {travelWindow || 'flexible dates'} · {travelerCount || '1'} traveler(s).
              </p>
            )}
          </form>

          <aside style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: 'linear-gradient(135deg, #111827, #312e81)' }}>
            <h2 style={{ marginTop: 0 }}>Voice input</h2>
            <p style={{ color: '#cbd5e1' }}>
              Capture spoken trip ideas here and fill the itinerary request automatically when your browser supports speech recognition.
            </p>
            <button
              type="button"
              onClick={startVoiceScaffold}
              title={voiceInput.isSupported ? 'Speak a route, flight number, or trip idea' : 'Voice capture is not supported in this browser'}
              style={{ padding: 14, borderRadius: 999, border: '1px solid #fda4af', background: voiceInput.isListening ? '#be123c' : '#fb7185', color: 'white', fontWeight: 'bold' }}
            >
              {voiceInput.isListening ? '● Listening' : '🎙 Start voice note'}
            </button>
            <p style={{ color: '#fecdd3' }}>{voiceStatus}</p>
            <div style={{ marginTop: 20, padding: 14, borderRadius: 16, background: 'rgba(15, 23, 42, 0.7)' }}>
              <strong>Current search</strong>
              <p style={{ color: '#cbd5e1', marginBottom: 0 }}>
                {query || 'No homepage query yet. Try searching from nonrevy home.'}
              </p>
            </div>
          </aside>
        </div>

        <section style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 30 }}>Live itinerary results</h2>
          <p style={{ color: itineraryLoading ? '#facc15' : '#94a3b8' }}>
            {itineraryStatus} · Source: {itinerarySource}
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${itineraryDataMode === 'Live provider data' ? '#22c55e' : itineraryDataMode === 'Fallback planning guidance' ? '#facc15' : '#334155'}`, borderRadius: 999, padding: '6px 12px', background: '#020617', color: itineraryDataMode === 'Live provider data' ? '#bbf7d0' : itineraryDataMode === 'Fallback planning guidance' ? '#fef3c7' : '#cbd5e1', marginBottom: 14, fontWeight: 'bold' }}>
            Data mode: {itineraryDataMode}
          </div>
          {itineraryWarnings.length > 0 && (
            <div style={{ border: '1px solid #854d0e', borderRadius: 14, padding: 14, background: '#1c1917', color: '#fde68a', marginBottom: 14 }}>
              <strong>Pipeline notes</strong>
              <ul style={{ marginBottom: 0 }}>
                {itineraryWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
          <div style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginBottom: 16 }}>
            <strong style={{ color: '#38bdf8' }}>Developer Diagnostics</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 12 }}>
              {[
                ['Parsed origin', itineraryDebug?.parsedOrigin || 'Not parsed'],
                ['Parsed destination', itineraryDebug?.parsedDestination || 'Not parsed'],
                ['Parsed date', itineraryDebug?.parsedDate || 'Flexible'],
                ['Selected carrier', itineraryDebug?.selectedCarrier || carrier],
                ['Supabase result count', itineraryDebug?.supabaseResultCount ?? 'Pending'],
                ['Aviationstack fallback', itineraryDebug?.aviationstackFallbackStatus || 'Pending'],
                ['FlightAware enrichment', itineraryDebug?.flightAwareEnrichmentStatus || 'Pending'],
                ['Final itinerary count', itineraryDebug?.finalItineraryCount ?? liveItineraries.length]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <p style={{ margin: '4px 0 0', color: '#f8fafc' }}>{value}</p>
                </article>
              ))}
            </div>
            {itineraryDebug?.apiResponseCounts ? (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: '#38bdf8' }}>API response counts</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                  {[
                    ['Supabase fetched', itineraryDebug.apiResponseCounts.supabaseFetched],
                    ['Supabase matched', itineraryDebug.apiResponseCounts.supabaseMatchedFlights],
                    ['Supabase itineraries', itineraryDebug.apiResponseCounts.supabaseItineraries],
                    ['Aviationstack calls', itineraryDebug.apiResponseCounts.aviationstackRequests],
                    ['Aviationstack fetched', itineraryDebug.apiResponseCounts.aviationstackFetched],
                    ['Aviationstack itineraries', itineraryDebug.apiResponseCounts.aviationstackItineraries],
                    ['FlightAware requested', itineraryDebug.apiResponseCounts.flightAwareRequested],
                    ['FlightAware enriched', itineraryDebug.apiResponseCounts.flightAwareEnriched],
                    ['Final itineraries', itineraryDebug.apiResponseCounts.finalItineraries]
                  ].map(([label, value]) => (
                    <article key={label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                      <small style={{ color: '#94a3b8' }}>{label}</small>
                      <p style={{ margin: '4px 0 0', color: '#f8fafc', fontWeight: 'bold' }}>{value}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {[...(itineraryDebug?.emptyResults || []), ...(itineraryDebug?.rateLimits || []), ...(itineraryDebug?.invalidAirportCodes || []), ...(itineraryDebug?.unsupportedAirportCodes || []), ...(itineraryDebug?.invalidDates || [])].length ? (
              <div style={{ border: '1px solid #854d0e', borderRadius: 12, padding: 10, background: '#1c1917', color: '#fde68a', marginTop: 12 }}>
                <strong>Reliability diagnostics</strong>
                <ul style={{ marginBottom: 0 }}>
                  {(itineraryDebug?.emptyResults || []).map((message) => <li key={`empty-${message}`}>Empty result: {message}</li>)}
                  {(itineraryDebug?.rateLimits || []).map((message) => <li key={`rate-${message}`}>Rate limit: {message}</li>)}
                  {(itineraryDebug?.invalidAirportCodes || []).map((message) => <li key={`airport-${message}`}>Invalid airport code: {message}</li>)}
                  {(itineraryDebug?.unsupportedAirportCodes || []).map((message) => <li key={`unsupported-airport-${message}`}>Unsupported airport code: {message}</li>)}
                  {(itineraryDebug?.invalidDates || []).map((message) => <li key={`date-${message}`}>Invalid date: {message}</li>)}
                </ul>
              </div>
            ) : null}
            {itineraryDebug?.providerStatuses?.length ? (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: '#c084fc' }}>Provider fallback strategy</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 10 }}>
                  {itineraryDebug.providerStatuses.map((status) => (
                    <article key={status.provider} style={{ border: `1px solid ${status.state === 'success' ? '#22c55e' : status.state === 'warning' ? '#facc15' : '#334155'}`, borderRadius: 12, padding: 10, background: '#0f172a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <ProviderBadge label={status.label} />
                        <small style={{ color: status.state === 'success' ? '#86efac' : status.state === 'warning' ? '#fde68a' : '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>{status.state}</small>
                      </div>
                      <p style={{ margin: '8px 0 0', color: '#cbd5e1' }}>{status.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {itineraryDebug?.providerExplanation?.length ? (
              <details style={{ marginTop: 12 }}>
                <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Provider explanation</summary>
                <ol style={{ color: '#cbd5e1', marginBottom: 0, paddingLeft: 20 }}>
                  {itineraryDebug.providerExplanation.map((message) => <li key={message}>{message.replace(/^\d+\.\s*/, '')}</li>)}
                </ol>
              </details>
            ) : null}
            {itineraryDebug?.safeErrors?.length ? (
              <div style={{ border: '1px solid #854d0e', borderRadius: 12, padding: 10, background: '#1c1917', color: '#fde68a', marginTop: 12 }}>
                <strong>Safe API messages</strong>
                <ul style={{ marginBottom: 0 }}>
                  {itineraryDebug.safeErrors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
          <ItineraryComparisonPanel comparisons={itineraryComparisons} travelDate={travelWindow} />
          {liveItineraries.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {liveItineraries.map((itinerary) => (
                <article key={itinerary.id} style={{ border: '1px solid #334155', borderRadius: 20, padding: 18, background: '#0f172a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>{itinerary.flightNumber}</h3>
                    <span style={{ color: riskColor(itinerary.risk), fontWeight: 'bold' }}>{itinerary.risk}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {(itinerary.providerBadges?.length ? itinerary.providerBadges : [itinerary.source.includes('aviationstack') ? 'Aviationstack' : 'Live Supabase', ...(itinerary.source.includes('flightaware') ? ['FlightAware enriched'] : [])]).map((badge) => (
                      <ProviderBadge key={`${itinerary.id}-${badge}`} label={badge} />
                    ))}
                    <WeatherRiskBadge weatherRisk={getRouteWeatherRisk(itinerary.route)} />
                  </div>
                  <p style={{ color: '#38bdf8', fontSize: 18, fontWeight: 'bold' }}>{itinerary.route}</p>
                  <p style={{ color: '#facc15', fontWeight: 'bold' }}>Live score: {itinerary.score}/100</p>
                  <p style={{ color: '#cbd5e1' }}>
                    Carrier: {itinerary.carrier} · Aircraft: {itinerary.aircraft} · Status: {itinerary.status}
                  </p>
                  <p style={{ color: '#94a3b8' }}>
                    Depart: {itinerary.departureTime} · Arrive: {itinerary.arrivalTime}
                  </p>
                  <p style={{ color: '#94a3b8' }}>
                    Gate: {itinerary.gate || 'Not available'} · Terminal: {itinerary.terminal || 'Not available'} · {itinerary.source}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, margin: '12px 0' }}>
                    {airportCodesFromRoute(itinerary.route).map((code) => (
                      <MapboxAirportMap key={`${itinerary.id}-${code}`} airportCode={code} title={`${code} airport preview`} compact />
                    ))}
                  </div>
                  <RouteAirportDetails route={itinerary.route} />
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    {itinerary.legs.map((leg, index) => (
                      <div key={`${itinerary.id}-${leg.flightNumber}-${index}`} style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
                        <strong style={{ color: '#f8fafc' }}>Leg {index + 1}: {leg.flightNumber}</strong>
                        <p style={{ color: '#38bdf8', margin: '6px 0' }}>{leg.origin} → {leg.destination}</p>
                        <p style={{ color: '#cbd5e1', margin: 0 }}>
                          {leg.departureTime} → {leg.arrivalTime} · {leg.aircraft} · {leg.status} · Score {leg.score}
                        </p>
                      </div>
                    ))}
                  </div>
                  <OutcomeCapture
                    subjectType="saved-itinerary"
                    subjectId={`live-${itinerary.id}`}
                    title={`Live itinerary ${itinerary.flightNumber}`}
                    route={itinerary.route}
                  />
                </article>
              ))}
            </div>
          ) : (
            <>
              <h3 style={{ color: '#facc15' }}>Placeholder fallback itinerary cards</h3>
              <p style={{ color: '#94a3b8' }}>
                No live flights found for this search. Showing fallback planning guidance.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                {rankedItineraries.map((itinerary) => (
              <article key={itinerary.id} style={{ border: '1px solid #334155', borderRadius: 20, padding: 18, background: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{itinerary.title}</h3>
                  <span style={{ color: confidenceColor(itinerary.confidence), fontWeight: 'bold' }}>{itinerary.confidence}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <ProviderBadge label="Planning fallback" />
                  <WeatherRiskBadge weatherRisk={getRouteWeatherRisk(itinerary.route)} />
                </div>
                <p style={{ color: '#facc15', fontWeight: 'bold' }}>{itinerary.ranking.label}: {itinerary.ranking.score}/100</p>
                <p style={{ color: '#38bdf8', fontSize: 18, fontWeight: 'bold' }}>{itinerary.route}</p>
                <p style={{ color: '#94a3b8' }}>Window: {itinerary.window}</p>
                <p>{itinerary.notes}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, margin: '12px 0' }}>
                  {airportCodesFromRoute(itinerary.route).map((code) => (
                    <MapboxAirportMap key={`${itinerary.id}-${code}`} airportCode={code} title={`${code} airport preview`} compact />
                  ))}
                </div>
                <RouteAirportDetails route={itinerary.route} />
                <p style={{ color: '#cbd5e1' }}>Ranking notes: {itinerary.ranking.notes.join(' · ')}</p>
                <ul style={{ color: '#cbd5e1', paddingLeft: 20 }}>
                  {itinerary.segments.map((segment) => (
                    <li key={segment}>{segment}</li>
                  ))}
                </ul>
                <OutcomeCapture
                  subjectType="saved-itinerary"
                  subjectId={String(itinerary.id)}
                  title={itinerary.title}
                  route={itinerary.route}
                />
              </article>
                ))}
              </div>
            </>
          )}
        </section>

        <section style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a', color: '#cbd5e1', marginTop: 18 }}>
          <strong style={{ color: '#38bdf8' }}>Scoring engine scaffold</strong>
          <p style={{ color: '#94a3b8' }}>
            Placeholder airline-aware scoring model for {scoringScaffold.familyLabel}. Alaska Group is treated as one supported carrier family covering Alaska Airlines and Hawaiian Airlines. No live load integration yet.
          </p>
          <p style={{ color: '#cbd5e1' }}>
            Selected carrier profile: {scoringScaffold.selectedCarrier} · Active family: {scoringScaffold.familyLabel} · Members: {scoringScaffold.members.join(', ')}
          </p>
          <p style={{ color: '#cbd5e1' }}>
            Placeholder weights: Hub Strength {scoringScaffold.weights['Hub Strength']} · Route Complexity {scoringScaffold.weights['Route Complexity']} · Seasonal Demand {scoringScaffold.weights['Seasonal Demand']} · Historical Performance {scoringScaffold.weights['Historical Performance']}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {scoringScaffold.breakdown.map((item) => (
              <article key={item.label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                <small style={{ color: '#94a3b8' }}>{item.label}</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0' }}>{item.value}</h3>
                <p style={{ margin: 0, color: '#cbd5e1' }}>{item.note}</p>
              </article>
            ))}
          </div>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#38bdf8' }}>Community-weighted Success Probability</strong>
            <p style={{ color: '#94a3b8' }}>
              Prediction engine scaffold blended from Outcome History, Community Load Reports, Historical Route Database, Route Confidence Scores, Reputation/Trust Scores, and Traveler Profile for {scoringScaffold.recommendationScope}.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                <small style={{ color: '#94a3b8' }}>Probability %</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{predictionEngine.successProbability}%</h3>
              </article>
              <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                <small style={{ color: '#94a3b8' }}>Confidence %</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{predictionEngine.confidencePercent}%</h3>
                <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>{predictionEngine.confidenceLevel}</p>
              </article>
              <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                <small style={{ color: '#94a3b8' }}>Risk category</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{predictionEngine.riskCategory}</h3>
              </article>
              <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                <small style={{ color: '#94a3b8' }}>Sample Size</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{predictionEngine.sampleSize.total}</h3>
                <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>{predictionEngine.sampleSize.weightedCommunitySample} weighted community units</p>
              </article>
              <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                <small style={{ color: '#94a3b8' }}>Route Confidence Input</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{predictionEngine.inputSummary.routeConfidenceAverage}/100</h3>
                <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>{predictionEngine.sampleSize.routeConfidenceSnapshots} saved snapshot(s)</p>
              </article>
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#f472b6' }}>Why we believe this</strong>
              <ul style={{ color: '#cbd5e1', marginBottom: 0, paddingLeft: 20 }}>
                {predictionEngine.whyWeBelieveThis.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#c084fc' }}>Data Sources Used</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
                {predictionEngine.dataSourcesUsed.map((source) => (
                  <article key={source.label} style={{ border: `1px solid ${source.used ? '#22c55e' : '#334155'}`, borderRadius: 14, padding: 14, background: '#020617' }}>
                    <small style={{ color: source.used ? '#86efac' : '#94a3b8' }}>{source.used ? 'Used' : 'Pending'}</small>
                    <h3 style={{ color: '#f8fafc', margin: '6px 0' }}>{source.label}</h3>
                    <p style={{ color: '#94a3b8', margin: '0 0 6px' }}>Sample size: {source.sampleSize}</p>
                    <p style={{ color: '#cbd5e1', margin: 0 }}>{source.impact}</p>
                  </article>
                ))}
              </div>
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#facc15' }}>Placeholder weighting formula</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
                {predictionEngine.placeholderWeights.map((weight) => (
                  <article key={weight.label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 12, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>{weight.label}</small>
                    <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{weight.value}</h3>
                  </article>
                ))}
              </div>
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#34d399' }}>Community contribution impact</strong>
              <p style={{ color: '#cbd5e1' }}>{predictionEngine.communityContributionImpact.summary}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {[
                  ['New contributors', predictionEngine.communityContributionImpact.newContributorReports],
                  ['Trusted contributors', predictionEngine.communityContributionImpact.trustedContributorReports],
                  ['Elite contributors', predictionEngine.communityContributionImpact.eliteContributorReports],
                  ['Avg contributor trust', predictionEngine.communityContributionImpact.averageContributorTrustScore],
                  ['Weighted report signal', predictionEngine.communityContributionImpact.weightedReportSignal],
                  ['Your trust score', `${predictionEngine.communityContributionImpact.currentUserTrustScore}/100`]
                ].map(([label, value]) => (
                  <article key={label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 12, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>{label}</small>
                    <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                  </article>
                ))}
              </div>
              <p style={{ color: '#94a3b8', marginBottom: 0 }}>
                Current contributor level: {predictionEngine.communityContributionImpact.currentUserContributionLevel}. Trusted reports intentionally move the probability more than new-contributor reports in this scaffold.
              </p>
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#facc15' }}>Calculation explanation</strong>
              <ul style={{ color: '#cbd5e1', marginBottom: 0, paddingLeft: 20 }}>
                {predictionEngine.explanationBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 14 }}>
              {[
                ['Carrier base', `${predictionEngine.inputSummary.carrierDefaultProbability}%`],
                ['Route risk', predictionEngine.inputSummary.routeRisk],
                ['Load reports', predictionEngine.inputSummary.communityReportCount],
                ['Outcome rate', `${predictionEngine.inputSummary.outcomeSuccessRate}%`],
                ['Trust score', `${predictionEngine.inputSummary.trustScore}/100`],
                ['Route confidence', `${predictionEngine.inputSummary.routeConfidenceAverage}/100`]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
          </section>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#facc15' }}>Historical route intelligence scaffold</strong>
            <p style={{ color: '#94a3b8' }}>
              Placeholder route guidance tied to the selected carrier profile. No backend APIs yet.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {Object.entries(scoringScaffold.routeIntelligence).map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
          </section>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#facc15' }}>Historical route score explanation</strong>
            <p style={{ color: '#94a3b8' }}>
              {historicalStats.explanation}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                ['Historical score', historicalStats.averageScore],
                ['Historical success', `${historicalStats.averageSuccessRate}%`],
                ['Report count', historicalStats.reportCount],
                ['Top sample', historicalStats.topRoute?.route || 'Pending']
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <a href="/historical-routes" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>
              View historical route database scaffold
            </a>
          </section>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#34d399' }}>Profile assumptions</strong>
              <ul style={{ color: '#cbd5e1', marginBottom: 0, paddingLeft: 20 }}>
                {predictionEngine.inputSummary.travelerProfileSignals.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
              <a href="/profile" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>Edit profile scaffold</a>
            </div>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#34d399' }}>Traveler profile summary</strong>
            <p style={{ color: '#94a3b8' }}>
              Local profile values currently feeding route scoring assumptions.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                ['Employee airline', travelerProfile.employeeAirline],
                ['Traveler type', travelerProfile.travelerType],
                ['Pass priority', travelerProfile.passPriority],
                ['Home airport', travelerProfile.homeAirport],
                ['Preferred airports', travelerProfile.preferredAirports.join(', ')]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <a href="/profile" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>Update local profile</a>
          </section>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#22c55e' }}>Top 3 route recommendations</strong>
            <p style={{ color: '#94a3b8' }}>
              Placeholder ranking tied to the score card and route intelligence for {scoringScaffold.recommendationScope}.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px' }}>Rank</th>
                    <th style={{ padding: '10px 8px' }}>Route</th>
                    <th style={{ padding: '10px 8px' }}>Score</th>
                    <th style={{ padding: '10px 8px' }}>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {scoringScaffold.routeRecommendations.map((recommendation) => (
                    <tr key={`${recommendation.rank}-${recommendation.route}`} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '12px 8px', color: '#22c55e', fontWeight: 'bold' }}>{recommendation.rank}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: '#f8fafc' }}>{recommendation.route}</strong>
                        <br />
                        <small style={{ color: '#94a3b8' }}>{recommendation.carrier}</small>
                      </td>
                      <td style={{ padding: '12px 8px' }}>{recommendation.score}</td>
                      <td style={{ padding: '12px 8px' }}>{recommendation.risk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <a href="/load-reports" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>
              Verify a load for these recommendations
            </a>
            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              {scoringScaffold.routeRecommendations.map((recommendation) => (
                <OutcomeCapture
                  key={`outcome-${recommendation.rank}-${recommendation.route}`}
                  subjectType="route-recommendation"
                  subjectId={`${recommendation.carrier}-${recommendation.rank}-${recommendation.route}`}
                  title={`Rank ${recommendation.rank} ${recommendation.carrier} recommendation`}
                  route={recommendation.route}
                />
              ))}
            </div>
          </section>
        </section>

        <section style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 30 }}>Flight results</h2>
          <p style={{ color: '#94a3b8' }}>
            {query || tripGoal ? `${matchingFlights.length} matching flights` : `${flights.length} searchable flights loaded`} · Last refresh {lastUpdated || 'pending'}
          </p>
          {(query || tripGoal ? matchingFlights : flights).map((flight) => {
            const risk = delayRiskScore(flight)
            return (
              <article key={flight.id} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
                <h3 style={{ marginTop: 0 }}>{flight.flight_number}</h3>
                <p style={{ color: '#38bdf8' }}>{flight.origin} → {flight.destination}</p>
                <p>Aircraft: {flight.aircraft || 'Unknown'} · Status: {flight.status || 'Unknown'} · Score: {flight.score ?? 'Not scored'}</p>
                <p>Delay risk: {risk.label} ({risk.score}/100)</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
                  <MapboxAirportMap airportCode={flight.origin} title={`${flight.origin || 'Origin'} airport map`} compact />
                  <MapboxAirportMap airportCode={flight.destination} title={`${flight.destination || 'Destination'} airport map`} compact />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
                  {richFlightFieldLabels.map((field) => (
                    <div key={field.key} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                      <small style={{ color: '#94a3b8' }}>{field.label}</small>
                      <p style={{ margin: '4px 0 0' }}>{fieldValue(flight, field.key)}</p>
                    </div>
                  ))}
                </div>
                <details style={{ marginTop: 12 }}>
                  <summary style={{ color: '#38bdf8', cursor: 'pointer' }}>Show all DB fields</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
                    {allFlightFields(flight).map(([key, value]) => (
                      <div key={key} style={{ border: '1px solid #334155', borderRadius: 10, padding: 8, background: '#020617' }}>
                        <small style={{ color: '#94a3b8' }}>{key}</small>
                        <p style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{value === null || value === undefined || value === '' ? 'Not available yet' : String(value)}</p>
                      </div>
                    ))}
                  </div>
                </details>
                <a href={`/flights/${flight.id}`} style={{ color: '#38bdf8' }}>View flight detail</a>
              </article>
            )
          })}
        </section>


      </section>
    </main>
  )
}

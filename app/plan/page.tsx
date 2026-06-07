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
import { parseItineraryPrompt } from '../../lib/itinerarySearch'
import { effectiveLoadReportWeight, loadLoadReports, loadReportSignal, loadReportSummary, type LoadReport } from '../../lib/loadReports'
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
import { markActivationStep } from '../../lib/onboardingActivation'

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

const demoSearchFlights = [
  {
    id: 'demo-UA1170-LAX-HNL',
    flight_number: 'UA1170-DEMO',
    origin: 'LAX',
    destination: 'HNL',
    aircraft: '777 demo',
    status: 'Demo fallback — verify live loads before travel',
    score: 78,
    departure_time: '09:15 demo',
    arrival_time: '12:55 demo',
    source_provider: 'personal-testing-demo'
  },
  {
    id: 'demo-DL443-SFO-DEN',
    flight_number: 'DL443-DEMO',
    origin: 'SFO',
    destination: 'DEN',
    aircraft: 'A321 demo',
    status: 'Demo fallback — no live API row matched',
    score: 72,
    departure_time: '13:35 demo',
    arrival_time: '17:05 demo',
    source_provider: 'personal-testing-demo'
  },
  {
    id: 'demo-AS875-SEA-HNL',
    flight_number: 'AS875-DEMO',
    origin: 'SEA',
    destination: 'HNL',
    aircraft: '737 demo',
    status: 'Demo fallback — use for UI testing only',
    score: 74,
    departure_time: '08:40 demo',
    arrival_time: '12:25 demo',
    source_provider: 'personal-testing-demo'
  }
]

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
  duration?: string
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
  sourceProvider?: string
  sourceCheckedAt?: string
}

type LiveItineraryResult = {
  id: string
  route: string
  legs: LiveItineraryLeg[]
  carrier: string
  flightNumber: string
  departureTime: string
  arrivalTime: string
  duration?: string
  aircraft: string
  status: string
  gate?: string
  terminal?: string
  score: number
  risk: string
  source: string
  sourceProvider?: string
  sourceCheckedAt?: string
  providerBadges?: string[]
  dataFreshnessLabel?: string
  dataFreshnessDetail?: string
  dataFreshnessRule?: 'exact-requested-date' | 'nearest-date-testing-match' | 'stored-historical-data' | 'demo-fallback'
  dataFreshnessWarning?: string
  requestedDate?: string
  matchedDate?: string
  productionAvailability?: boolean
}

type ProviderStatus = {
  provider: 'supabase' | 'aviationstack' | 'flightaware' | 'planning'
  label: string
  state: 'pending' | 'success' | 'skipped' | 'warning' | 'error'
  detail: string
}

type ScheduleProviderReadinessStatus = 'Configured' | 'Missing' | 'Limited' | 'Placeholder'

type ScheduleProviderReadiness = {
  key: string
  label: string
  status: ScheduleProviderReadinessStatus
  whatItCanProvide: string[]
  whatItCannotProvide: string[]
  recommendedNextAction: string
  detail: string
}

type ApiResponseCounts = {
  flightAwareScheduleRequests?: number
  flightAwareScheduleFetched?: number
  flightAwareScheduleItineraries?: number
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

type FlightRouteMatchDiagnostics = {
  id: string
  flightNumber: string
  normalized: {
    origin?: string
    destination?: string
    date?: string
    carrierText: string
    originRaw?: string
    destinationRaw?: string
    dateRaw?: string
  }
  originMatches: boolean
  destinationMatches: boolean
  dateMatches: boolean
  carrierMatches: boolean
  matched: boolean
  rejectionReasons: string[]
}

type RouteMatchingSummary = {
  requested: {
    origin?: string
    destination?: string
    date?: string
    carrier?: string
  }
  originMatches: number
  destinationMatches: number
  dateMatches: number
  carrierMatches: number
  exactRouteMatches: number
  finalMatchedRows: number
  totalCandidates: number
  matchExplanation: string
  dateCoverage: {
    requestedSearchDate?: string
    effectiveMatchDate?: string
    oldestFlightDate?: string
    newestFlightDate?: string
    availableDates: string[]
    closestAvailableDates: string[]
    requestedDateIsNewerThanAvailableData: boolean
    nearestDateApplied: boolean
    nearestDateToleranceDays?: number
    dateMode: 'strict' | 'nearest-date-testing'
    warning?: string
  }
  routeNormalization: {
    normalizedRouteCount: number
    normalizedRoutes: Array<{
      route: string
      count: number
      sampleFlightNumbers: string[]
    }>
    missingOriginCount: number
    missingDestinationCount: number
    missingDateCount: number
    carrierSamples: string[]
    dateSamples: string[]
  }
  closestMatchingRoutes: Array<{
    route: string
    count: number
    reason: string
    sampleFlightNumbers: string[]
  }>
  rejectedCandidates: FlightRouteMatchDiagnostics[]
}

type ItineraryDebugMetadata = {
  parsedOrigin?: string
  parsedDestination?: string
  parsedDate?: string
  parserConfidence?: number
  parserExplanation?: string
  parserFallbackApplied?: boolean
  selectedCarrier: string
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
  apiResponseCounts?: ApiResponseCounts
  routeMatching?: RouteMatchingSummary
  emptyResults?: string[]
  rateLimits?: string[]
  invalidAirportCodes?: string[]
  unsupportedAirportCodes?: string[]
  invalidDates?: string[]
  providerExplanation?: string[]
  providerStatuses?: ProviderStatus[]
  trueLiveDataAvailable?: boolean
  trueLiveDataUnavailableReason?: string
  activeDataMode?: 'production-safe' | 'test-data'
  testDataModeEnabled?: boolean
  dataFreshnessMode?: 'live-current-api' | 'stored-supabase' | 'nearest-date-testing' | 'demo-fallback' | 'mvp-test-data' | 'no-current-live-data'
  dataFreshnessExplanation?: string[]
  scheduleProviderReadiness?: ScheduleProviderReadiness[]
  normalizedFlightAwareItinerarySample?: {
    provider: string
    sourceCheckedAt: string
    flightNumber: string
    carrier: string
    origin: string
    destination: string
    departureTime: string
    arrivalTime: string
    duration: string
    aircraft: string
    status: string
  }
  safeErrors: string[]
}

type ItinerarySearchOverrides = {
  carrier?: string
  maxLegs?: string
  homeAirport?: string
  travelWindow?: string
}

function riskColor(risk: string) {
  if (risk.includes('Low')) return '#22c55e'
  if (risk.includes('Medium')) return '#facc15'
  return '#f87171'
}

function providerBadgeStyle(label: string) {
  if (label.includes('Live provider API data') || label.includes('Freshness: Live') || label.includes('Exact requested date') || label.includes('Freshness: Exact')) return { border: '#22c55e', text: '#bbf7d0', background: 'rgba(34, 197, 94, 0.12)' }
  if (label.includes('Stored Supabase flight data') || label.includes('Stored Supabase data') || label.includes('Stored historical') || label.includes('Freshness: Stored')) return { border: '#38bdf8', text: '#bae6fd', background: 'rgba(56, 189, 248, 0.12)' }
  if (label.includes('Nearest-date') || label.includes('Demo fallback') || label.includes('MVP test data') || label.includes('Freshness: Demo')) return { border: '#facc15', text: '#fef3c7', background: 'rgba(250, 204, 21, 0.12)' }
  if (label.includes('Supabase')) return { border: '#22c55e', text: '#bbf7d0', background: 'rgba(34, 197, 94, 0.12)' }
  if (label.includes('Aviationstack')) return { border: '#38bdf8', text: '#bae6fd', background: 'rgba(56, 189, 248, 0.12)' }
  if (label.includes('FlightAware')) return { border: '#c084fc', text: '#e9d5ff', background: 'rgba(192, 132, 252, 0.12)' }
  return { border: '#facc15', text: '#fef3c7', background: 'rgba(250, 204, 21, 0.12)' }
}

function sourceBadgeLabel(source?: string, sourceProvider?: string) {
  const value = `${sourceProvider || ''} ${source || ''}`.toLowerCase()
  if (value.includes('flightaware')) return 'Source: FlightAware live API'
  if (value.includes('aviationstack')) return 'Source: Aviationstack live API'
  if (value.includes('supabase')) return 'Source: Stored Supabase'
  if (value.includes('mvp') || value.includes('test-data')) return 'Source: MVP test data'
  if (value.includes('demo') || value.includes('planning')) return 'Source: Demo fallback'
  return 'Source: Unknown'
}

function freshnessBadgeLabel(label?: string, dataMode?: string, rule?: LiveItineraryResult['dataFreshnessRule']) {
  const value = `${label || ''} ${dataMode || ''} ${rule || ''}`.toLowerCase()
  if (value.includes('exact requested date') || value.includes('exact-requested-date')) return 'Freshness: Exact requested date'
  if (value.includes('nearest-date')) return 'Freshness: Nearest-date testing data'
  if (value.includes('live')) return 'Freshness: Live provider API data'
  if (value.includes('historical')) return 'Freshness: Stored historical data'
  if (value.includes('supabase') || value.includes('stored') || value.includes('cached')) return 'Freshness: Stored Supabase flight data'
  if (value.includes('mvp') || value.includes('test') || value.includes('fallback') || value.includes('demo')) return 'Freshness: Demo fallback data'
  return 'Freshness: Not provided'
}

function itineraryDateWarning(itinerary: LiveItineraryResult) {
  if (itinerary.dataFreshnessWarning) return itinerary.dataFreshnessWarning
  if (itinerary.requestedDate && itinerary.matchedDate && itinerary.requestedDate !== itinerary.matchedDate) {
    return `Date mismatch: requested ${itinerary.requestedDate}, showing ${itinerary.matchedDate}. Do not treat this card as production availability.`
  }
  if (itinerary.productionAvailability === false && itinerary.dataFreshnessRule === 'demo-fallback') return 'Demo fallback data is not production availability.'
  if (itinerary.productionAvailability === false && itinerary.dataFreshnessRule === 'stored-historical-data') return 'Stored historical data is not live production availability.'
  return ''
}

function readinessBadgeStyle(status: ScheduleProviderReadinessStatus) {
  if (status === 'Configured') return { border: '#22c55e', text: '#bbf7d0', background: 'rgba(34, 197, 94, 0.12)' }
  if (status === 'Limited') return { border: '#38bdf8', text: '#bae6fd', background: 'rgba(56, 189, 248, 0.12)' }
  if (status === 'Missing') return { border: '#facc15', text: '#fef3c7', background: 'rgba(250, 204, 21, 0.12)' }
  return { border: '#94a3b8', text: '#cbd5e1', background: 'rgba(148, 163, 184, 0.12)' }
}

function validateTravelDate(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'Use YYYY-MM-DD, e.g. 2026-06-06, or leave it blank for flexible dates.'
  const parsed = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) return 'That date is not valid. Use YYYY-MM-DD, e.g. 2026-06-06.'
  return ''
}

function displayField(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return 'Not provided'
  return String(value)
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
  dataFreshnessLabel?: string
  dataFreshnessDetail?: string
  disruption: DisruptionIntelligence
  routeConfidence: RouteConfidence
  weatherRisk: WeatherRisk
  airportIntelligence: RouteAirportIntelligence
  communityReports: LoadReport[]
  communityReportSummary: string
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

type FallbackItineraryResult = {
  id: string | number
  title: string
  route: string
  confidence: string
  window: string
  notes: string
  segments: string[]
  backupOptions: number
  travelerFriction: number
  ranking: ReturnType<typeof rankItinerary>
}

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
  return reports.reduce((total, report) => total + loadReportSignal(report), 0)
}

function reportTrustAndRecencySummary(reports: LoadReport[]) {
  if (!reports.length) return 'No community report trust/recency signal yet.'
  const averageTrust = Math.round(reports.reduce((total, report) => total + report.reportTrustScore, 0) / reports.length)
  const averageRecency = Number((reports.reduce((total, report) => total + effectiveLoadReportWeight(report), 0) / reports.length).toFixed(2))
  return `${reports.length} report${reports.length === 1 ? '' : 's'} · avg report trust ${averageTrust}/100 · avg effective weight ${averageRecency}x`
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
        ? `Provider itinerary score ${input.sourceScore}/100 receives extra weight because it reflects the current result source for ${input.route}.`
        : `Planning scaffold rank ${input.sourceScore}/100 is used when no provider matching itinerary is available.`,
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
        ? `${input.routeReports.length} matching structured community load report${input.routeReports.length === 1 ? '' : 's'} create a ${loadDirection} ${input.loadAdjustment >= 0 ? '+' : ''}${input.loadAdjustment.toFixed(1)} point trust/recency-weighted load signal. ${reportTrustAndRecencySummary(input.routeReports)}.`
        : 'No matching community load reports yet; route keeps the neutral community-load assumption.',
      input.routeOutcomes.length
        ? `${input.routeOutcomes.length} saved outcome${input.routeOutcomes.length === 1 ? '' : 's'} calibrate this route at ${input.outcomeRate}% success.`
        : 'No saved outcomes for this exact route yet; community outcome calibration remains neutral.',
      'Community intelligence remains local/static in this scaffold and now includes structured seats, cleared standby estimates, confidence level, report trust, and recency weighting.'
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
      'Community load reports: seats/standbys, confidence, contributor trust, and recency are weighted, then capped between -8 and +8 points.',
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

function carrierHubForDemo(carrierValue: string) {
  const normalizedCarrier = normalizeCarrierFamily(carrierValue)
  if (normalizedCarrier === 'delta') return 'ATL'
  if (normalizedCarrier === 'alaska-group') return 'SEA'
  return 'DEN'
}

function buildFallbackDemoItineraries({
  origin,
  destination,
  carrierValue,
  travelWindow
}: {
  origin?: string
  destination?: string
  carrierValue: string
  travelWindow?: string
}): FallbackItineraryResult[] {
  const normalizedOrigin = origin?.trim().toUpperCase().match(/\b[A-Z]{3}\b/)?.[0]
  const normalizedDestination = destination?.trim().toUpperCase().match(/\b[A-Z]{3}\b/)?.[0]
  if (!normalizedOrigin || !normalizedDestination || normalizedOrigin === normalizedDestination) return rankedItineraries

  const hub = carrierHubForDemo(carrierValue)
  const secondaryHub = hub === 'DEN' ? 'SFO' : hub === 'SEA' ? 'PDX' : 'MSP'
  const demoWindow = travelWindow?.trim() || 'Flexible personal test window'
  const demoItineraries = [
    {
      id: `demo-direct-${normalizedOrigin}-${normalizedDestination}`,
      title: 'Demo nonstop fallback',
      route: `${normalizedOrigin} → ${normalizedDestination}`,
      confidence: 'Verify',
      window: demoWindow,
      notes: 'Live providers returned no matching flights, so this demo card keeps the planner usable for personal testing. Verify real schedules and loads before travel.',
      segments: [`${normalizedOrigin} to ${normalizedDestination}: direct demo option`, 'Check live airline app and airport standby list before committing'],
      backupOptions: 2,
      travelerFriction: 3
    },
    {
      id: `demo-hub-${normalizedOrigin}-${hub}-${normalizedDestination}`,
      title: 'Demo hub backup',
      route: `${normalizedOrigin} → ${hub} → ${normalizedDestination}`,
      confidence: 'Verify',
      window: demoWindow,
      notes: `Fallback demo routing through ${hub}. Use this to test scoring, probability, watchlist, and outcome capture when live APIs are empty.`,
      segments: [`${normalizedOrigin} to ${hub}: positioning leg`, `${hub} to ${normalizedDestination}: recovery leg`, 'Keep same-day backup options open'],
      backupOptions: 4,
      travelerFriction: 6
    },
    {
      id: `demo-alt-${normalizedOrigin}-${secondaryHub}-${normalizedDestination}`,
      title: 'Demo alternate connection',
      route: `${normalizedOrigin} → ${secondaryHub} → ${normalizedDestination}`,
      confidence: 'Caution',
      window: demoWindow,
      notes: `Alternate demo path through ${secondaryHub}. It intentionally carries more friction so personal testing can compare lower-ranked backups.`,
      segments: [`${normalizedOrigin} to ${secondaryHub}: alternate positioning`, `${secondaryHub} to ${normalizedDestination}: destination leg`, 'Use only if primary/hub options tighten'],
      backupOptions: 3,
      travelerFriction: 8
    }
  ]

  return demoItineraries
    .map((itinerary) => ({ ...itinerary, ranking: rankItinerary(itinerary) }))
    .sort((a, b) => b.ranking.score - a.ranking.score)
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
    isLive: itinerary.productionAvailability !== false,
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
    isLive: itinerary.productionAvailability !== false,
    providerBadges: itinerary.providerBadges?.length ? itinerary.providerBadges : [itinerary.source.includes('aviationstack') || itinerary.source.includes('flightaware') ? 'Live provider API data' : 'Stored Supabase flight data', ...(itinerary.source.includes('flightaware') ? ['FlightAware enriched'] : [])],
    dataFreshnessLabel: itinerary.dataFreshnessLabel,
    dataFreshnessDetail: itinerary.dataFreshnessDetail,
    disruption,
    routeConfidence,
    weatherRisk,
    airportIntelligence,
    communityReports: routeReports,
    communityReportSummary: reportTrustAndRecencySummary(routeReports),
    why: [
      `Blends provider itinerary score ${itinerary.score}/100 with probability engine baseline ${predictionEngine.successProbability}%.`,
      `Route confidence engine scores this option ${routeConfidence.score}/100 (${routeConfidence.badge}) with a ${routeConfidence.trend} trend.`,
      `Weather intelligence labels this route ${weatherRisk.category} and adjusts success probability by ${weatherRisk.successProbabilityImpact} point${weatherRisk.successProbabilityImpact === 1 || weatherRisk.successProbabilityImpact === -1 ? '' : 's'}.`,
      `Airport intelligence gives this route a ${airportIntelligence.connectionRiskScore}/100 connection risk score and ${airportIntelligence.backupFlightAvailability} backup flight availability.`,
      `Disruption intelligence adjusts this option by ${disruption.successProbabilityImpact} probability points and ${disruption.routeRankingImpact} ranking points; route health is ${disruption.routeHealth}.`,
      historicalRoute
        ? `Historical route match ${historicalRoute.route} contributes ${historicalRoute.successRate}% success and ${historicalRoute.reportCount} reports.`
        : `Carrier historical scaffold contributes ${predictionEngine.inputSummary.historicalSuccessRate}% average success.` ,
      routeReports.length
        ? `${routeReports.length} structured community load report${routeReports.length === 1 ? '' : 's'} add a ${loadAdjustment >= 0 ? '+' : ''}${loadAdjustment.toFixed(1)} trust/recency-weighted load signal.`
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
    communityReports: routeReports,
    communityReportSummary: reportTrustAndRecencySummary(routeReports),
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
        ? `${routeReports.length} structured community load report${routeReports.length === 1 ? '' : 's'} add a ${loadAdjustment >= 0 ? '+' : ''}${loadAdjustment.toFixed(1)} trust/recency-weighted load signal.`
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginTop: 14 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12, marginTop: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, marginTop: 12 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12, marginTop: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, marginTop: 12 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12, marginTop: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, marginTop: 12 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12, marginTop: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 270px), 1fr))', gap: 12, marginTop: 12 }}>
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

  if (comparisons.length === 0 && savedComparisons.length === 0) return null

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
      sourceLabel: comparison.dataFreshnessLabel || (comparison.isLive ? 'Provider itinerary option' : 'Planning scaffold option')
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
          <h3 style={{ fontSize: 28, margin: '8px 0' }}>Recommended itineraries</h3>
          <p style={{ color: '#94a3b8', marginTop: 0 }}>
            Ranked with traveler profile, route intelligence, historical routes, community load reports, saved outcomes, disruption intelligence, weather impact, and the route confidence engine.
          </p>
        </div>
        {comparisons[0] && (
          <span style={{ border: '1px solid #22c55e', borderRadius: 999, color: '#22c55e', padding: '8px 12px', fontWeight: 'bold' }}>
            Best: {comparisons[0].route}
          </span>
        )}
      </div>

      {watchStatus && <p style={{ color: '#22c55e', fontWeight: 'bold' }}>{watchStatus} <a href="/watchlist" style={{ color: '#38bdf8' }}>Open watchlist</a></p>}
      {compareStatus && <p style={{ color: '#c084fc', fontWeight: 'bold' }}>{compareStatus}</p>}

      <WeatherIntelligenceSection comparisons={comparisons} />
      <RouteConfidenceSection comparisons={comparisons} />
      <AirportIntelligenceSection comparisons={comparisons} />
      <DisruptionIntelligenceSection comparisons={comparisons} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14, marginTop: 16 }}>
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
                #{index + 1} · {comparison.dataFreshnessLabel || (comparison.isLive ? 'Provider option' : 'Planning scaffold')}
              </small>
              <h4 style={{ color: '#f8fafc', fontSize: 22, margin: '8px 0' }}>{comparison.route}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {comparison.providerBadges.map((badge) => (
                  <ProviderBadge key={`${comparison.id}-${badge}`} label={badge} />
                ))}
                <WeatherRiskBadge weatherRisk={comparison.weatherRisk} />
              </div>
              {comparison.dataFreshnessDetail ? (
                <p style={{ color: '#fde68a', margin: '0 0 12px' }}>{comparison.dataFreshnessDetail}</p>
              ) : null}
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

              <section style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617', marginTop: 12 }}>
                <strong style={{ color: '#facc15' }}>Community load reports</strong>
                <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>{comparison.communityReportSummary}</p>
                {comparison.communityReports.length ? (
                  <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                    {comparison.communityReports.slice(0, 3).map((report) => (
                      <article key={`${comparison.id}-${report.id}`} style={{ border: '1px solid #1e293b', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ color: '#f8fafc' }}>{report.airline || report.carrier} {report.flightNumber}</strong>
                          <span style={{ color: '#fde68a' }}>{report.reportTrustScore}/100 trust · {report.recencyWeight}x recency</span>
                        </div>
                        <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>{loadReportSummary(report)}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#64748b', margin: '8px 0 0' }}>Submit a matching report in Load Reports to influence ranking.</p>
                )}
              </section>

              <RouteAirportDetails route={comparison.route} />
              <ScoringExplanationDetails comparison={comparison} backup={comparisons[index + 1] || comparisons.find((item) => item.id !== comparison.id)} />
              <OutcomeCapture
                subjectType="route-recommendation"
                subjectId={`comparison-${comparison.id}`}
                title={`Planner recommendation ${comparison.route}`}
                route={comparison.route}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 10, marginTop: 14 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 14, marginTop: 14 }}>
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
  const [travelDateError, setTravelDateError] = useState('')
  const [travelerCount, setTravelerCount] = useState('1')
  const [maxLegs, setMaxLegs] = useState('2')
  const [carrier, setCarrier] = useState('all')
  const [personalTestingMode, setPersonalTestingMode] = useState(true)
  const [nearestDateToleranceDays, setNearestDateToleranceDays] = useState('45')
  const [voiceStatus, setVoiceStatus] = useState('Voice capture scaffold ready.')
  const [submitted, setSubmitted] = useState(false)
  const [itineraryStatus, setItineraryStatus] = useState('Enter an itinerary request to search live flight data.')
  const [itineraryLoading, setItineraryLoading] = useState(false)
  const [liveItineraries, setLiveItineraries] = useState<LiveItineraryResult[]>([])
  const [itineraryWarnings, setItineraryWarnings] = useState<string[]>([])
  const [itinerarySource, setItinerarySource] = useState('FlightAware live schedules')
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
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseKey) {
        setFlights(demoSearchFlights)
        setLastUpdated(`${new Date().toLocaleTimeString()} · demo fallback`)
        return
      }

      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/flights?select=*&order=created_at.desc&limit=100`,
          { headers: { apikey: supabaseKey } }
        )
        const data = await res.json()
        setFlights(Array.isArray(data) && data.length ? data : demoSearchFlights)
        setLastUpdated(`${new Date().toLocaleTimeString()}${Array.isArray(data) && data.length ? '' : ' · demo fallback'}`)
      } catch {
        setFlights(demoSearchFlights)
        setLastUpdated(`${new Date().toLocaleTimeString()} · demo fallback`)
      }
    }

    loadFlights()
    const refresh = window.setInterval(loadFlights, 30000)
    return () => window.clearInterval(refresh)
  }, [])

  async function runItinerarySearch(searchText: string, overrides: ItinerarySearchOverrides = {}) {
    const trimmedSearch = searchText.trim()
    const originAirport = (overrides.homeAirport ?? homeAirport).trim().toUpperCase()
    const requestedTravelWindow = (overrides.travelWindow ?? travelWindow).trim()
    const requestedCarrier = overrides.carrier ?? carrier
    const requestedMaxLegs = overrides.maxLegs ?? maxLegs
    const dateError = validateTravelDate(requestedTravelWindow)

    if (dateError) {
      setTravelDateError(dateError)
      setLiveItineraries([])
      setItineraryDebug(null)
      setItineraryStatus(dateError)
      setItineraryDataMode('Awaiting valid date')
      return
    }
    setTravelDateError('')

    if (!trimmedSearch && !originAirport) {
      setLiveItineraries([])
      setItineraryDebug(null)
      setItineraryStatus('Enter an itinerary request to search live flight data.')
      setItineraryDataMode('Awaiting live search')
      return
    }

    setItineraryLoading(true)
    markActivationStep('runFirstTripPlan')
    setConfidenceUpdateTrigger('itinerary-search-run')
    setItineraryStatus('Searching FlightAware live provider API data first, then exact-date stored Supabase flight data, then Aviationstack fallback. Demo fallback appears only when test data mode is enabled server-side...')
    setItineraryDataMode('Searching providers')
    setItineraryWarnings([])
    setItineraryDebug(null)

    const params = new URLSearchParams()
    if (trimmedSearch) params.set('q', trimmedSearch)
    if (originAirport) params.set('origin', originAirport)
    if (requestedTravelWindow) params.set('date', requestedTravelWindow)
    params.set('carrier', requestedCarrier)
    params.set('maxLegs', requestedMaxLegs)
    if (personalTestingMode) {
      params.set('personalTestingMode', 'true')
      params.set('nearestDateToleranceDays', nearestDateToleranceDays || '45')
    }

    try {
      const response = await fetch(`/api/itinerary/search?${params.toString()}`)
      const data = await response.json()
      const itineraries = Array.isArray(data?.itineraries) ? data.itineraries as LiveItineraryResult[] : []
      setLiveItineraries(itineraries)
      const apiWarnings = Array.isArray(data?.warnings) ? data.warnings : []
      setItineraryWarnings(data?.errorMessage ? [...new Set([...apiWarnings, data.errorMessage])] : apiWarnings)
      setItinerarySource(data?.sourceLabel || (data?.enrichedWithFlightAware ? 'Stored Supabase flight data + FlightAware enrichment' : 'Stored Supabase flight data'))
      setItineraryDataMode(data?.dataMode === 'no-current-live-data'
        ? 'No current live data'
        : data?.dataMode === 'nearest-date-testing'
        ? 'Nearest-date testing data'
        : data?.dataMode === 'stored-supabase'
          ? 'Stored Supabase flight data'
        : data?.dataMode === 'test-data'
        ? 'Demo fallback data (MVP test data)'
        : data?.dataMode === 'fallback' || itineraries.length === 0
          ? (data?.debug?.testDataModeEnabled === false ? 'No current live data' : 'Demo fallback data')
          : 'Live provider API data')
      setItineraryDebug(data?.debug || null)
      setItineraryStatus(data?.statusMessage || (itineraries.length
        ? `${itineraries.length} itinerary result${itineraries.length === 1 ? '' : 's'} found for ${data?.request?.origin || 'any origin'} → ${data?.request?.destination || 'any destination'}.`
        : 'No current live data found for this search.'
      ))
    } catch {
      setLiveItineraries([])
      setItineraryDebug(null)
      setItineraryStatus('Itinerary search failed. No current live data is shown while production-safe mode cannot be confirmed.')
      setItineraryDataMode('No current live data')
      setItineraryWarnings(['Itinerary API request failed'])
    } finally {
      setItineraryLoading(false)
    }
  }

  async function submitPlanRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    const dateError = validateTravelDate(travelWindow)
    setTravelDateError(dateError)
    if (dateError) {
      setItineraryStatus(dateError)
      setItineraryDataMode('Awaiting valid date')
      return
    }
    if (tripGoal.trim()) {
      setQuery(tripGoal.trim())
      window.history.replaceState(null, '', `/plan?q=${encodeURIComponent(tripGoal.trim())}`)
    }
    await runItinerarySearch(tripGoal)
  }

  function handleCarrierChange(nextCarrier: string) {
    setCarrier(nextCarrier)
    setConfidenceUpdateTrigger('local-signal-refresh')
    const currentSearch = (tripGoal || query).trim()
    if (currentSearch || homeAirport.trim()) {
      void runItinerarySearch(currentSearch, { carrier: nextCarrier })
      return
    }
    setLiveItineraries([])
    setItineraryDataMode('Fallback demo guidance')
    setItinerarySource('Planning fallback')
    setItineraryStatus('Carrier scope updated. Demo recommendations refreshed; add a route to search provider data.')
  }

  function handleMaxLegsChange(nextMaxLegs: string) {
    setMaxLegs(nextMaxLegs)
    const currentSearch = (tripGoal || query).trim()
    if (currentSearch || homeAirport.trim()) {
      void runItinerarySearch(currentSearch, { maxLegs: nextMaxLegs })
      return
    }
    setLiveItineraries([])
    setItineraryDataMode('Fallback demo guidance')
    setItinerarySource('Planning fallback')
    setItineraryStatus('Max legs updated. Demo recommendations refreshed; add a route to search live itinerary assembly.')
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
  const visibleFlights = (query || tripGoal) ? (matchingFlights.length ? matchingFlights : demoSearchFlights) : flights
  const flightResultsLabel = query || tripGoal
    ? matchingFlights.length
      ? `${matchingFlights.length} matching flights`
      : `No matching flight rows; showing ${demoSearchFlights.length} demo fallback flights`
    : `${flights.length} searchable flights loaded`
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

  const aiTripPreview = useMemo(
    () => parseTripPlannerPrompt(aiTripPrompt, travelerProfile),
    [aiTripPrompt, travelerProfile]
  )

  const parsedPlanRequest = useMemo(() => parseItineraryPrompt(tripGoal || query), [tripGoal, query, aiTripPrompt])
  const fallbackDemoItineraries = useMemo(() => buildFallbackDemoItineraries({
    origin: itineraryDebug?.parsedOrigin || homeAirport || parsedPlanRequest.origin || aiTripPreview.origin,
    destination: itineraryDebug?.parsedDestination || parsedPlanRequest.destination || aiTripPreview.destination,
    carrierValue: carrier,
    travelWindow: travelWindow || parsedPlanRequest.date || aiTripPreview.dateRange
  }), [itineraryDebug?.parsedOrigin, itineraryDebug?.parsedDestination, homeAirport, parsedPlanRequest.origin, parsedPlanRequest.destination, parsedPlanRequest.date, aiTripPreview.origin, aiTripPreview.destination, aiTripPreview.dateRange, carrier, travelWindow])

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
      : fallbackDemoItineraries.map((itinerary) => buildFallbackItineraryComparison(
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
  }, [liveItineraries, predictionEngine, historicalStats.routes, loadReports, outcomes, travelerProfile, scoringScaffold.routeIntelligence, scoringScaffold.weights, scoringScaffold.recommendationScope, confidenceUpdateTrigger, fallbackDemoItineraries])

  const aiTripPlan = useMemo(() => generateAiTripPlan({
    prompt: aiTripPrompt,
    travelerProfile,
    routeIntelligence: scoringScaffold.routeIntelligence,
    routeRecommendations: scoringScaffold.routeRecommendations,
    historicalRoutes: historicalStats.routes,
    predictionEngine
  }), [aiTripPrompt, travelerProfile, scoringScaffold.routeIntelligence, scoringScaffold.routeRecommendations, historicalStats.routes, predictionEngine])

  const travelDateHelperText = travelDateError || (travelWindow.trim()
    ? 'Single-date search active. Edit manually as YYYY-MM-DD or use the calendar picker where available.'
    : 'Optional. Use the calendar picker where available, or type YYYY-MM-DD, e.g. 2026-06-06. Blank searches stay flexible.')

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 'clamp(16px, 4vw, 32px)', fontFamily: 'Arial', overflowX: 'hidden' }}>
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
        <h1 style={{ fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1.05, margin: '8px 0 12px' }}>
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

        <section style={{ border: '1px solid #c084fc', borderRadius: 24, padding: 'clamp(16px, 4vw, 22px)', background: 'linear-gradient(135deg, rgba(49, 46, 129, 0.66), rgba(15, 23, 42, 0.96))', marginTop: 24, overflow: 'hidden' }}>
          <p style={{ color: '#c084fc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>AI Trip Planner scaffold</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18, alignItems: 'start', width: '100%' }}>
            <form onSubmit={submitAiTripPlanner} style={{ minWidth: 0 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 12 }}>
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

            <aside style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#020617', minWidth: 0, overflowWrap: 'anywhere' }}>
              <strong style={{ color: '#22c55e' }}>Recommended plan</strong>
              <h3 style={{ color: '#f8fafc', margin: '8px 0' }}>{aiTripPlan.bestRoute}</h3>
              <p style={{ color: '#38bdf8', fontWeight: 'bold' }}>Backup: {aiTripPlan.backupRoute}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 18, marginTop: 28 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
                Travel date (optional single date)
                <input
                  type="date"
                  value={travelWindow}
                  onChange={(event) => {
                    const nextDate = event.target.value
                    setTravelWindow(nextDate)
                    setTravelDateError(validateTravelDate(nextDate))
                  }}
                  onBlur={(event) => setTravelDateError(validateTravelDate(event.target.value))}
                  placeholder="2026-06-06"
                  pattern="\d{4}-\d{2}-\d{2}"
                  aria-describedby="travel-date-helper"
                  aria-invalid={Boolean(travelDateError)}
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: `1px solid ${travelDateError ? '#f87171' : '#475569'}`, background: '#020617', color: 'white', colorScheme: 'dark' }}
                />
                <small id="travel-date-helper" style={{ display: 'block', color: travelDateError ? '#fecaca' : '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>
                  {travelDateHelperText}
                </small>
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
                onChange={(event) => handleMaxLegsChange(event.target.value)}
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
                onChange={(event) => handleCarrierChange(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                {supportedCarrierOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div style={{ border: '1px solid #475569', borderRadius: 14, padding: 12, background: '#020617', marginBottom: 12 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#fde68a', fontWeight: 'bold' }}>
                <input
                  type="checkbox"
                  checked={personalTestingMode}
                  onChange={(event) => setPersonalTestingMode(event.target.checked)}
                  style={{ marginTop: 4 }}
                />
                Personal Testing Mode: request nearest-date matches when server test data mode is enabled
              </label>
              <label style={{ display: 'block', color: '#cbd5e1', marginTop: 10 }}>
                Nearest-date tolerance days
                <input
                  value={nearestDateToleranceDays}
                  onChange={(event) => setNearestDateToleranceDays(event.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid #475569', background: '#0f172a', color: 'white' }}
                />
              </label>
              <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>
                Server must have NONREVY_TEST_DATA_MODE=true for this to take effect. In production-safe mode, nearest-date and demo fallback availability cards are hidden.
              </p>
            </div>
            <p style={{ color: '#94a3b8' }}>
              Supported today: United, Delta, Alaska Group. Alaska Group includes Alaska and Hawaiian. Search uses FlightAware live provider API data first, exact-date stored Supabase flight data second, and Aviationstack fallback third. Demo fallback appears only when server test data mode is enabled.
            </p>
            <button
              type="submit"
              disabled={itineraryLoading}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: itineraryLoading ? '#475569' : '#38bdf8', color: '#020617', fontWeight: 'bold', cursor: itineraryLoading ? 'not-allowed' : 'pointer' }}
            >
              {itineraryLoading ? 'Searching providers…' : 'Update planner results'}
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
          <h2 style={{ fontSize: 30 }}>Itinerary results</h2>
          <p style={{ color: itineraryLoading ? '#facc15' : '#94a3b8' }}>
            {itineraryStatus} · Source: {itinerarySource}
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${itineraryDataMode === 'Live provider API data' ? '#22c55e' : itineraryDataMode.includes('Fallback') || itineraryDataMode.includes('Nearest') || itineraryDataMode.includes('test') || itineraryDataMode.includes('No current') ? '#facc15' : '#334155'}`, borderRadius: 999, padding: '6px 12px', background: '#020617', color: itineraryDataMode === 'Live provider API data' ? '#bbf7d0' : itineraryDataMode.includes('Fallback') || itineraryDataMode.includes('Nearest') || itineraryDataMode.includes('test') || itineraryDataMode.includes('No current') ? '#fef3c7' : '#cbd5e1', marginBottom: 14, fontWeight: 'bold' }}>
            Data mode: {itineraryDataMode}
          </div>
          {itineraryDebug?.dataFreshnessMode === 'nearest-date-testing' ? (
            <div style={{ border: '1px solid #facc15', borderRadius: 14, padding: 14, background: '#1c1917', color: '#fde68a', marginBottom: 14 }}>
              <strong>Nearest-date testing mode is active</strong>
              <p style={{ margin: '6px 0 0' }}>
                These itinerary cards are nearest-date testing data matched to {itineraryDebug.routeMatching?.dateCoverage.effectiveMatchDate || 'a nearest available stored date'} instead of requested date {itineraryDebug.routeMatching?.dateCoverage.requestedSearchDate || 'unknown'}. Do not treat them as live provider API availability.
              </p>
            </div>
          ) : null}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 10, marginTop: 12 }}>
              {[
                ['Parsed origin', itineraryDebug?.parsedOrigin || 'Not parsed'],
                ['Parsed destination', itineraryDebug?.parsedDestination || 'Not parsed'],
                ['Parsed date', itineraryDebug?.parsedDate || 'Flexible'],
                ['Parser confidence', itineraryDebug?.parserConfidence !== undefined ? `${itineraryDebug.parserConfidence}%` : 'Pending'],
                ['Parser fallback', itineraryDebug?.parserFallbackApplied ? 'Active' : 'Not needed'],
                ['Active data mode', itineraryDebug?.activeDataMode === 'test-data' ? 'Test data mode' : itineraryDebug?.activeDataMode === 'production-safe' ? 'Production-safe mode' : 'Pending'],
                ['NONREVY_TEST_DATA_MODE', itineraryDebug?.testDataModeEnabled === undefined ? 'Pending' : itineraryDebug.testDataModeEnabled ? 'true' : 'false or unset'],
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
            {itineraryDebug?.parserExplanation ? (
              <p style={{ color: '#cbd5e1', margin: '12px 0 0' }}>
                <strong style={{ color: '#38bdf8' }}>Parser explanation:</strong> {itineraryDebug.parserExplanation}
              </p>
            ) : null}
            {itineraryDebug ? (
              <div style={{ border: `1px solid ${itineraryDebug.trueLiveDataAvailable ? '#22c55e' : '#facc15'}`, borderRadius: 12, padding: 12, background: '#0f172a', marginTop: 12 }}>
                <strong style={{ color: itineraryDebug.trueLiveDataAvailable ? '#22c55e' : '#facc15' }}>Live provider API status</strong>
                <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>
                  {itineraryDebug.trueLiveDataAvailable
                    ? 'Current provider API data is available for this result set.'
                    : itineraryDebug.trueLiveDataUnavailableReason || 'Current provider API data is unavailable for this result set.'}
                </p>
              </div>
            ) : null}
            {itineraryDebug?.scheduleProviderReadiness?.length ? (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: '#c084fc' }}>Live schedule provider readiness</strong>
                <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>
                  Readiness is diagnostic only. Itinerary search checks FlightAware live provider API data first, then stored Supabase flight data, Aviationstack fallback, and demo fallback.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10, marginTop: 10 }}>
                  {itineraryDebug.scheduleProviderReadiness.map((provider) => {
                    const colors = readinessBadgeStyle(provider.status)
                    return (
                      <article key={provider.key} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: '#0f172a' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                          <strong style={{ color: '#f8fafc' }}>{provider.label}</strong>
                          <span style={{ border: `1px solid ${colors.border}`, borderRadius: 999, padding: '4px 9px', color: colors.text, background: colors.background, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 'bold' }}>
                            {provider.status}
                          </span>
                        </div>
                        <p style={{ color: '#cbd5e1', margin: '8px 0' }}>{provider.detail}</p>
                        <p style={{ color: '#bbf7d0', margin: '6px 0 0' }}><strong>Can:</strong> {provider.whatItCanProvide.join(', ') || 'None yet'}</p>
                        <p style={{ color: '#fecaca', margin: '6px 0 0' }}><strong>Cannot:</strong> {provider.whatItCannotProvide.join(', ') || 'No known gaps'}</p>
                        <p style={{ color: '#fde68a', margin: '6px 0 0' }}><strong>Next:</strong> {provider.recommendedNextAction}</p>
                      </article>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {itineraryDebug?.apiResponseCounts ? (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: '#38bdf8' }}>API response counts</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 10 }}>
                  {[
                    ['FlightAware schedule calls', itineraryDebug.apiResponseCounts.flightAwareScheduleRequests ?? 0],
                    ['FlightAware schedule rows', itineraryDebug.apiResponseCounts.flightAwareScheduleFetched ?? 0],
                    ['FlightAware itineraries', itineraryDebug.apiResponseCounts.flightAwareScheduleItineraries ?? 0],
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
            {itineraryDebug?.routeMatching ? (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: '#38bdf8' }}>Route matching diagnostics</strong>
                <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>
                  Normalized request: {itineraryDebug.routeMatching.requested.origin || 'any'} → {itineraryDebug.routeMatching.requested.destination || 'any'} · {itineraryDebug.routeMatching.requested.date || 'any date'} · {itineraryDebug.routeMatching.requested.carrier || 'all carriers'}
                </p>
                <p style={{ color: itineraryDebug.routeMatching.finalMatchedRows > 0 ? '#bbf7d0' : '#fde68a', margin: '6px 0 0' }}>
                  {itineraryDebug.routeMatching.matchExplanation}
                </p>
                {itineraryDebug.routeMatching.dateCoverage ? (
                  <div style={{ border: `1px solid ${itineraryDebug.routeMatching.dateCoverage.nearestDateApplied ? '#facc15' : '#334155'}`, borderRadius: 12, padding: 12, background: '#0f172a', marginTop: 10 }}>
                    <strong style={{ color: itineraryDebug.routeMatching.dateCoverage.nearestDateApplied ? '#facc15' : '#38bdf8' }}>Flight date coverage</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 10 }}>
                      {[
                        ['Oldest flight date', itineraryDebug.routeMatching.dateCoverage.oldestFlightDate || 'Unavailable'],
                        ['Newest flight date', itineraryDebug.routeMatching.dateCoverage.newestFlightDate || 'Unavailable'],
                        ['Requested search date', itineraryDebug.routeMatching.dateCoverage.requestedSearchDate || 'Flexible'],
                        ['Effective match date', itineraryDebug.routeMatching.dateCoverage.effectiveMatchDate || 'Flexible'],
                        ['Date mode', itineraryDebug.routeMatching.dateCoverage.dateMode],
                        ['Tolerance', itineraryDebug.routeMatching.dateCoverage.nearestDateToleranceDays !== undefined ? `${itineraryDebug.routeMatching.dateCoverage.nearestDateToleranceDays} days` : 'Strict']
                      ].map(([label, value]) => (
                        <article key={label} style={{ border: '1px solid #334155', borderRadius: 10, padding: 10, background: '#020617' }}>
                          <small style={{ color: '#94a3b8' }}>{label}</small>
                          <p style={{ margin: '4px 0 0', color: '#f8fafc', fontWeight: 'bold' }}>{value}</p>
                        </article>
                      ))}
                    </div>
                    {itineraryDebug.routeMatching.dateCoverage.warning ? (
                      <p style={{ color: '#fde68a', margin: '10px 0 0' }}>{itineraryDebug.routeMatching.dateCoverage.warning}</p>
                    ) : null}
                    {itineraryDebug.routeMatching.dateCoverage.closestAvailableDates.length ? (
                      <p style={{ color: '#cbd5e1', margin: '8px 0 0' }}>
                        Closest available dates: {itineraryDebug.routeMatching.dateCoverage.closestAvailableDates.join(', ')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 10 }}>
                  {[
                    ['Origin matches', itineraryDebug.routeMatching.originMatches],
                    ['Destination matches', itineraryDebug.routeMatching.destinationMatches],
                    ['Exact route rows', itineraryDebug.routeMatching.exactRouteMatches],
                    ['Date matches', itineraryDebug.routeMatching.dateMatches],
                    ['Carrier matches', itineraryDebug.routeMatching.carrierMatches],
                    ['Final matched rows', itineraryDebug.routeMatching.finalMatchedRows]
                  ].map(([label, value]) => (
                    <article key={label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                      <small style={{ color: '#94a3b8' }}>{label}</small>
                      <p style={{ margin: '4px 0 0', color: '#f8fafc', fontWeight: 'bold' }}>{value}</p>
                    </article>
                  ))}
                </div>
                {itineraryDebug.routeMatching.closestMatchingRoutes.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <strong style={{ color: '#bbf7d0' }}>Closest matching routes in fetched rows</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10, marginTop: 10 }}>
                      {itineraryDebug.routeMatching.closestMatchingRoutes.map((route) => (
                        <article key={route.route} style={{ border: '1px solid #14532d', borderRadius: 12, padding: 10, background: 'rgba(20, 83, 45, 0.18)' }}>
                          <strong>{route.route}</strong>
                          <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>{route.count} candidate row{route.count === 1 ? '' : 's'} · {route.reason}</p>
                          <small style={{ color: '#94a3b8' }}>Samples: {route.sampleFlightNumbers.join(', ') || 'none'}</small>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
                {itineraryDebug.routeMatching.routeNormalization.normalizedRoutes.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <strong style={{ color: '#38bdf8' }}>Route normalization diagnostics</strong>
                    <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>
                      Missing origin: {itineraryDebug.routeMatching.routeNormalization.missingOriginCount} · Missing destination: {itineraryDebug.routeMatching.routeNormalization.missingDestinationCount} · Missing date: {itineraryDebug.routeMatching.routeNormalization.missingDateCount}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10, marginTop: 10 }}>
                      {itineraryDebug.routeMatching.routeNormalization.normalizedRoutes.map((route) => (
                        <article key={route.route} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                          <strong>{route.route}</strong>
                          <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>{route.count} row{route.count === 1 ? '' : 's'}</p>
                          <small style={{ color: '#94a3b8' }}>Samples: {route.sampleFlightNumbers.join(', ') || 'none'}</small>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
                {itineraryDebug.routeMatching.rejectedCandidates.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <strong style={{ color: '#facc15' }}>First rejected Supabase candidate flights</strong>
                    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                      {itineraryDebug.routeMatching.rejectedCandidates.map((candidate) => (
                        <article key={`${candidate.id}-${candidate.flightNumber}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <strong>{candidate.flightNumber}</strong>
                            <span style={{ color: '#94a3b8' }}>{candidate.normalized.origin || '??'} → {candidate.normalized.destination || '??'} · {candidate.normalized.date || 'no date'}</span>
                          </div>
                          <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>
                            Raw route: {candidate.normalized.originRaw || 'missing'} → {candidate.normalized.destinationRaw || 'missing'} · Raw date: {candidate.normalized.dateRaw || 'missing'} · Carrier text: {candidate.normalized.carrierText || 'missing'}
                          </p>
                          <p style={{ color: '#fecaca', margin: '6px 0 0' }}>Rejected because: {candidate.rejectionReasons.join('; ')}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
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
            {itineraryDebug?.normalizedFlightAwareItinerarySample ? (
              <div style={{ border: '1px solid #7e22ce', borderRadius: 12, padding: 10, background: 'rgba(88, 28, 135, 0.22)', color: '#e9d5ff', marginTop: 12 }}>
                <strong>Temporary FlightAware normalized itinerary sample</strong>
                <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>Safe sample only; no credentials or raw provider payloads are shown.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8, marginTop: 10 }}>
                  {Object.entries(itineraryDebug.normalizedFlightAwareItinerarySample).map(([label, value]) => (
                    <div key={`flightaware-sample-${label}`} style={{ border: '1px solid #581c87', borderRadius: 10, padding: 8, background: '#020617' }}>
                      <small style={{ color: '#c084fc', textTransform: 'uppercase' }}>{label}</small>
                      <p style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{displayField(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {itineraryDebug?.providerStatuses?.length ? (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: '#c084fc' }}>Provider fallback strategy</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 10, marginTop: 10 }}>
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
            {itineraryDebug?.dataFreshnessExplanation?.length ? (
              <details style={{ marginTop: 12 }} open>
                <summary style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}>Data freshness explanation</summary>
                <ul style={{ color: '#cbd5e1', marginBottom: 0, paddingLeft: 20 }}>
                  {itineraryDebug.dataFreshnessExplanation.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </details>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
              {liveItineraries.map((itinerary) => (
                <article key={itinerary.id} style={{ border: '1px solid #334155', borderRadius: 20, padding: 18, background: '#0f172a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>{itinerary.flightNumber}</h3>
                    <span style={{ color: riskColor(itinerary.risk), fontWeight: 'bold' }}>{itinerary.risk}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    <ProviderBadge label={sourceBadgeLabel(itinerary.source, itinerary.sourceProvider)} />
                    <ProviderBadge label={freshnessBadgeLabel(itinerary.dataFreshnessLabel, itineraryDataMode, itinerary.dataFreshnessRule)} />
                    {(itinerary.providerBadges?.length ? itinerary.providerBadges : [itinerary.source.includes('aviationstack') || itinerary.source.includes('flightaware') ? 'Live provider API data' : 'Stored Supabase flight data', ...(itinerary.source.includes('flightaware') ? ['FlightAware enriched'] : [])]).map((badge) => (
                      <ProviderBadge key={`${itinerary.id}-${badge}`} label={badge} />
                    ))}
                    {itinerary.dataFreshnessLabel && !itinerary.providerBadges?.includes(itinerary.dataFreshnessLabel) ? (
                      <ProviderBadge label={itinerary.dataFreshnessLabel} />
                    ) : null}
                    <WeatherRiskBadge weatherRisk={getRouteWeatherRisk(itinerary.route)} />
                  </div>
                  {itinerary.dataFreshnessDetail ? (
                    <p style={{ color: '#fde68a', margin: '8px 0 0' }}>{itinerary.dataFreshnessDetail}</p>
                  ) : null}
                  {itineraryDateWarning(itinerary) ? (
                    <div style={{ border: '1px solid #facc15', borderRadius: 12, padding: 10, background: '#1c1917', color: '#fde68a', marginTop: 10 }}>
                      <strong>Freshness warning</strong>
                      <p style={{ margin: '4px 0 0' }}>{itineraryDateWarning(itinerary)}</p>
                    </div>
                  ) : null}
                  <p style={{ color: '#38bdf8', fontSize: 18, fontWeight: 'bold' }}>{displayField(itinerary.route)}</p>
                  <p style={{ color: '#facc15', fontWeight: 'bold' }}>Provider score: {itinerary.score}/100</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, margin: '12px 0' }}>
                    {[
                      ['Airline/carrier', itinerary.carrier],
                      ['Flight number', itinerary.flightNumber],
                      ['Origin', itinerary.legs[0]?.origin],
                      ['Destination', itinerary.legs[itinerary.legs.length - 1]?.destination],
                      ['Departure time', itinerary.departureTime],
                      ['Arrival time', itinerary.arrivalTime],
                      ['Duration', itinerary.duration],
                      ['Aircraft', itinerary.aircraft],
                      ['Status', itinerary.status],
                      ['Source provider', itinerary.sourceProvider || itinerary.source],
                      ['Source checked', itinerary.sourceCheckedAt]
                    ].map(([label, value]) => (
                      <div key={`${itinerary.id}-${label}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                        <small style={{ color: '#94a3b8' }}>{label}</small>
                        <p style={{ margin: '4px 0 0', color: '#f8fafc', overflowWrap: 'anywhere' }}>{displayField(value)}</p>
                      </div>
                    ))}
                  </div>
                  <p style={{ color: '#94a3b8' }}>
                    Gate: {displayField(itinerary.gate)} · Terminal: {displayField(itinerary.terminal)}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 10, margin: '12px 0' }}>
                    {airportCodesFromRoute(itinerary.route).map((code) => (
                      <MapboxAirportMap key={`${itinerary.id}-${code}`} airportCode={code} title={`${code} airport preview`} compact />
                    ))}
                  </div>
                  <RouteAirportDetails route={itinerary.route} />
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    {itinerary.legs.map((leg, index) => (
                      <div key={`${itinerary.id}-${leg.flightNumber}-${index}`} style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
                        <strong style={{ color: '#f8fafc' }}>Leg {index + 1}: {displayField(leg.flightNumber)}</strong>
                        <p style={{ color: '#38bdf8', margin: '6px 0' }}>{displayField(leg.origin)} → {displayField(leg.destination)}</p>
                        <p style={{ color: '#cbd5e1', margin: 0 }}>
                          {displayField(leg.departureTime)} → {displayField(leg.arrivalTime)} · Duration {displayField(leg.duration)} · Aircraft {displayField(leg.aircraft)} · Status {displayField(leg.status)} · Source {displayField(leg.sourceProvider || leg.source)} · Checked {displayField(leg.sourceCheckedAt)} · Score {leg.score}
                        </p>
                      </div>
                    ))}
                  </div>
                  <OutcomeCapture
                    subjectType="saved-itinerary"
                    subjectId={`live-${itinerary.id}`}
                    title={`Itinerary ${itinerary.flightNumber}`}
                    route={itinerary.route}
                  />
                </article>
              ))}
            </div>
          ) : itineraryDebug?.testDataModeEnabled ? (
            <>
              <h3 style={{ color: '#facc15' }}>Fallback demo itinerary cards</h3>
              <p style={{ color: '#94a3b8' }}>
                No provider flights found for this search. These clearly marked demo fallback cards keep search, scoring, probability, watchlist, and outcome capture testable without live provider API data.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
                {fallbackDemoItineraries.map((itinerary) => (
              <article key={itinerary.id} style={{ border: '1px solid #334155', borderRadius: 20, padding: 18, background: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{itinerary.title}</h3>
                  <span style={{ color: confidenceColor(itinerary.confidence), fontWeight: 'bold' }}>{itinerary.confidence}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <ProviderBadge label="Source: Demo fallback" />
                  <ProviderBadge label="Freshness: Demo fallback data" />
                  <ProviderBadge label="Planning fallback" />
                  <WeatherRiskBadge weatherRisk={getRouteWeatherRisk(itinerary.route)} />
                </div>
                <p style={{ color: '#facc15', fontWeight: 'bold' }}>{itinerary.ranking.label}: {itinerary.ranking.score}/100</p>
                <p style={{ color: '#38bdf8', fontSize: 18, fontWeight: 'bold' }}>{itinerary.route}</p>
                <p style={{ color: '#94a3b8' }}>Window: {itinerary.window}</p>
                <p>{itinerary.notes}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 10, margin: '12px 0' }}>
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
          ) : (
            <div style={{ border: '1px solid #facc15', borderRadius: 18, padding: 18, background: '#1c1917', color: '#fde68a' }}>
              <h3 style={{ marginTop: 0 }}>No current live itinerary data</h3>
              <p style={{ color: '#fef3c7', marginBottom: 0 }}>
                Production-safe mode is active, so nearest-date testing matches and demo fallback itinerary cards are hidden. Try an exact date with available live provider data, or enable NONREVY_TEST_DATA_MODE=true only for personal testing.
              </p>
            </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginTop: 12 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10, marginTop: 12 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12, marginTop: 14 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
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
            {flightResultsLabel} · Last refresh {lastUpdated || 'pending'}
          </p>
          {(visibleFlights).map((flight) => {
            const risk = delayRiskScore(flight)
            return (
              <article key={flight.id} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
                <h3 style={{ marginTop: 0 }}>{flight.flight_number}</h3>
                <p style={{ color: '#38bdf8' }}>{flight.origin} → {flight.destination}</p>
                <p>Aircraft: {flight.aircraft || 'Unknown'} · Status: {flight.status || 'Unknown'} · Score: {flight.score ?? 'Not scored'}</p>
                <p>Delay risk: {risk.label} ({risk.score}/100)</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, marginTop: 12 }}>
                  <MapboxAirportMap airportCode={flight.origin} title={`${flight.origin || 'Origin'} airport map`} compact />
                  <MapboxAirportMap airportCode={flight.destination} title={`${flight.destination || 'Destination'} airport map`} compact />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, marginTop: 12 }}>
                  {richFlightFieldLabels.map((field) => (
                    <div key={field.key} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                      <small style={{ color: '#94a3b8' }}>{field.label}</small>
                      <p style={{ margin: '4px 0 0' }}>{fieldValue(flight, field.key)}</p>
                    </div>
                  ))}
                </div>
                <details style={{ marginTop: 12 }}>
                  <summary style={{ color: '#38bdf8', cursor: 'pointer' }}>Show all DB fields</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 8, marginTop: 10 }}>
                    {allFlightFields(flight).map(([key, value]) => (
                      <div key={key} style={{ border: '1px solid #334155', borderRadius: 10, padding: 8, background: '#020617' }}>
                        <small style={{ color: '#94a3b8' }}>{key}</small>
                        <p style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{value === null || value === undefined || value === '' ? 'Not available yet' : String(value)}</p>
                      </div>
                    ))}
                  </div>
                </details>
                {String(flight.id || '').startsWith('demo-') ? (
                  <p style={{ color: '#facc15', fontWeight: 'bold', marginBottom: 0 }}>Demo fallback row — no live flight-detail page available.</p>
                ) : (
                  <a href={`/flights/${flight.id}`} style={{ color: '#38bdf8' }}>View flight detail</a>
                )}
              </article>
            )
          })}
        </section>


      </section>
    </main>
  )
}

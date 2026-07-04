'use client'

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react'
import { flightMatchesSearch } from '../../lib/flightSearch'
import { delayRiskScore, rankItinerary, scoreNonrevItinerary, type CommunityLoadScoringSignal, type NonrevSuccessScore, type NonrevLoadReportSignal } from '../../lib/intelligence'
import { allFlightFields, fieldValue, passengerFlightCoverageNotes, richFlightFieldLabels } from '../../lib/flightDataScaffold'
import { airportCodesFromRoute, airportMapScaffolds } from '../../lib/airportMapScaffold'
import { buildRouteAirportIntelligence, connectionRiskColor, type RouteAirportIntelligence } from '../../lib/airportIntelligence'
import { generateAiTripPlan, parseTripPlannerPrompt } from '../../lib/aiTripPlanner'
import { carrierScoringProfiles, getCarrierScoringScaffold, normalizeCarrierFamily, supportedCarrierOptions } from '../../lib/carrierScope'
import { historicalRouteStats, type HistoricalRoute } from '../../lib/historicalRoutes'
import { parseItineraryPrompt } from '../../lib/itinerarySearch'
import { communitySignalLabel, type FlightCommunitySummary } from '../../lib/communityIntelligence'
import type { DecisionFactors, DecisionScore, DecisionStatus } from '../../lib/decisionEngine'
import type { EndToEndTripPlan } from '../../lib/endToEndTrip'
import { buildHistoricalReliabilityForItinerary, historicalReliabilityDisplayLabel, type HistoricalReliability } from '../../lib/historicalReliability'
import type { RecoveryAnalysis } from '../../lib/recoveryEngine'
import { commercialAvailabilityLabel, type SellableSeatSignal } from '../../lib/sellableSeatSignal'
import { effectiveLoadReportWeight, loadLoadReports, loadReportSignal, loadReportSummary, type LoadReport } from '../../lib/loadReports'
import { communityLoadFreshness, communityLoadIntelligenceForItinerary, communityLoadSummaryForItinerary, communityRouteAirports, communityContributorTrustBreakdown, loadCommunityContributorReputation, loadCommunityLoads, relativeCommunityLoadTime, saveCommunityLoadReport, saveCommunityLoadRequest, validateCommunityLoadReport, type CommunityLoadFreshness, type CommunityLoadIntelligence, type CommunityLoadReport, type CommunityLoadValidationStatus } from '../../lib/communityLoads'
import { calculatePredictionEngine } from '../../lib/predictionEngine'
import { buildDisruptionIntelligence, routeHealthColor, type DisruptionIntelligence } from '../../lib/disruptionIntelligence'
import { calculateRouteConfidence, confidenceBadgeColor, confidenceTrendColor, confidenceUpdateTriggerLabel, routeConfidenceLabel, type ConfidenceLevel, type ConfidenceTrend, type ConfidenceUpdateTrigger, type ProviderDataStatus, type RouteConfidence } from '../../lib/routeConfidence'
import { calculateSuccessPrediction, type CarrierCoverage, type RecoveryStrength as PredictionRecoveryStrength, type ScheduleDensity, type SuccessPrediction, type SuccessPredictionInput } from '../../lib/successPredictionEngine'
import { calculatePersonalSuccessPrediction, type PersonalSuccessPrediction } from '../../lib/personalSuccessPredictor'
import { buildWeatherIntelligenceForItinerary, getRouteWeatherRisk, weatherRiskColor, weatherRiskDisplayWithIcon, type WeatherIntelligence, type WeatherRisk } from '../../lib/weatherIntelligence'
import { defaultTravelerProfile, loadTravelerProfileFromStorage, travelerProfileAssumptions, type TravelerProfileScaffold } from '../../lib/travelerProfile'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'
import { loadSavedTripWatchlist } from '../../lib/watchlist'
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
import { airportCodesFromDisplayRoute, itineraryDisplayIntegrityFor } from '../../lib/itineraryDisplayIntegrity'
import { ensureRouteFrameworkLabels } from '../../lib/routeFrameworkLabels'
import { freshnessBadgeLabelFor, isCurrentLiveAvailability } from '../../lib/liveAvailabilityGuard'

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
  operatingFlightNumber?: string
  marketingFlightNumbers?: string[]
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
  duplicateCount?: number
}

type SuggestedRecoveryPath = {
  id: string
  label: string
  route?: string
  kind: string
  confidence: 'Conservative'
  note: string
}

type RecoveryIntelligence = {
  recoveryStrength: number
  label: string
  explanation: string
  suggestedRecoveryPaths: SuggestedRecoveryPath[]
}

type HistoricalRouteIntelligence = {
  historicalSuccess: {
    score: number
    confidence: number
    successfulOutcomes: number
    failedOutcomes: number
    sampleSize: number
    recencyScore: number
  }
  loadReportTrust: {
    score: number
    confidence: number
    reportCount: number
    reporterReliabilityScore: number
    priorReportScore: number
    outcomeAgreementScore: number
    recencyScore: number
    singleReportCapApplied: boolean
  }
  compositeRouteScore: {
    score: number
    liveAvailabilityScore: number
    historicalSuccessScore: number
    communityLoadScore: number
    recoveryStrength: number
    sampleSizeScore: number
    confidence: number
  }
}

type LiveItineraryResult = {
  id: string
  route: string
  legs: LiveItineraryLeg[]
  carrier: string
  flightNumber: string
  operatingFlightNumber?: string
  marketingFlightNumbers?: string[]
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
  dataFreshnessRule?: 'exact-requested-date' | 'cached-provider-current' | 'cached-provider-reduced' | 'cached-provider-yellow' | 'cached-provider-historical' | 'nearest-date-testing-match' | 'stored-historical-data' | 'demo-fallback' | 'route-framework'
  dataFreshnessWarning?: string
  requestedDate?: string
  matchedDate?: string
  productionAvailability?: boolean
  duplicateCount?: number
  recoveryStrength?: number
  recoveryExplanation?: string
  suggestedRecoveryPaths?: SuggestedRecoveryPath[]
  historicalSuccessScore?: number
  historicalConfidence?: number
  historicalSampleSize?: number
  communityLoadTrustScore?: number
  compositeRouteScore?: number
  historicalFactors?: Record<string, number | string>
  topRouteRank?: number
  topRouteLabel?: string
  topRouteScore?: number
  topRouteWhy?: string[]
  topRouteRankingFactors?: Record<string, number | string>
  whyThisRoute?: string
  decisionScore?: DecisionScore
  decisionFactors?: DecisionFactors
  decisionStatus?: DecisionStatus
  endToEnd?: EndToEndTripPlan
  recovery?: RecoveryAnalysis
  routeConfidence?: RouteConfidence
  communityIntelligenceSignal?: FlightCommunitySummary
  sellableSeatSignal?: SellableSeatSignal
  historicalReliability?: HistoricalReliability
  weatherIntelligence?: WeatherIntelligence
}

type ProviderStatus = {
  provider: 'supabase' | 'aviationstack' | 'flightaware' | 'planning'
  label: string
  state: 'pending' | 'success' | 'skipped' | 'warning' | 'error'
  detail: string
}

type ScheduleProviderReadinessStatus = 'Configured' | 'Missing' | 'Limited' | 'Placeholder'

type StructuredProviderDiagnostic = {
  id: string
  provider: string
  category: 'freshness' | 'partial-coverage' | 'rate-limit' | 'fallback'
  severity: 'info' | 'warning' | 'error'
  summary: string
  detail: string
  evidenceCount?: number
}

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

type RouteCoverageSuggestion = {
  id: string
  kind: 'hub-positioning' | 'destination-airport-group' | 'hub-to-destination-group'
  label: string
  searchQuery: string
  origin: string
  destination: string
  via?: string
  confidence: 'Conservative'
  basis: string
  lookupStatus: 'not_checked' | 'provider_rows_found' | 'provider_no_rows' | 'provider_warning' | 'skipped_rate_limited'
  providerResultCount: number
  providerDetail?: string
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
  dataFreshnessMode?: 'live-current-api' | 'provider-cache' | 'stored-supabase' | 'nearest-date-testing' | 'demo-fallback' | 'mvp-test-data' | 'no-current-live-data'
  dataFreshnessExplanation?: string[]
  scheduleProviderReadiness?: ScheduleProviderReadiness[]
  providerDiagnostics?: StructuredProviderDiagnostic[]
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
  deduplicationNotes?: string[]
  deduplicatedRowsRemoved?: number
  routeCoverageSuggestions?: RouteCoverageSuggestion[]
  recoveryIntelligence?: RecoveryIntelligence
  historicalIntelligence?: HistoricalRouteIntelligence
  noResultsExplanation?: string[]
  safeErrors: string[]
}

type ItinerarySearchOverrides = {
  carrier?: string
  maxLegs?: string
  homeAirport?: string
  travelWindow?: string
}

type SearchTrustReceiptProps = {
  dataMode: string
  source: string
  status: string
  warnings: string[]
  debug: ItineraryDebugMetadata | null
}

function riskColor(risk: string) {
  if (risk.includes('Low')) return '#22c55e'
  if (risk.includes('Medium')) return '#facc15'
  return '#f87171'
}

function providerBadgeStyle(label: string) {
  if (label.includes('Live provider API data') || label.includes('Freshness: Live') || label.includes('Exact requested date') || label.includes('Freshness: Exact')) return { border: '#22c55e', text: '#bbf7d0', background: 'rgba(34, 197, 94, 0.12)' }
  if (label.includes('Stored Supabase flight data') || label.includes('Stored Supabase data') || label.includes('Stored historical') || label.includes('Freshness: Stored')) return { border: '#38bdf8', text: '#bae6fd', background: 'rgba(56, 189, 248, 0.12)' }
  if (label.includes('Route framework') || label.includes('Live availability unavailable')) return { border: '#facc15', text: '#fef3c7', background: 'rgba(250, 204, 21, 0.12)' }
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
  if (value.includes('route-framework')) return 'Source: Route framework only'
  if (value.includes('mvp') || value.includes('test-data')) return 'Source: MVP test data'
  if (value.includes('demo') || value.includes('planning')) return 'Source: Demo fallback'
  return 'Source: Unknown'
}

function freshnessBadgeLabel(label?: string, dataMode?: string, rule?: LiveItineraryResult['dataFreshnessRule']) {
  return freshnessBadgeLabelFor({ dataFreshnessLabel: label, dataMode, dataFreshnessRule: rule })
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


function isProductionItinerary(itinerary: LiveItineraryResult) {
  return isCurrentLiveAvailability(itinerary)
}

function isFrameworkRoute(itinerary: LiveItineraryResult) {
  return itinerary.dataFreshnessRule === 'route-framework' || itinerary.sourceProvider === 'route-framework' || itinerary.source === 'route-framework'
}

function productionEmptyStateReasons({
  dataMode,
  status,
  debug,
  travelDateError,
  hasRequestedDate
}: {
  dataMode: string
  status: string
  debug: ItineraryDebugMetadata | null
  travelDateError: string
  hasRequestedDate: boolean
}) {
  const reasons = new Set<string>()
  if (travelDateError) reasons.add(travelDateError)
  if (debug?.trueLiveDataUnavailableReason) reasons.add(debug.trueLiveDataUnavailableReason)
  if (dataMode.includes('No current') || status.toLowerCase().includes('no current live data')) reasons.add('Live schedule results were not available for this search.')
  if (hasRequestedDate && (dataMode.includes('No current') || debug?.routeMatching?.dateCoverage?.requestedSearchDate)) reasons.add('The selected date may not have usable live results yet.')
  if (!reasons.size) reasons.add('Live schedule results were not available for this search.')
  return Array.from(reasons)
}

const smallAirportPositioningHubs: Record<string, string[]> = {
  SBP: ['LAX', 'SFO'],
  SBA: ['LAX', 'SFO'],
  RDM: ['PDX', 'SFO'],
  AVL: ['CLT', 'ATL'],
  CHO: ['IAD', 'DCA'],
  FAR: ['MSP', 'ORD']
}

function travelerSearchUrl(query: string) {
  return `/results?q=${encodeURIComponent(query)}`
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
  const color = weatherRiskColor(weatherRisk.level)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${color}`, borderRadius: 999, padding: '4px 9px', color, background: '#020617', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.3 }}>
      Weather: {weatherRisk.displayLabel}
    </span>
  )
}

type ItineraryComparison = {
  id: string
  route: string
  legs?: LiveItineraryLeg[]
  carrier: string
  score: number
  successProbability: number
  riskLevel: string
  connections: number
  totalTravelTime: string
  departureDateTime: string
  arrivalDateTime: string
  aircraftDetails: string
  sourceDetails: string
  flightNumber: string
  marketingFlightNumbers?: string[]
  isLive: boolean
  providerBadges: string[]
  dataFreshnessLabel?: string
  dataFreshnessDetail?: string
  dataFreshnessRule?: LiveItineraryResult['dataFreshnessRule']
  disruption: DisruptionIntelligence
  routeConfidence: RouteConfidence
  successPrediction: SuccessPrediction
  personalSuccessPrediction: PersonalSuccessPrediction
  loadSupport: NonNullable<SuccessPredictionInput['loadData']>
  weatherRisk: WeatherRisk
  airportIntelligence: RouteAirportIntelligence
  communityReports: LoadReport[]
  communityReportSummary: string
  why: string[]
  explanation: ScoringExplanation
  nextGenSuccess: NonrevSuccessScore
  communityIntelligence: CommunityLoadIntelligence | null
  topRouteRank?: number
  topRouteLabel?: string
  topRouteScore?: number
  topRouteWhy?: string[]
  topRouteRankingFactors?: Record<string, number | string>
  whyThisRoute?: string
  endToEnd?: EndToEndTripPlan
  recovery?: RecoveryAnalysis
  communitySignal?: FlightCommunitySummary
  sellableSeatSignal?: SellableSeatSignal
  historicalReliability?: HistoricalReliability
  weatherIntelligence?: WeatherIntelligence
  recoveryStrength?: number
  recoveryExplanation?: string
  suggestedRecoveryPaths?: SuggestedRecoveryPath[]
}

function comparisonWithDisplayRouteIntegrity(comparison: ItineraryComparison): ItineraryComparison {
  const integrity = itineraryDisplayIntegrityFor(comparison)
  if (!integrity.rebuiltFromLegs && integrity.displayConnectionCount === comparison.connections) return comparison

  return {
    ...comparison,
    route: integrity.displayRoute || comparison.route,
    connections: integrity.displayConnectionCount,
    sourceDetails: integrity.warning && !comparison.sourceDetails.includes(integrity.warning)
      ? [comparison.sourceDetails, integrity.warning].filter(Boolean).join(' · ')
      : comparison.sourceDetails
  }
}

type DecisionMetrics = {
  arrivalRank: number
  totalTravelMinutes: number
  stops: number
  connectionBuffers: number[]
  minimumConnectionBufferMinutes: number | null
  overnightRequired: boolean
  airlineChanges: number
  airportChanges: number
  backupOpportunitiesAfterFirstConnection: number
  backupOpportunitiesAfterSecondConnection: number
  recoveryStrength: number
  misconnectRisk: number
}

type DecisionRecommendation = {
  title: string
  reasons: string[]
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

function loadSupportFromReports(reports: LoadReport[]): NonNullable<SuccessPredictionInput['loadData']> {
  if (!reports.length) {
    return {
      status: 'missing',
      detail: 'This is route confidence, not verified seat availability. Request a fresh load to show success probability.'
    }
  }

  const structuredReports = reports
    .filter((report) => typeof report.seatsAvailableEstimate === 'number' && typeof report.standbysClearedEstimate === 'number')
    .sort((a, b) => (b.reportTrustScore * effectiveLoadReportWeight(b)) - (a.reportTrustScore * effectiveLoadReportWeight(a)))
  const bestStructured = structuredReports[0]
  if (!bestStructured) {
    return {
      status: 'weak',
      detail: 'Matching load reports do not include both available-seat and standby-demand counts. Needs Load before showing success probability.'
    }
  }

  const effectiveWeight = effectiveLoadReportWeight(bestStructured)
  const trusted = bestStructured.verified !== false && bestStructured.reportTrustScore >= 70 && bestStructured.confidenceLevel !== 'Low'
  if (effectiveWeight < 0.36) {
    return {
      status: 'stale',
      seatsAvailable: bestStructured.seatsAvailableEstimate ?? undefined,
      standbyCount: bestStructured.standbysClearedEstimate ?? undefined,
      source: loadReportSummary(bestStructured),
      detail: `Matching load report is stale or low-recency (${effectiveWeight}x effective weight). Needs a fresh load before showing success probability.`
    }
  }
  if (!trusted) {
    return {
      status: 'weak',
      seatsAvailable: bestStructured.seatsAvailableEstimate ?? undefined,
      standbyCount: bestStructured.standbysClearedEstimate ?? undefined,
      source: loadReportSummary(bestStructured),
      detail: `Matching load report is not trusted enough for success probability (trust ${bestStructured.reportTrustScore}/100, confidence ${bestStructured.confidenceLevel}). Needs Load.`
    }
  }

  return {
    status: bestStructured.verified ? 'verified' : 'trusted',
    seatsAvailable: bestStructured.seatsAvailableEstimate ?? undefined,
    standbyCount: bestStructured.standbysClearedEstimate ?? undefined,
    source: loadReportSummary(bestStructured),
    detail: loadReportSummary(bestStructured)
  }
}


function compactCommunityLoadAge(createdAt: string) {
  const parsed = Date.parse(createdAt)
  if (!Number.isFinite(parsed)) return 'age unknown'
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function communityLoadCompactRowText(communityIntelligence: CommunityLoadIntelligence | null | undefined) {
  const latest = communityIntelligence?.latestReport
  if (!latest || !(communityIntelligence?.freshness === 'Fresh' || communityIntelligence?.freshness === 'Recent')) return ''
  return `Community Load: ${latest.availableSeats} Open • ${latest.standbyCount} Listed ${communityIntelligence.freshness} ${compactCommunityLoadAge(latest.createdAt)}`
}

function communityLoadImpactSummary(communityIntelligence: CommunityLoadIntelligence | null | undefined) {
  if (!communityIntelligence) return 'No recent community load is available, so high-confidence scoring stays capped by the trust-first engine.'
  const available = communityIntelligence.averageAvailableSeats ?? communityIntelligence.latestReport?.availableSeats ?? null
  const standby = communityIntelligence.averageStandbyCount ?? communityIntelligence.latestReport?.standbyCount ?? null
  if (available === null || standby === null) return 'Community load exists but is missing structured open-seat/listed-passenger counts.'
  const margin = available - standby
  const marginText = margin >= 0 ? `${margin}-seat margin` : `${Math.abs(margin)}-seat shortfall`
  const capText = communityIntelligence.loadScoreCap
    ? ` Score capped because standby demand ${standby > available ? 'exceeds' : 'is close to'} availability.`
    : communityIntelligence.isRecent ? ' Recent load margin is allowed to lift this itinerary above otherwise similar options.' : ' Stale load is down-weighted significantly.'
  return `Load Impact: ${available} open seats; ${standby} listed nonrev passengers; ${communityIntelligence.loadImpact} ${marginText}.${capText}`
}

function loadSupportWithCommunityLoad(
  baseLoadSupport: NonNullable<SuccessPredictionInput['loadData']>,
  communityIntelligence: CommunityLoadIntelligence | null
): NonNullable<SuccessPredictionInput['loadData']> {
  if (!communityIntelligence?.latestReport) return baseLoadSupport
  const available = communityIntelligence.averageAvailableSeats ?? communityIntelligence.latestReport.availableSeats
  const standby = communityIntelligence.averageStandbyCount ?? communityIntelligence.latestReport.standbyCount
  const hasStructuredCounts = typeof available === 'number' && typeof standby === 'number'
  if (!hasStructuredCounts) return baseLoadSupport
  const freshness = communityIntelligence.freshness || 'Stale'
  const isRecent = freshness === 'Fresh' || freshness === 'Recent'
  const status: NonNullable<SuccessPredictionInput['loadData']>['status'] = isRecent
    ? communityIntelligence.communityConfidence === 'High' ? 'verified' : 'trusted'
    : 'stale'
  const detail = `${communityLoadCompactRowText(communityIntelligence) || `Community Load: ${available} Open • ${standby} Listed ${freshness}`} · ${communityLoadImpactSummary(communityIntelligence)}`
  if (!isRecent && (baseLoadSupport.status === 'verified' || baseLoadSupport.status === 'trusted')) return baseLoadSupport
  return {
    status,
    seatsAvailable: available,
    standbyCount: standby,
    source: `Community load · ${freshness} · ${communityIntelligence.reportCount} report${communityIntelligence.reportCount === 1 ? '' : 's'}`,
    detail
  }
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
      `Rank is driven by composite score ${input.score}/100 and displayed load-aware score ${input.successProbability}%, then sorted against the other itinerary recommendations.`,
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
      `Current formula blends route-planning probability, source route score, historical success ${input.historicalSuccess}%, historical score ${input.historicalScore}, community load adjustment ${input.loadAdjustment >= 0 ? '+' : ''}${input.loadAdjustment.toFixed(1)}, outcome calibration, connection penalty, and a conservative load-data gate.`,
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
      `Disruption adjustment: ${input.disruption.successProbabilityImpact} points to planning confidence and ${input.disruption.routeRankingImpact} points to route ranking.`,
      ...input.disruption.explanation
    ],
    confidenceFactors: [
      `Route Confidence Score is ${input.routeConfidence.score}/100 with ${input.routeConfidence.badge} confidence and a ${input.routeConfidence.trend} trend.`,
      `Confidence blend: success ${input.routeConfidence.components.successProbability}, historical ${input.routeConfidence.components.historicalRouteData}, community ${input.routeConfidence.components.communityLoadReports}, traveler profile ${input.routeConfidence.components.travelerProfile}, disruption ${input.routeConfidence.components.disruptionIntelligence}, weather ${input.routeConfidence.components.weatherImpact}.`,
      ...input.routeConfidence.explanation
    ],
    weatherFactors: [
      `Weather risk is ${input.weatherRisk.category} with ${input.weatherRisk.scoreImpact}/40 placeholder impact.`,
      `Weather adjustment: ${input.weatherRisk.successProbabilityImpact} points to planning confidence and ${input.weatherRisk.routeRankingImpact} points to route ranking.`,
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
      'Probability engine baseline: about 34–36% of planning score before the load-data gate.',
      'Historical success and score: about 34% combined before adjustments.',
      'Community load reports: seats/standbys, confidence, contributor trust, and recency are weighted, then capped between -8 and +8 points.',
      'Flight disruption intelligence: delays, cancellations, diversions, and airport alerts can reduce probability and ranking after the base score.',
      'Weather intelligence layer: weather risk can reduce planning confidence and route ranking through live or placeholder provider signals.',
      'Route confidence engine: historical route data, community reports, traveler profile, disruption, weather, and capped planning score are blended into a 0–100 confidence score.',
      'Airport intelligence layer: static terminal, connection, walking, hub-strength, and backup availability data produce a connection risk score.',
      'Connections: -4 points per connection in the recommendation comparison.'
    ]
  }
}

function parseScheduleTime(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function itineraryLoadDateFromSchedule(value: string) {
  const directMatch = value.match(/\d{4}-\d{2}-\d{2}/)
  if (directMatch) return directMatch[0]
  const parsed = parseScheduleTime(value)
  return parsed ? new Date(parsed).toISOString().slice(0, 10) : undefined
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


function carrierCoverageForComparison(carrier: string, providerBadges: string[] = []): CarrierCoverage {
  const normalized = carrier.toLowerCase()
  if (providerBadges.length >= 2 || normalized.includes('united') || normalized.includes('delta') || normalized.includes('alaska')) return 'Strong'
  if (providerBadges.length === 1) return 'Moderate'
  return 'Limited'
}

function scheduleDensityForComparison(connections: number, backupAvailability: string, totalTravelTime: string): ScheduleDensity {
  if ((backupAvailability === 'Excellent' || backupAvailability === 'Good') && connections <= 1) return 'High'
  if (totalTravelTime.includes('Pending') || connections > 2 || backupAvailability === 'Limited') return 'Low'
  return 'Medium'
}

function recoveryStrengthForComparison(backupAvailability: string, disruption: DisruptionIntelligence): PredictionRecoveryStrength {
  if ((backupAvailability === 'Excellent' || backupAvailability === 'Good') && disruption.routeHealth !== 'Red') return 'Strong'
  if (backupAvailability === 'Fair' || disruption.routeHealth === 'Yellow') return 'Moderate'
  return 'Limited'
}

function communityLoadForPersonalPrediction(
  loadSupport: NonNullable<SuccessPredictionInput['loadData']>,
  communityIntelligence: CommunityLoadIntelligence | null
) {
  return {
    seatsAvailable: loadSupport.seatsAvailable,
    standbyCount: loadSupport.standbyCount,
    status: loadSupport.status,
    confidence: communityIntelligence?.communityConfidence,
    reportCount: communityIntelligence?.reportCount,
    freshness: communityIntelligence?.freshness,
    detail: loadSupport.detail || communityIntelligence?.loadImpactExplanation[0]
  }
}

function routeFrequencyForPersonalPrediction(scheduleDensity: ScheduleDensity, backupOptions: number): 'High' | 'Medium' | 'Low' {
  if (scheduleDensity === 'High' || backupOptions >= 4) return 'High'
  if (scheduleDensity === 'Medium' || backupOptions >= 2) return 'Medium'
  return 'Low'
}


function availabilityStrengthScore(value: string) {
  if (value === 'Excellent') return 92
  if (value === 'Good') return 78
  if (value === 'Fair') return 60
  return 38
}

function hubStrengthScore(summary: string) {
  if (summary.includes('Primary Hub')) return 92
  if (summary.includes('Strong Hub')) return 82
  if (summary.includes('Focus City')) return 66
  if (summary.includes('Limited Hub')) return 42
  return 58
}

function remainingDeparturesScoreInput(backupAvailability: string, connections: number) {
  const base = backupAvailability === 'Excellent' ? 7 : backupAvailability === 'Good' ? 5 : backupAvailability === 'Fair' ? 3 : 1
  return Math.max(0, base - Math.max(0, connections - 1))
}

function alternateRoutingOptionsInput(airportIntelligence: RouteAirportIntelligence, comparisonsAvailable = 0) {
  const backupBase = airportIntelligence.backupFlightAvailability === 'Excellent' ? 5 : airportIntelligence.backupFlightAvailability === 'Good' ? 4 : airportIntelligence.backupFlightAvailability === 'Fair' ? 2 : 1
  return Math.max(backupBase, Math.min(6, comparisonsAvailable))
}

function aircraftSeatCountEstimate(aircraftDetails: string) {
  const value = aircraftDetails.toLowerCase()
  if (value.includes('a380')) return 500
  if (value.includes('777-300') || value.includes('777 300') || value.includes('747')) return 360
  if (value.includes('777') || value.includes('a350') || value.includes('787-10')) return 300
  if (value.includes('787') || value.includes('767') || value.includes('a330')) return 240
  if (value.includes('757') || value.includes('a321')) return 190
  if (value.includes('737') || value.includes('a320') || value.includes('a319')) return 165
  if (value.includes('e175') || value.includes('e75') || value.includes('embraer') || value.includes('crj')) return 76
  return null
}

function delayRateFromSignals(disruption: DisruptionIntelligence, weatherRisk: WeatherRisk, connectionRisk: number) {
  return Math.max(4, Math.min(42, 10 + disruption.disruptionImpactScore * 0.34 + weatherRisk.scoreImpact * 0.32 + connectionRisk * 0.08))
}

function cancellationRateFromSignals(disruption: DisruptionIntelligence, weatherRisk: WeatherRisk) {
  const routeHealthPenalty = disruption.routeHealth === 'Red' ? 5 : disruption.routeHealth === 'Yellow' ? 2 : 0
  return Math.max(1, Math.min(18, 2 + routeHealthPenalty + weatherRisk.scoreImpact * 0.12 + disruption.disruptionImpactScore * 0.08))
}

function loadReportsForSuccessScore(routeReports: LoadReport[]): NonrevLoadReportSignal[] {
  return routeReports.map((report) => ({
    availableSeats: report.seatsAvailableEstimate ?? undefined,
    standbyCount: report.standbysClearedEstimate ?? undefined,
    trustScore: report.reportTrustScore,
    sourceTrustScore: report.reportTrustScore,
    contributorId: `${report.carrier}-${report.contributorTrustScore}-${report.confidenceLevel}`,
    createdAt: report.createdAt,
    verified: report.verified,
    confidenceLevel: report.confidenceLevel
  }))
}

function historicalFlightSuccessFromReports(routeReports: LoadReport[], flightNumber: string, fallback: number) {
  const normalizedFlight = flightNumber.replace(/\s+/g, '').toUpperCase()
  const matching = routeReports.filter((report) => report.flightNumber.replace(/\s+/g, '').toUpperCase() === normalizedFlight)
  if (!matching.length) return fallback
  const probabilities = matching.map((report) => {
    const seats = report.seatsAvailableEstimate ?? 0
    const standby = report.standbysClearedEstimate ?? 0
    const margin = seats - standby
    if (report.loadStatus === 'Seats open' || margin >= 6) return 88
    if (report.loadStatus === 'Looks workable' || margin >= 0) return 72
    if (report.loadStatus === 'Tight' || margin >= -3) return 44
    if (report.loadStatus === 'Full') return 18
    return fallback
  })
  return Math.round(probabilities.reduce((total, value) => total + value, 0) / probabilities.length)
}

function buildNextGenSuccessScore(input: {
  route: string
  flightNumber: string
  carrier: string
  score: number
  successProbability: number
  historicalSuccess: number
  routeReports: LoadReport[]
  communityIntelligence?: CommunityLoadScoringSignal | null
  loadSupport: NonNullable<SuccessPredictionInput['loadData']>
  departureDateTime: string
  aircraftDetails: string
  airportIntelligence: RouteAirportIntelligence
  disruption: DisruptionIntelligence
  weatherRisk: WeatherRisk
  connections: number
  comparisonCount?: number
}) {
  return scoreNonrevItinerary({
    route: input.route,
    flightNumber: input.flightNumber,
    carrier: input.carrier,
    baseItineraryScore: input.score,
    baseSuccessProbability: input.successProbability,
    historicalFlightSuccessRate: historicalFlightSuccessFromReports(input.routeReports, input.flightNumber, input.historicalSuccess),
    historicalRouteSuccessRate: input.historicalSuccess,
    airlineRecoveryNetworkStrength: Math.round((availabilityStrengthScore(input.airportIntelligence.backupFlightAvailability) * 0.72) + (100 - input.disruption.disruptionImpactScore) * 0.28),
    remainingDeparturesToday: remainingDeparturesScoreInput(input.airportIntelligence.backupFlightAvailability, input.connections),
    hubStrength: hubStrengthScore(input.airportIntelligence.hubStrengthSummary),
    publicSeatInventory: input.loadSupport.seatsAvailable ?? null,
    standbyCount: input.loadSupport.standbyCount ?? null,
    departureDateTime: input.departureDateTime,
    historicalCancellationRate: cancellationRateFromSignals(input.disruption, input.weatherRisk),
    historicalDelayRate: delayRateFromSignals(input.disruption, input.weatherRisk, input.airportIntelligence.connectionRiskScore),
    aircraftSeatCount: aircraftSeatCountEstimate(input.aircraftDetails),
    alternateRoutingOptions: alternateRoutingOptionsInput(input.airportIntelligence, input.comparisonCount),
    userLoadReports: loadReportsForSuccessScore(input.routeReports),
    communityLoadIntelligence: input.communityIntelligence || null,
    connectionCount: input.connections
  })
}

function buildLiveItineraryComparison(
  itinerary: LiveItineraryResult,
  predictionEngine: ReturnType<typeof calculatePredictionEngine>,
  historicalRoutes: HistoricalRoute[],
  loadReports: LoadReport[],
  communityLoads: CommunityLoadReport[],
  outcomes: TripOutcome[],
  travelerProfile: TravelerProfileScaffold,
  routeIntelligence: Record<string, string>,
  carrierWeights: Record<string, string>,
  recommendationScope: string,
  updateTrigger: ConfidenceUpdateTrigger
): ItineraryComparison {
  const historicalRoute = matchingHistoricalRoute(itinerary.route, historicalRoutes)
  const routeReports = matchingRouteLoadReports(itinerary.route, loadReports)
  const communityIntelligence = communityLoadIntelligenceForItinerary(communityLoads, {
    flightNumber: itinerary.operatingFlightNumber || itinerary.flightNumber,
    route: itinerary.route,
    date: itineraryLoadDateFromSchedule(itinerary.legs[0]?.departureTime || itinerary.departureTime || '')
  })
  const loadSupport = loadSupportWithCommunityLoad(loadSupportFromReports(routeReports), communityIntelligence)
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
  const historicalReliability = itinerary.historicalReliability || buildHistoricalReliabilityForItinerary(itinerary)
  const weatherIntelligence = itinerary.weatherIntelligence || buildWeatherIntelligenceForItinerary(itinerary)
  const weatherRisk = getRouteWeatherRisk(itinerary.route, weatherIntelligence)
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
    weatherIntelligence,
    decisionScore: itinerary.decisionScore,
    decisionFactors: itinerary.decisionFactors,
    decisionStatus: itinerary.decisionStatus,
    recovery: itinerary.recovery,
    sellableSeatSignal: itinerary.sellableSeatSignal,
    communityIntelligence: itinerary.communityIntelligenceSignal,
    historicalReliability,
    providerDataStatus: providerDataStatusForLiveItinerary(itinerary),
    updateTrigger
  })
  const totalTravelTime = totalTravelTimeFromItinerary(itinerary)
  const carrierCoverage = carrierCoverageForComparison(itinerary.carrier, itinerary.providerBadges)
  const scheduleDensity = scheduleDensityForComparison(connections, airportIntelligence.backupFlightAvailability, totalTravelTime)
  const recoveryStrength = recoveryStrengthForComparison(airportIntelligence.backupFlightAvailability, disruption)
  const backupOptionCount = alternateRoutingOptionsInput(airportIntelligence)
  const successPrediction = calculateSuccessPrediction({
    route: itinerary.route,
    baseSuccessProbability: successProbability,
    routeConfidenceScore: routeConfidence.score,
    connectionCount: connections,
    totalTravelTime,
    backupAvailability: airportIntelligence.backupFlightAvailability,
    carrierCoverage,
    scheduleDensity,
    recoveryStrength,
    routeRisk: riskLevel,
    travelerProfile,
    historicalLoadSignal: loadAdjustment,
    loadData: loadSupport
  })
  const personalSuccessPrediction = calculatePersonalSuccessPrediction({
    airline: itinerary.carrier,
    route: itinerary.route,
    passPriority: travelerProfile.passPriority,
    travelerType: travelerProfile.travelerType,
    travelerProfile,
    communityLoad: communityLoadForPersonalPrediction(loadSupport, communityIntelligence),
    historicalRouteBehavior: { successRate: historicalSuccess, score: historicalScore, reportCount: historicalRoute?.reportCount || predictionEngine.sampleSize.historicalRouteReports },
    departureDateTime: itinerary.legs[0]?.departureTime || itinerary.departureTime || 'Pending',
    backupOptionCount,
    recoveryNetworkStrength: recoveryStrength,
    routeFrequency: routeFrequencyForPersonalPrediction(scheduleDensity, backupOptionCount),
    backupAvailability: airportIntelligence.backupFlightAvailability,
    connectionCount: connections,
    routeConfidenceScore: routeConfidence.score
  })
  const nextGenSuccess = buildNextGenSuccessScore({
    route: itinerary.route,
    flightNumber: itinerary.operatingFlightNumber || itinerary.flightNumber,
    carrier: itinerary.carrier,
    score,
    successProbability: successPrediction.probability,
    historicalSuccess,
    routeReports,
    communityIntelligence,
    loadSupport,
    departureDateTime: itinerary.legs[0]?.departureTime || itinerary.departureTime || 'Pending',
    aircraftDetails: itinerary.legs.map((leg) => [leg.flightNumber, leg.aircraft, leg.status].filter(Boolean).join(' · ')).join(' | ') || itinerary.aircraft || 'Pending provider details',
    airportIntelligence,
    disruption,
    weatherRisk,
    connections
  })
  const explanation = buildScoringExplanation({
    route: itinerary.route,
    carrier: itinerary.carrier,
    score,
    successProbability: successPrediction.probability,
    riskLevel: successPrediction.riskLevel,
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
    legs: itinerary.legs,
    carrier: itinerary.carrier,
    score,
    successProbability: successPrediction.probability,
    riskLevel: successPrediction.riskLevel,
    connections,
    totalTravelTime,
    departureDateTime: itinerary.legs[0]?.departureTime || itinerary.departureTime || 'Pending',
    arrivalDateTime: itinerary.legs[itinerary.legs.length - 1]?.arrivalTime || itinerary.arrivalTime || 'Pending',
    aircraftDetails: itinerary.legs.map((leg) => [leg.flightNumber, leg.aircraft, leg.status].filter(Boolean).join(' · ')).join(' | ') || itinerary.aircraft || 'Pending provider details',
    sourceDetails: [itinerary.dataFreshnessDetail || itinerary.dataFreshnessLabel || itinerary.providerBadges?.join(' · ') || itinerary.sourceProvider || itinerary.source || 'Provider data', itinerary.marketingFlightNumbers?.length ? `Codeshares shown in details only: ${itinerary.marketingFlightNumbers.join(', ')}` : ''].filter(Boolean).join(' · '),
    flightNumber: itinerary.operatingFlightNumber || itinerary.flightNumber,
    marketingFlightNumbers: itinerary.marketingFlightNumbers,
    isLive: itinerary.productionAvailability !== false,
    providerBadges: itinerary.providerBadges?.length ? itinerary.providerBadges : [itinerary.source.includes('aviationstack') || itinerary.source.includes('flightaware') ? 'Live provider API data' : 'Stored Supabase flight data', ...(itinerary.source.includes('flightaware') ? ['FlightAware enriched'] : [])],
    dataFreshnessLabel: itinerary.dataFreshnessLabel,
    dataFreshnessDetail: itinerary.dataFreshnessDetail,
    dataFreshnessRule: itinerary.dataFreshnessRule,
    disruption,
    routeConfidence,
    successPrediction,
    personalSuccessPrediction,
    loadSupport,
    weatherRisk,
    weatherIntelligence,
    airportIntelligence,
    communityReports: routeReports,
    communityReportSummary: communityIntelligence ? `${communityLoadCompactRowText(communityIntelligence) || `Community intelligence: ${communityIntelligence.averageAvailableSeats ?? '—'} open, ${communityIntelligence.averageStandbyCount ?? '—'} listed, ${communityIntelligence.reportCount} reports, ${communityIntelligence.communityConfidence} confidence.`} ${communityLoadImpactSummary(communityIntelligence)}` : reportTrustAndRecencySummary(routeReports),
    communityIntelligence,
    topRouteRank: itinerary.topRouteRank,
    topRouteLabel: itinerary.topRouteLabel,
    topRouteScore: itinerary.topRouteScore,
    topRouteWhy: itinerary.topRouteWhy,
    topRouteRankingFactors: itinerary.topRouteRankingFactors,
    whyThisRoute: itinerary.whyThisRoute,
    endToEnd: itinerary.endToEnd,
    recovery: itinerary.recovery,
    communitySignal: itinerary.communityIntelligenceSignal,
    sellableSeatSignal: itinerary.sellableSeatSignal,
    historicalReliability,
    recoveryStrength: itinerary.recoveryStrength,
    recoveryExplanation: itinerary.recoveryExplanation,
    suggestedRecoveryPaths: itinerary.suggestedRecoveryPaths,
    why: [
      `Blends provider itinerary score ${itinerary.score}/100 with probability engine baseline ${predictionEngine.successProbability}%.`,
      `Route confidence engine scores this option ${routeConfidence.score}/100 (${routeConfidence.badge}) with a ${routeConfidence.trend} trend.`,
      `Weather: ${weatherRisk.displayLabel}. Advisory weather intelligence adjusts planning confidence by ${weatherRisk.successProbabilityImpact} point${weatherRisk.successProbabilityImpact === 1 || weatherRisk.successProbabilityImpact === -1 ? '' : 's'} without overstating certainty.`,
      `Airport intelligence gives this route a ${airportIntelligence.connectionRiskScore}/100 connection risk score and ${airportIntelligence.backupFlightAvailability} backup flight availability.`,
      `Disruption intelligence adjusts this option by ${disruption.successProbabilityImpact} probability points and ${disruption.routeRankingImpact} ranking points; route health is ${disruption.routeHealth}.`,
      historicalRoute
        ? `Historical route match ${historicalRoute.route} contributes ${historicalRoute.successRate}% success and ${historicalRoute.reportCount} reports.`
        : `Carrier historical scaffold contributes ${predictionEngine.inputSummary.historicalSuccessRate}% average success.` ,
      routeReports.length
        ? `${routeReports.length} legacy structured load report${routeReports.length === 1 ? '' : 's'} add a ${loadAdjustment >= 0 ? '+' : ''}${loadAdjustment.toFixed(1)} trust/recency-weighted load signal.`
        : communityIntelligence ? communityLoadImpactSummary(communityIntelligence) : 'No matching recent community load reports yet, so the comparison cannot show high confidence from loads alone.',
      routeOutcomes.length
        ? `${routeOutcomes.length} saved outcome${routeOutcomes.length === 1 ? '' : 's'} calibrate this route at ${outcomeRate}% success.`
        : 'No saved outcomes for this exact route yet; traveler profile and historical signals carry more weight.',
      connections === 0 ? 'Nonstop option avoids connection risk.' : `${connections} connection${connections === 1 ? '' : 's'} adds a controlled recovery-risk penalty.`
    ],
    explanation,
    nextGenSuccess
  }
}

function providerDataStatusForLiveItinerary(itinerary: LiveItineraryResult): ProviderDataStatus {
  const providerText = [itinerary.sourceProvider, itinerary.source, itinerary.dataFreshnessWarning, itinerary.dataFreshnessDetail].filter(Boolean).join(' ').toLowerCase()
  if (providerText.includes('rate limit') || providerText.includes('rate-limited')) return 'rate-limited'
  if (itinerary.dataFreshnessRule === 'route-framework' || itinerary.dataFreshnessRule === 'demo-fallback') return 'missing'
  if (itinerary.dataFreshnessRule === 'cached-provider-historical' || itinerary.dataFreshnessRule === 'stored-historical-data') return 'missing'
  if (itinerary.sourceProvider || itinerary.sourceCheckedAt || itinerary.dataFreshnessRule === 'exact-requested-date') return 'available'
  return 'unknown'
}

function buildFallbackItineraryComparison(
  itinerary: FallbackItineraryResult,
  predictionEngine: ReturnType<typeof calculatePredictionEngine>,
  historicalRoutes: HistoricalRoute[],
  loadReports: LoadReport[],
  communityLoads: CommunityLoadReport[],
  outcomes: TripOutcome[],
  carrierLabel: string,
  travelerProfile: TravelerProfileScaffold,
  routeIntelligence: Record<string, string>,
  carrierWeights: Record<string, string>,
  updateTrigger: ConfidenceUpdateTrigger
): ItineraryComparison {
  const historicalRoute = matchingHistoricalRoute(itinerary.route, historicalRoutes)
  const routeReports = matchingRouteLoadReports(itinerary.route, loadReports)
  const communityIntelligence = communityLoadIntelligenceForItinerary(communityLoads, {
    flightNumber: itinerary.title,
    route: itinerary.route,
    date: itineraryLoadDateFromSchedule(itinerary.window || '')
  })
  const loadSupport = loadSupportWithCommunityLoad(loadSupportFromReports(routeReports), communityIntelligence)
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
  const historicalReliability = buildHistoricalReliabilityForItinerary({ route: itinerary.route, carrier: carrierLabel, flightNumber: 'Unknown', dataFreshnessRule: 'route-framework' })
  const weatherIntelligence = buildWeatherIntelligenceForItinerary({ route: itinerary.route, dataFreshnessRule: 'route-framework' })
  const weatherRisk = getRouteWeatherRisk(itinerary.route, weatherIntelligence)
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
    weatherIntelligence,
    historicalReliability,
    providerDataStatus: 'missing',
    updateTrigger
  })
  const totalTravelTime = fallbackTravelTimeEstimate(itinerary)
  const carrierCoverage = carrierCoverageForComparison(carrierLabel, ['Planning fallback'])
  const scheduleDensity = scheduleDensityForComparison(connections, airportIntelligence.backupFlightAvailability, totalTravelTime)
  const recoveryStrength = recoveryStrengthForComparison(airportIntelligence.backupFlightAvailability, disruption)
  const backupOptionCount = alternateRoutingOptionsInput(airportIntelligence)
  const successPrediction = calculateSuccessPrediction({
    route: itinerary.route,
    baseSuccessProbability: successProbability,
    routeConfidenceScore: routeConfidence.score,
    connectionCount: connections,
    totalTravelTime,
    backupAvailability: airportIntelligence.backupFlightAvailability,
    carrierCoverage,
    scheduleDensity,
    recoveryStrength,
    routeRisk: riskLevel,
    travelerProfile,
    historicalLoadSignal: loadAdjustment,
    loadData: loadSupport
  })
  const personalSuccessPrediction = calculatePersonalSuccessPrediction({
    airline: carrierLabel,
    route: itinerary.route,
    passPriority: travelerProfile.passPriority,
    travelerType: travelerProfile.travelerType,
    travelerProfile,
    communityLoad: communityLoadForPersonalPrediction(loadSupport, communityIntelligence),
    historicalRouteBehavior: { successRate: historicalSuccess, score: historicalScore, reportCount: historicalRoute?.reportCount || predictionEngine.sampleSize.historicalRouteReports },
    departureDateTime: itinerary.window || 'Flexible',
    backupOptionCount,
    recoveryNetworkStrength: recoveryStrength,
    routeFrequency: routeFrequencyForPersonalPrediction(scheduleDensity, backupOptionCount),
    backupAvailability: airportIntelligence.backupFlightAvailability,
    connectionCount: connections,
    routeConfidenceScore: routeConfidence.score
  })
  const nextGenSuccess = buildNextGenSuccessScore({
    route: itinerary.route,
    flightNumber: itinerary.title,
    carrier: carrierLabel,
    score,
    successProbability: successPrediction.probability,
    historicalSuccess,
    routeReports,
    communityIntelligence,
    loadSupport,
    departureDateTime: itinerary.window || 'Flexible',
    aircraftDetails: itinerary.segments.join(' | '),
    airportIntelligence,
    disruption,
    weatherRisk,
    connections
  })
  const explanation = buildScoringExplanation({
    route: itinerary.route,
    carrier: carrierLabel,
    score,
    successProbability: successPrediction.probability,
    riskLevel: successPrediction.riskLevel,
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
    successProbability: successPrediction.probability,
    riskLevel: successPrediction.riskLevel,
    connections,
    totalTravelTime,
    departureDateTime: itinerary.window || 'Flexible',
    arrivalDateTime: itinerary.window || 'Flexible',
    aircraftDetails: itinerary.segments.join(' | '),
    sourceDetails: 'Planning fallback scaffold · verify with airline/provider data before travel',
    flightNumber: itinerary.title,
    isLive: false,
    providerBadges: ['Planning fallback'],
    disruption,
    routeConfidence,
    successPrediction,
    personalSuccessPrediction,
    loadSupport,
    weatherRisk,
    weatherIntelligence,
    airportIntelligence,
    communityReports: routeReports,
    communityReportSummary: communityIntelligence ? `${communityLoadCompactRowText(communityIntelligence) || `Community intelligence: ${communityIntelligence.averageAvailableSeats ?? '—'} open, ${communityIntelligence.averageStandbyCount ?? '—'} listed, ${communityIntelligence.reportCount} reports, ${communityIntelligence.communityConfidence} confidence.`} ${communityLoadImpactSummary(communityIntelligence)}` : reportTrustAndRecencySummary(routeReports),
    communityIntelligence,
    why: [
      `Combines fallback ranking ${itinerary.ranking.score}/100 with probability engine baseline ${predictionEngine.successProbability}%.`,
      `Route confidence engine scores this option ${routeConfidence.score}/100 (${routeConfidence.badge}) with a ${routeConfidence.trend} trend.`,
      `Weather: ${weatherRisk.displayLabel}. Advisory weather intelligence adjusts planning confidence by ${weatherRisk.successProbabilityImpact} point${weatherRisk.successProbabilityImpact === 1 || weatherRisk.successProbabilityImpact === -1 ? '' : 's'} without overstating certainty.`,
      `Airport intelligence gives this route a ${airportIntelligence.connectionRiskScore}/100 connection risk score and ${airportIntelligence.backupFlightAvailability} backup flight availability.`,
      `Disruption intelligence adjusts this option by ${disruption.successProbabilityImpact} probability points and ${disruption.routeRankingImpact} ranking points; route health is ${disruption.routeHealth}.`,
      historicalRoute
        ? `Historical route match ${historicalRoute.route} contributes ${historicalRoute.successRate}% success and ${historicalRoute.reportCount} reports.`
        : `Historical carrier scaffold contributes ${predictionEngine.inputSummary.historicalSuccessRate}% average success.`,
      routeReports.length
        ? `${routeReports.length} legacy structured load report${routeReports.length === 1 ? '' : 's'} add a ${loadAdjustment >= 0 ? '+' : ''}${loadAdjustment.toFixed(1)} trust/recency-weighted load signal.`
        : communityIntelligence ? communityLoadImpactSummary(communityIntelligence) : 'No matching recent community load reports yet; use this as planning guidance only.',
      routeOutcomes.length
        ? `${routeOutcomes.length} saved outcome${routeOutcomes.length === 1 ? '' : 's'} calibrate this route at ${outcomeRate}% success.`
        : 'No saved route outcomes yet; traveler profile and route intelligence remain the main signals.',
      connections === 0 ? 'Nonstop shape keeps connection risk low.' : `${connections} connection${connections === 1 ? '' : 's'} creates backup flexibility but adds transfer risk.`
    ],
    explanation,
    nextGenSuccess,
    historicalReliability
  }
}


function successScoreColor(value: number, isLoadSupported = false) {
  if (isLoadSupported && value >= 72) return '#22c55e'
  if (value >= 55) return '#facc15'
  return '#f87171'
}

function loadAwareScorePhrase(comparison: ItineraryComparison) {
  if (comparison.successPrediction.scoreLabel === 'Needs Load') return 'Needs Load before success probability'
  return `${comparison.successPrediction.displayValue} ${comparison.successPrediction.scoreLabel.toLowerCase()}`
}

function compactAircraftLabel(comparison: ItineraryComparison) {
  const firstDetail = comparison.aircraftDetails.split('|')[0]?.trim() || ''
  const parts = firstDetail.split('·').map((part) => part.trim()).filter(Boolean)
  const aircraft = parts.find((part) => !part.match(/^[A-Z]{1,3}\s?\d+/i) && !part.toLowerCase().includes('status') && !part.toLowerCase().includes('scheduled')) || parts[1] || firstDetail
  if (!aircraft || aircraft.toLowerCase().includes('pending')) return 'Aircraft pending'
  return aircraft
    .replace(/Boeing\s+/i, '')
    .replace(/Airbus\s+/i, '')
    .replace(/Embraer\s+/i, 'E')
    .replace(/Dreamliner/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const AIRLINE_NAME_BY_CODE: Record<string, string> = {
  UA: 'United Airlines',
  NH: 'ANA',
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  AS: 'Alaska Airlines',
  HA: 'Hawaiian Airlines',
  WN: 'Southwest Airlines',
  B6: 'JetBlue',
  F9: 'Frontier Airlines',
  NK: 'Spirit Airlines',
  AC: 'Air Canada',
  BA: 'British Airways',
  AF: 'Air France',
  KL: 'KLM Royal Dutch Airlines',
  LH: 'Lufthansa',
  JL: 'Japan Airlines',
  QX: 'Horizon Air',
  KE: 'Korean Air',
  QF: 'Qantas',
  OO: 'SkyWest Airlines'
}

function airlineNameForCarrier(carrier: string, carrierCode: string) {
  const normalizedCarrier = carrier.replace(/\s+/g, ' ').trim()
  const normalizedCode = carrierCode.trim().toUpperCase()
  const mappedName = AIRLINE_NAME_BY_CODE[normalizedCode]

  if (mappedName) return mappedName

  if (normalizedCarrier && !/unknown carrier/i.test(normalizedCarrier) && !new RegExp(`^${normalizedCode}$`, 'i').test(normalizedCarrier)) {
    const carrierWithoutCode = normalizedCarrier.replace(new RegExp(`^${normalizedCode}\\s*[-–—:]?\\s*`, 'i'), '').trim()
    if (carrierWithoutCode && !/^[A-Z0-9]{2,3}$/i.test(carrierWithoutCode)) return carrierWithoutCode
    if (!/^[A-Z0-9]{2,3}$/i.test(normalizedCarrier)) return normalizedCarrier
  }

  return 'Unknown carrier'
}

function compactCarrierCode(carrier: string, flightNumber = '') {
  const normalizedFlight = flightNumber.replace(/\s+/g, '').toUpperCase()
  const flightCode = normalizedFlight.match(/^([A-Z]{1,2}|[A-Z]\d|\d[A-Z])\d{1,4}$/)?.[1]
  const words = carrier.trim().split(/\s+/).filter(Boolean)
  const knownCode = words.find((word) => /^[A-Z0-9]{2,3}$/.test(word) && !/^UNKNOWN$/i.test(word))
  if (knownCode) return knownCode.slice(0, 3).toUpperCase()
  if (flightCode) return flightCode.slice(0, 3).toUpperCase()
  if (!words.length || /unknown carrier/i.test(carrier)) return 'AIR'
  return words.map((word) => word[0]).join('').slice(0, 3).toUpperCase()
}


function compactFlightNumberLabel(flightNumber: string, carrierCode: string) {
  const normalized = flightNumber.replace(/\s+/g, '').toUpperCase()
  const carrier = carrierCode.toUpperCase()
  if (normalized.startsWith(carrier)) return normalized.slice(carrier.length) || normalized
  return normalized
}

function isMissingLiveLegDetail(value?: string | number | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return !normalized || ['not provided', 'unknown', '—'].includes(normalized) || normalized.includes('pending') || normalized.includes('unavailable') || normalized.includes('framework')
}

function itineraryCardLegDisplays(comparison: ItineraryComparison) {
  const routeAirports = airportCodesFromComparisonRoute(comparison.route)
  const sourceLegs = comparison.legs?.length
    ? comparison.legs
    : routeAirports.slice(0, -1).map((origin, index) => ({
      origin,
      destination: routeAirports[index + 1] || '',
      carrier: '',
      flightNumber: '',
      departureTime: '',
      arrivalTime: ''
    } as LiveItineraryLeg))

  return sourceLegs.map((leg, index) => {
    const route = `${leg.origin || '—'} → ${leg.destination || '—'}`
    const flight = leg.operatingFlightNumber || leg.flightNumber
    const lacksLiveDetails = comparison.dataFreshnessRule === 'route-framework' || [leg.carrier, flight, leg.departureTime, leg.arrivalTime].some(isMissingLiveLegDetail)

    if (lacksLiveDetails) {
      return {
        key: `${comparison.id}-leg-${index}-${route}`,
        route,
        detail: 'Live details unavailable.'
      }
    }

    const departure = compactFlightBoardDateTime(leg.departureTime, leg.origin)
    const arrival = compactFlightBoardDateTime(leg.arrivalTime, leg.destination, leg.departureTime).replace(/ \+\d+$/, '')

    return {
      key: `${comparison.id}-leg-${index}-${route}-${flight}`,
      route,
      detail: `${leg.carrier} ${flight} · ${departure} → ${arrival}`
    }
  })
}

function formatConnectionBuffer(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours && mins) return `${hours}h ${mins}m`
  if (hours) return `${hours}h`
  return `${mins}m`
}

function normalizeDecisionCarrierCode(carrier: string, flightNumber = '') {
  return compactCarrierCode(carrier, flightNumber).replace(/[^A-Z0-9]/g, '').toUpperCase() || carrier.trim().toUpperCase()
}

function itineraryConnectionBuffersMinutes(comparison: ItineraryComparison) {
  const legs = comparison.legs || []
  return legs.slice(0, -1).map((leg, index) => {
    const arrival = parseScheduleTime(leg.arrivalTime)
    const nextDeparture = parseScheduleTime(legs[index + 1]?.departureTime || '')
    if (!arrival || !nextDeparture || nextDeparture <= arrival) return null
    return Math.round((nextDeparture - arrival) / 60000)
  }).filter((value): value is number => value !== null)
}

function itineraryAirlineChanges(comparison: ItineraryComparison) {
  const legs = comparison.legs || []
  if (legs.length < 2) return 0
  return legs.slice(0, -1).filter((leg, index) => {
    const currentCarrier = normalizeDecisionCarrierCode(leg.carrier, leg.operatingFlightNumber || leg.flightNumber)
    const nextLeg = legs[index + 1]
    const nextCarrier = normalizeDecisionCarrierCode(nextLeg.carrier, nextLeg.operatingFlightNumber || nextLeg.flightNumber)
    return currentCarrier !== nextCarrier
  }).length
}

function itineraryAirportChanges(comparison: ItineraryComparison) {
  const legs = comparison.legs || []
  if (legs.length < 2) return 0
  return legs.slice(0, -1).filter((leg, index) => leg.destination !== legs[index + 1]?.origin).length
}

function backupOpportunitiesAfterConnection(comparison: ItineraryComparison, comparisons: ItineraryComparison[], connectionIndex: number) {
  const legs = comparison.legs || []
  const missedLeg = legs[connectionIndex + 1]
  const connectionAirport = legs[connectionIndex]?.destination
  const missedDeparture = parseScheduleTime(missedLeg?.departureTime || '')
  if (!connectionAirport || !missedDeparture) return 0

  const alternatives = new Set<string>()
  comparisons.forEach((candidate) => {
    ;(candidate.legs || []).forEach((leg) => {
      const departure = parseScheduleTime(leg.departureTime)
      if (leg.origin !== connectionAirport || !departure || departure <= missedDeparture) return
      alternatives.add(`${leg.origin}-${leg.destination}-${leg.operatingFlightNumber || leg.flightNumber}-${leg.departureTime}`)
    })
  })
  return alternatives.size
}

function decisionArrivalRanks(comparisons: ItineraryComparison[]) {
  const arrivals = [...new Set(comparisons
    .map((item) => itineraryArrivalSortValue(item))
    .filter((value) => Number.isFinite(value)))]
    .sort((a, b) => a - b)
  return arrivals
}

function decisionMetricsForItinerary(comparison: ItineraryComparison, comparisons: ItineraryComparison[]): DecisionMetrics {
  const connectionBuffers = itineraryConnectionBuffersMinutes(comparison)
  const minimumConnectionBufferMinutes = connectionBuffers.length ? Math.min(...connectionBuffers) : null
  const totalTravelMinutes = routeDurationMinutes(comparison.totalTravelTime)
  const arrivalValue = itineraryArrivalSortValue(comparison)
  const arrivals = decisionArrivalRanks(comparisons)
  const arrivalRank = Number.isFinite(arrivalValue) ? Math.max(1, arrivals.findIndex((value) => value === arrivalValue) + 1) : comparisons.length
  const airportChanges = itineraryAirportChanges(comparison)
  const airlineChanges = itineraryAirlineChanges(comparison)
  const backupOpportunitiesAfterFirstConnection = backupOpportunitiesAfterConnection(comparison, comparisons, 0)
  const backupOpportunitiesAfterSecondConnection = backupOpportunitiesAfterConnection(comparison, comparisons, 1)
  const backupCount = backupOpportunitiesAfterFirstConnection + backupOpportunitiesAfterSecondConnection
  const suggestedRecoveryCount = comparison.suggestedRecoveryPaths?.length || 0
  const baseBackupStrength = backupAvailabilityScore(comparison)
  const bufferStrength = minimumConnectionBufferMinutes === null ? 12 : minimumConnectionBufferMinutes >= 90 ? 20 : minimumConnectionBufferMinutes >= 60 ? 12 : -12
  const recoveryStrength = Math.round(Math.max(0, Math.min(100, baseBackupStrength + backupCount * 10 + suggestedRecoveryCount * 8 + bufferStrength - comparison.connections * 5 - airportChanges * 10)))
  const bufferRisk = minimumConnectionBufferMinutes === null ? 0 : minimumConnectionBufferMinutes < 45 ? 35 : minimumConnectionBufferMinutes < 60 ? 22 : minimumConnectionBufferMinutes < 90 ? 10 : 0
  const misconnectRisk = Math.round(Math.max(0, Math.min(100, comparison.airportIntelligence.connectionRiskScore + bufferRisk + airlineChanges * 5 + airportChanges * 15 + Math.max(0, comparison.connections - 1) * 8)))

  return {
    arrivalRank,
    totalTravelMinutes,
    stops: comparison.connections,
    connectionBuffers,
    minimumConnectionBufferMinutes,
    overnightRequired: flightBoardDayOffset(comparison.arrivalDateTime, comparison.departureDateTime) > 0,
    airlineChanges,
    airportChanges,
    backupOpportunitiesAfterFirstConnection,
    backupOpportunitiesAfterSecondConnection,
    recoveryStrength,
    misconnectRisk
  }
}

function compareByDecisionEngine(a: ItineraryComparison, b: ItineraryComparison, comparisons: ItineraryComparison[]) {
  const left = decisionMetricsForItinerary(a, comparisons)
  const right = decisionMetricsForItinerary(b, comparisons)
  return itineraryArrivalSortValue(a) - itineraryArrivalSortValue(b) ||
    left.stops - right.stops ||
    right.recoveryStrength - left.recoveryStrength ||
    left.misconnectRisk - right.misconnectRisk ||
    left.totalTravelMinutes - right.totalTravelMinutes ||
    itineraryDepartureSortValue(a) - itineraryDepartureSortValue(b) ||
    a.route.localeCompare(b.route)
}

function bestConnectionAirportLabel(comparison: ItineraryComparison, metrics: DecisionMetrics) {
  const legs = comparison.legs || []
  const firstConnection = legs[0]?.destination
  const secondConnection = legs[1]?.destination
  if (metrics.backupOpportunitiesAfterFirstConnection > 0 && firstConnection) return firstConnection
  if (metrics.backupOpportunitiesAfterSecondConnection > 0 && secondConnection) return secondConnection
  return airportCodesFromComparisonRoute(comparison.route).slice(1, -1)[0]
}

function decisionRecommendationForItinerary(comparison: ItineraryComparison, comparisons: ItineraryComparison[]): DecisionRecommendation {
  const metrics = decisionMetricsForItinerary(comparison, comparisons)
  const allMetrics = comparisons.map((item) => ({ item, metrics: decisionMetricsForItinerary(item, comparisons) }))
  const bestRecovery = Math.max(...allMetrics.map((entry) => entry.metrics.recoveryStrength))
  const lowestMisconnectRisk = Math.min(...allMetrics.map((entry) => entry.metrics.misconnectRisk))
  const shortestTravel = Math.min(...allMetrics.map((entry) => entry.metrics.totalTravelMinutes).filter(Number.isFinite))
  const backupCount = metrics.backupOpportunitiesAfterFirstConnection + metrics.backupOpportunitiesAfterSecondConnection
  const isTopDecision = sortCompactItineraries(comparisons)[0]?.id === comparison.id

  const title = isTopDecision ? 'Best overall choice'
    : metrics.arrivalRank === 1 ? 'Earliest arrival'
      : metrics.recoveryStrength === bestRecovery && backupCount > 0 ? 'Strong backup options'
        : metrics.misconnectRisk === lowestMisconnectRisk && metrics.stops > 0 ? 'Safest connection'
          : metrics.totalTravelMinutes === shortestTravel ? 'Shortest travel day'
            : backupCount > 0 ? 'Best if standby loads change'
              : metrics.stops === 0 ? 'Simplest routing'
                : 'Solid backup choice'

  const reasons: string[] = []
  if (metrics.arrivalRank === 1) reasons.push('Arrives earliest')
  else if (metrics.arrivalRank <= 3) reasons.push(`Arrival rank ${metrics.arrivalRank}`)
  if (backupCount > 0) {
    const airport = bestConnectionAirportLabel(comparison, metrics)
    reasons.push(airport ? `Backup options through ${airport}` : 'Backup options available')
  } else if (metrics.stops === 0) reasons.push('No connection risk')
  if (metrics.minimumConnectionBufferMinutes !== null) {
    reasons.push(metrics.minimumConnectionBufferMinutes >= 90
      ? 'Comfortable connection'
      : metrics.minimumConnectionBufferMinutes >= 60
        ? 'Usable connection buffer'
        : 'Tight connection')
  }
  if (metrics.airlineChanges === 0 && metrics.stops > 0) reasons.push('No airline change')
  if (metrics.airportChanges > 0) reasons.push('Requires airport change')
  if (metrics.overnightRequired) reasons.push('Overnight required')
  if (metrics.totalTravelMinutes === shortestTravel) reasons.push('Shortest travel day')

  return { title, reasons: [...new Set(reasons)].slice(0, 3) }
}

function routeExplanationReasons(comparison: ItineraryComparison, comparisons: ItineraryComparison[]) {
  return decisionRecommendationForItinerary(comparison, comparisons).reasons
}

function routeRecommendationTitle(comparison: ItineraryComparison, comparisons: ItineraryComparison[]) {
  return decisionRecommendationForItinerary(comparison, comparisons).title
}

function legacyRouteExplanationReasons(comparison: ItineraryComparison, comparisons: ItineraryComparison[]) {
  const reasons: string[] = []
  const arrivals = comparisons
    .map((item) => ({ item, time: parseScheduleTime(item.arrivalDateTime) }))
    .filter((entry): entry is { item: ItineraryComparison; time: number } => entry.time !== null)
  const durations = comparisons
    .map((item) => ({ item, minutes: routeDurationMinutes(item.totalTravelTime) }))
    .filter((entry) => Number.isFinite(entry.minutes))
  const connectionBuffers = comparisons
    .map((item) => ({ item, buffer: Math.min(...itineraryConnectionBuffersMinutes(item)) }))
    .filter((entry) => Number.isFinite(entry.buffer))

  const arrival = parseScheduleTime(comparison.arrivalDateTime)
  const durationMinutes = routeDurationMinutes(comparison.totalTravelTime)
  const minStops = Math.min(...comparisons.map((item) => item.connections))
  const bestArrival = arrivals.length ? Math.min(...arrivals.map((entry) => entry.time)) : null
  const bestDuration = durations.length ? Math.min(...durations.map((entry) => entry.minutes)) : null
  const bestBuffer = connectionBuffers.length ? Math.max(...connectionBuffers.map((entry) => entry.buffer)) : null
  const comparisonBuffer = itineraryConnectionBuffersMinutes(comparison).length ? Math.min(...itineraryConnectionBuffersMinutes(comparison)) : null
  const lowestMisconnectRisk = Math.min(...comparisons.map((item) => item.airportIntelligence.connectionRiskScore))
  const bestBackupScore = Math.max(...comparisons.map(backupAvailabilityScore))
  const backupAvailability = comparison.airportIntelligence.backupFlightAvailability

  if (arrival !== null && bestArrival !== null && arrival === bestArrival) reasons.push('Earliest arrival in current results')
  if (Number.isFinite(durationMinutes) && bestDuration !== null && durationMinutes === bestDuration) reasons.push('Shortest total travel time')
  if (comparison.connections === minStops) reasons.push(comparison.connections === 0 ? 'Nonstop route with no connection risk' : 'Fewest stops in current results')
  if (comparisonBuffer !== null && bestBuffer !== null && comparisonBuffer === bestBuffer) reasons.push(`Longest connection buffer (${formatConnectionBuffer(comparisonBuffer)})`)
  if (comparison.airportIntelligence.connectionRiskScore === lowestMisconnectRisk && comparison.connections > 0) reasons.push('Lower misconnect risk than other connection options')
  if ((backupAvailability === 'Excellent' || backupAvailability === 'Good') && backupAvailabilityScore(comparison) === bestBackupScore) reasons.push(`${backupAvailability} backup flight availability`)
  if ((comparison.suggestedRecoveryPaths?.length || 0) > 1) reasons.push(`${comparison.suggestedRecoveryPaths?.length} recovery path options available`)

  return [...new Set(reasons)].slice(0, 4)
}

function compactDurationLabel(value: string) {
  return value.replace(/\s+/g, '').replace(/hours?/gi, 'h').replace(/minutes?/gi, 'm')
}

function compactStopsLabel(connectionCount: number) {
  if (connectionCount <= 0) return 'Direct'
  return `${connectionCount} stop${connectionCount === 1 ? '' : 's'}`
}


function compactRankingLabel(index: number, comparison?: ItineraryComparison) {
  const label = comparison?.nextGenSuccess.label || (index === 0 ? 'Best Choice' : index === 1 ? 'Strong Option' : index === 2 ? 'Backup Option' : 'Last Chance')
  return `#${index + 1} ${label}`
}

function compactReasonText(reason: string) {
  return reason
    .replace(/^why:\s*/i, '')
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactItineraryReasons(comparison: ItineraryComparison) {
  const reasons = [
    ...comparison.nextGenSuccess.topPositiveFactors.map((factor) => factor.detail),
    `Risk: ${comparison.nextGenSuccess.topRiskFactor.detail}`,
    ...comparison.why,
    ...comparison.successPrediction.reasoning,
    ...comparison.explanation.whyRankedHere
  ]
    .map(compactReasonText)
    .filter(Boolean)

  if (comparison.connections === 0) reasons.unshift('Nonstop')
  if (comparison.connections > 0) reasons.unshift(compactStopsLabel(comparison.connections))
  if (comparison.loadSupport.status === 'verified' || comparison.loadSupport.status === 'trusted') reasons.unshift('Load data available')
  if (!comparison.successPrediction.needsLoad && comparison.successPrediction.confidenceLevel !== 'Low') reasons.unshift(`${comparison.successPrediction.confidenceLevel} confidence`)

  return reasons.filter((reason, index, all) => all.findIndex((item) => item.toLowerCase() === reason.toLowerCase()) === index).slice(0, 3)
}

function flightBoardDayOffset(arrivalValue: string, departureValue: string) {
  const localArrival = arrivalValue.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  const localDeparture = departureValue.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (localArrival && localDeparture) {
    const arrivalDay = Date.UTC(Number(localArrival[1]), Number(localArrival[2]) - 1, Number(localArrival[3]))
    const departureDay = Date.UTC(Number(localDeparture[1]), Number(localDeparture[2]) - 1, Number(localDeparture[3]))
    return Math.max(0, Math.round((arrivalDay - departureDay) / 86400000))
  }
  const arrival = parseScheduleTime(arrivalValue)
  const departure = parseScheduleTime(departureValue)
  if (!arrival || !departure) return 0
  const arrivalDate = new Date(arrival)
  const departureDate = new Date(departure)
  return Math.max(0, Math.round((Date.UTC(arrivalDate.getUTCFullYear(), arrivalDate.getUTCMonth(), arrivalDate.getUTCDate()) - Date.UTC(departureDate.getUTCFullYear(), departureDate.getUTCMonth(), departureDate.getUTCDate())) / 86400000))
}

function compactScoreLabel(comparison: ItineraryComparison) {
  return `${comparison.nextGenSuccess.score}/100`
}

function compactScoreIcon(comparison: ItineraryComparison) {
  const color = successScoreColor(comparison.nextGenSuccess.score, comparison.successPrediction.isLoadSupported)
  if (color === '#22c55e') return '🟢'
  if (color === '#f87171') return '🔴'
  return '🟡'
}

function trafficLightScoreColor(value: number) {
  if (value >= 80) return '#22c55e'
  if (value >= 60) return '#facc15'
  return '#f87171'
}

function trafficLightScoreLabel(value: number) {
  if (value >= 80) return 'Green'
  if (value >= 60) return 'Yellow'
  return 'Red'
}

function compactConfidenceIndicator(comparison: ItineraryComparison) {
  if (comparison.successPrediction.confidenceLevel === 'High') return '🟢 High'
  if (comparison.successPrediction.confidenceLevel === 'Medium') return '🟡 Medium'
  return '🔴 Low'
}

function rowLoadIntelligenceLabel(comparison: ItineraryComparison) {
  const seats = comparison.loadSupport.seatsAvailable
  const standby = comparison.loadSupport.standbyCount
  const hasTrustedLoad = comparison.loadSupport.status === 'verified' || comparison.loadSupport.status === 'trusted'
  if (hasTrustedLoad && typeof seats === 'number' && typeof standby === 'number') {
    return `${seats} Open • ${standby} Standby`
  }
  if (comparison.loadSupport.status === 'weak' || comparison.loadSupport.status === 'stale') return 'Awaiting Load'
  return 'Load Pending'
}

function compactConfidenceFactors(comparison: ItineraryComparison) {
  const factors = [
    ...comparison.successPrediction.confidenceReasoning,
    ...comparison.successPrediction.reasoning
  ]
    .map(compactReasonText)
    .map((reason) => reason
      .replace('Available-seat margin is comfortably above standby demand', 'Seats exceed standbys')
      .replace('Available-seat margin is usable but should still be monitored', 'Seats exceed standbys')
      .replace('Nonstop route avoids connection risk', 'Nonstop routing')
      .replace('Multiple backup departures', 'Strong recovery options')
    )
    .filter(Boolean)

  return factors.filter((factor, index, all) => all.findIndex((item) => item.toLowerCase() === factor.toLowerCase()) === index).slice(0, 5)
}

function formatItineraryDateTime(value: string) {
  const parsed = parseScheduleTime(value)
  if (!parsed) return displayField(value)
  return new Date(parsed).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}


const airportTimeZones: Record<string, string> = {
  LAX: 'America/Los_Angeles',
  HND: 'Asia/Tokyo',
  NRT: 'Asia/Tokyo',
  HNL: 'Pacific/Honolulu',
  OGG: 'Pacific/Honolulu',
  SFO: 'America/Los_Angeles',
  SEA: 'America/Los_Angeles',
  JFK: 'America/New_York',
  EWR: 'America/New_York',
  LGA: 'America/New_York',
  ORD: 'America/Chicago',
  DEN: 'America/Denver',
  IAH: 'America/Chicago',
  ATL: 'America/New_York',
  SBP: 'America/Los_Angeles'
}

function airportCodesFromComparisonRoute(route: string) {
  return airportCodesFromDisplayRoute(route)
}

function formatItineraryAirportDateTime(value: string, airportCode?: string) {
  const timeZone = airportCode ? airportTimeZones[airportCode] : undefined
  const localIsoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/)
  if (localIsoMatch) {
    const [, year, month, day, hour, minute] = localIsoMatch
    const localDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
    const zoneName = timeZone
      ? new Intl.DateTimeFormat([], { timeZone, timeZoneName: 'short' }).formatToParts(localDate).find((part) => part.type === 'timeZoneName')?.value
      : undefined
    return `${localDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${zoneName ? ` ${zoneName}` : ''}`
  }
  const parsed = parseScheduleTime(value)
  if (!parsed) return displayField(value)
  return new Date(parsed).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short'
  })
}

function compactFlightBoardDateTime(value: string, airportCode?: string, referenceValue?: string) {
  const timeZone = airportCode ? airportTimeZones[airportCode] : undefined
  const parsed = parseScheduleTime(value)
  const referenceParsed = referenceValue ? parseScheduleTime(referenceValue) : null
  const localIsoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/)
  const referenceIsoMatch = referenceValue?.match(/^(\d{4})-(\d{2})-(\d{2})T/)

  if (localIsoMatch) {
    const [, year, month, day, hour, minute] = localIsoMatch
    const localDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
    const referenceDate = referenceIsoMatch ? new Date(Number(referenceIsoMatch[1]), Number(referenceIsoMatch[2]) - 1, Number(referenceIsoMatch[3])) : null
    const dayOffset = referenceDate ? Math.round((new Date(Number(year), Number(month) - 1, Number(day)).getTime() - referenceDate.getTime()) / 86400000) : 0
    const time = localDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').replace('AM', 'a').replace('PM', 'p')
    const date = localDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
    return `${date} ${time}${dayOffset > 0 ? ` +${dayOffset}` : ''}`
  }

  if (!parsed) return displayField(value)
  const date = new Date(parsed)
  const referenceDate = referenceParsed ? new Date(referenceParsed) : null
  const day = date.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone })
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone }).replace(/\s/g, '').replace('AM', 'a').replace('PM', 'p')
  const dayOffset = referenceDate ? Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())) / 86400000) : 0
  return `${day} ${time}${dayOffset > 0 ? ` +${dayOffset}` : ''}`
}

function compactFlightBoardTime(value: string, airportCode?: string) {
  const timeZone = airportCode ? airportTimeZones[airportCode] : undefined
  const localIsoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/)
  if (localIsoMatch) {
    const [, year, month, day, hour, minute] = localIsoMatch
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
      .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const parsed = parseScheduleTime(value)
  if (!parsed) return displayField(value)
  return new Date(parsed).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone })
}

function itineraryDepartureSortValue(comparison: ItineraryComparison) {
  return parseScheduleTime(comparison.departureDateTime) ?? Number.MAX_SAFE_INTEGER
}

function itineraryArrivalSortValue(comparison: ItineraryComparison) {
  return parseScheduleTime(comparison.arrivalDateTime) ?? Number.MAX_SAFE_INTEGER
}

function topRouteRankSortValue(comparison: ItineraryComparison) {
  return comparison.topRouteRank || Number.MAX_SAFE_INTEGER
}

function sortMoreRouteItineraries(comparisons: ItineraryComparison[]) {
  return [...comparisons].sort((a, b) => compareByDecisionEngine(a, b, comparisons))
}

function sortCompactItineraries(comparisons: ItineraryComparison[]) {
  return [...comparisons].sort((a, b) => compareByDecisionEngine(a, b, comparisons))
}

function compactLegLabel(connections: number) {
  if (connections === 0) return 'Direct'
  if (connections === 1) return '1 stop'
  return `${connections} stops`
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
    `${backup.route} is the current backup because it ranks next after ${comparison.route} with score ${backup.score}/100 and ${loadAwareScorePhrase(backup)}.`,
    scoreGap >= 0
      ? `Primary route leads by ${scoreGap} point${scoreGap === 1 ? '' : 's'}, so the backup should be monitored if loads tighten or delays appear.`
      : `Backup currently scores higher on one signal, but this card remains ordered by the blended recommendation sort.`,
    backup.connections > comparison.connections
      ? `Backup adds connection complexity (${backup.connections} vs ${comparison.connections}), trading probability recovery for transfer risk.`
      : `Backup has equal or lower connection complexity, making it a practical same-day recovery candidate.`
  ]
}

function conservativeItineraryDecision(comparison: ItineraryComparison) {
  if (comparison.disruption.routeHealth === 'Red' || comparison.personalSuccessPrediction.probability < 50) return 'Back up first'
  if (comparison.personalSuccessPrediction.confidence === 'Low' || comparison.successPrediction.needsLoad || comparison.loadSupport.status === 'missing') return 'Watch closely'
  if (comparison.personalSuccessPrediction.probability >= 75 && comparison.disruption.routeHealth === 'Green') return 'Primary candidate'
  return 'Usable with backup'
}

function conservativeItineraryGuardrails(comparison: ItineraryComparison) {
  const guardrails: string[] = []
  if (comparison.loadSupport.status === 'missing') guardrails.push('No verified load yet; keep the estimate capped and recheck before travel.')
  if (comparison.personalSuccessPrediction.confidence === 'Low') guardrails.push('Confidence is low, so treat this as planning guidance instead of a go/no-go call.')
  if (comparison.disruption.routeHealth !== 'Green') guardrails.push(`${comparison.disruption.routeHealth} route health means a backup should be ready before committing.`)
  if (comparison.connections > 0) guardrails.push(`${compactStopsLabel(comparison.connections)} adds connection recovery risk.`)
  if (comparison.weatherRisk.category !== 'Low') guardrails.push(`${comparison.weatherRisk.category} weather risk can change standby outcomes quickly.`)
  if (!guardrails.length) guardrails.push('Signals are usable, but nonrev success still depends on final loads and same-day operations.')
  return guardrails.slice(0, 4)
}

function ItineraryIntelligenceDetailPanel({ comparison, backup }: { comparison: ItineraryComparison; backup?: ItineraryComparison }) {
  const decision = conservativeItineraryDecision(comparison)
  const guardrails = conservativeItineraryGuardrails(comparison)
  const backupLine = backup
    ? `${backup.carrier} · ${backup.route} · ${backup.personalSuccessPrediction.probability}% personal estimate · ${compactStopsLabel(backup.connections)}`
    : 'No same-search backup is available; broaden carrier scope or routing before relying on this option.'
  const loadLine = rowLoadIntelligenceLabel(comparison)
  const intelligenceCards = [
    ['Decision', decision, decision === 'Primary candidate' ? '#22c55e' : decision === 'Back up first' ? '#f87171' : '#facc15'],
    ['Estimated success', `${comparison.personalSuccessPrediction.probability}% · ${comparison.personalSuccessPrediction.confidence}`, comparisonMetricColor(comparison.personalSuccessPrediction.probability)],
    ['Load signal', loadLine, comparison.loadSupport.status === 'verified' || comparison.loadSupport.status === 'trusted' ? '#22c55e' : '#facc15'],
    ['Recovery', `${comparison.airportIntelligence.backupFlightAvailability} · ${compactStopsLabel(comparison.connections)}`, comparison.airportIntelligence.backupFlightAvailability === 'Excellent' || comparison.airportIntelligence.backupFlightAvailability === 'Good' ? '#38bdf8' : '#facc15']
  ] as const

  return (
    <details className="nonrevy-itinerary-intel-panel">
      <summary>
        <span>Itinerary intelligence</span>
        <span>{decision}</span>
      </summary>
      <div className="nonrevy-itinerary-intel-panel__body">
        <div className="nonrevy-itinerary-intel-panel__cards" aria-label="Itinerary intelligence summary">
          {intelligenceCards.map(([label, value, color]) => (
            <article key={`${comparison.id}-${label}`}>
              <small>{label}</small>
              <strong style={{ color }}>{value}</strong>
            </article>
          ))}
        </div>

        <section>
          <strong>Why</strong>
          <ul>
            {comparison.personalSuccessPrediction.why.map((reason) => <li key={`${comparison.id}-intel-why-${reason}`}>{reason}</li>)}
          </ul>
        </section>

        <section>
          <strong>Conservative guardrails</strong>
          <ul>
            {guardrails.map((guardrail) => <li key={`${comparison.id}-intel-guardrail-${guardrail}`}>{guardrail}</li>)}
          </ul>
        </section>

        <section>
          <strong>Backup read</strong>
          <p>{backupLine}</p>
        </section>

        <details className="nonrevy-itinerary-intel-panel__subdetails">
          <summary>Signal details</summary>
          <div className="nonrevy-itinerary-intel-panel__signals">
            <p><strong>Route confidence:</strong> {comparison.routeConfidence.score}/100 · {comparison.routeConfidence.badge} · {comparison.routeConfidence.trend}</p>
            <p><strong>Disruption:</strong> {comparison.disruption.routeHealth} · impact {comparison.disruption.disruptionImpactScore}/99</p>
            <p><strong>Weather:</strong> {comparison.weatherRisk.category} · {comparison.weatherRisk.details[0]}</p>
            <p><strong>Data:</strong> {comparison.dataFreshnessLabel || 'Provider freshness pending'} · {comparison.sourceDetails}</p>
            <p><strong>Inputs used:</strong> {comparison.personalSuccessPrediction.inputsUsed.join(' · ')}</p>
          </div>
        </details>
      </div>
    </details>
  )
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
    <details className="nonrevy-premium-details" style={{ marginTop: 14, border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
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

      <details style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
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

      <details style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
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

      <details style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
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

      <details style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
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

type RouteIntelligenceBadge = 'Recommended' | 'Lowest Risk' | 'Best Premium Cabin' | 'Most Backup Options' | 'Fastest'

type RouteIntelligenceInsight = {
  key: string
  badge: RouteIntelligenceBadge
  title: string
  route: string
  comparisonId: string
  summary: string
  color: string
}

const premiumCabinAirportHints = new Set(['HND', 'NRT', 'LHR', 'CDG', 'FRA', 'MUC', 'AMS', 'ZRH', 'BRU', 'MAD', 'BCN', 'FCO', 'MXP', 'DUB', 'SNN', 'GRU', 'EZE', 'SCL', 'SYD', 'MEL', 'AKL', 'ICN', 'PVG', 'PEK', 'SIN', 'HKG'])
const backupAvailabilityWeights: Record<string, number> = { excellent: 5, strong: 4, good: 3, moderate: 2, limited: 1, low: 1, pending: 0, unknown: 0 }

function routeIntelligenceColor(badge: RouteIntelligenceBadge) {
  if (badge === 'Recommended') return '#22c55e'
  if (badge === 'Lowest Risk') return '#67e8f9'
  if (badge === 'Best Premium Cabin') return '#c084fc'
  if (badge === 'Most Backup Options') return '#facc15'
  return '#fb7185'
}

function routeIntelligenceBadgeStyle(badge: RouteIntelligenceBadge) {
  const color = routeIntelligenceColor(badge)
  return { color, border: color, background: `${color}22` }
}

function routeDurationMinutes(value: string) {
  const text = value.toLowerCase()
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/)
  const minuteMatch = text.match(/(\d+)\s*m/)
  if (hourMatch || minuteMatch) {
    return Math.round((hourMatch ? Number(hourMatch[1]) * 60 : 0) + (minuteMatch ? Number(minuteMatch[1]) : 0))
  }
  const compact = text.match(/^(\d{1,2}):(\d{2})$/)
  if (compact) return Number(compact[1]) * 60 + Number(compact[2])
  return Number.POSITIVE_INFINITY
}

function backupAvailabilityScore(comparison: ItineraryComparison) {
  const text = comparison.airportIntelligence.backupFlightAvailability.toLowerCase()
  const matched = Object.entries(backupAvailabilityWeights).find(([label]) => text.includes(label))
  const base = matched ? matched[1] : 1
  const connectionPenalty = Math.max(0, comparison.connections - 1)
  return base * 20 + comparison.successProbability / 5 - connectionPenalty * 4
}

function premiumCabinScore(comparison: ItineraryComparison) {
  const airports = comparison.airportIntelligence.airports.map((airport) => airport.code)
  const longHaulHint = airports.some((code) => premiumCabinAirportHints.has(code))
  const carrierText = comparison.carrier.toLowerCase()
  const routeText = comparison.route.toLowerCase()
  const polarisHint = carrierText.includes('united') || routeText.includes('ua') || comparison.flightNumber.toLowerCase().includes('ua')
  return (longHaulHint ? 45 : 0) + (polarisHint ? 28 : 0) + comparison.score / 5 + comparison.routeConfidence.score / 5 - comparison.connections * 4
}

function routeRiskRank(comparison: ItineraryComparison) {
  return comparison.successProbability + comparison.routeConfidence.score - comparison.airportIntelligence.connectionRiskScore - comparison.weatherRisk.scoreImpact - comparison.disruption.disruptionImpactScore / 2 - comparison.connections * 6
}

function bestAirportForBackupRouting(comparison: ItineraryComparison) {
  const airport = [...comparison.airportIntelligence.airports]
    .sort((a, b) => a.connectionRiskScore - b.connectionRiskScore)[0]
  return airport ? airport.code : comparison.route
}

function buildRouteIntelligenceInsights(comparisons: ItineraryComparison[]): RouteIntelligenceInsight[] {
  if (!comparisons.length) return []

  const recommended = comparisons[0]
  const lowestRisk = [...comparisons].sort((a, b) => routeRiskRank(b) - routeRiskRank(a))[0]
  const fastest = [...comparisons].sort((a, b) => routeDurationMinutes(a.totalTravelTime) - routeDurationMinutes(b.totalTravelTime) || b.score - a.score)[0]
  const mostBackup = [...comparisons].sort((a, b) => backupAvailabilityScore(b) - backupAvailabilityScore(a))[0]
  const bestPremium = [...comparisons].sort((a, b) => premiumCabinScore(b) - premiumCabinScore(a))[0]
  const bestRecovery = [...comparisons].sort((a, b) => backupAvailabilityScore(b) + b.successProbability - b.connections * 5 - (backupAvailabilityScore(a) + a.successProbability - a.connections * 5))[0]
  const overnightFallback = [...comparisons].sort((a, b) => backupAvailabilityScore(b) + b.airportIntelligence.connectionRiskScore / 4 - (backupAvailabilityScore(a) + a.airportIntelligence.connectionRiskScore / 4))[0]

  return ([
    {
      key: 'recommended',
      badge: 'Recommended',
      title: 'Start here',
      route: recommended.route,
      comparisonId: recommended.id,
      summary: `${recommended.route} has the strongest overall blend of score, confidence, and traveler-friendly risk.`,
      color: routeIntelligenceColor('Recommended')
    },
    {
      key: 'lowest-risk',
      badge: 'Lowest Risk',
      title: 'Lowest risk option',
      route: lowestRisk.route,
      comparisonId: lowestRisk.id,
      summary: `${lowestRisk.route} keeps the risk profile cleanest with ${loadAwareScorePhrase(lowestRisk)} and ${lowestRisk.connections === 0 ? 'no connections' : `${lowestRisk.connections} connection${lowestRisk.connections === 1 ? '' : 's'}`}.`,
      color: routeIntelligenceColor('Lowest Risk')
    },
    {
      key: 'premium-cabin',
      badge: 'Best Premium Cabin',
      title: premiumCabinScore(bestPremium) >= 70 ? 'Best Polaris opportunity' : 'Best premium cabin opportunity',
      route: bestPremium.route,
      comparisonId: bestPremium.id,
      summary: `${bestPremium.route} is the best cabin-upside play based on carrier, long-haul airport signals, and route score.`,
      color: routeIntelligenceColor('Best Premium Cabin')
    },
    {
      key: 'backup-options',
      badge: 'Most Backup Options',
      title: 'Most backup flights available',
      route: mostBackup.route,
      comparisonId: mostBackup.id,
      summary: `${mostBackup.route} gives you the best recovery cushion. Backup routing looks strongest through ${bestAirportForBackupRouting(mostBackup)}.`,
      color: routeIntelligenceColor('Most Backup Options')
    },
    {
      key: 'fastest',
      badge: 'Fastest',
      title: 'Fastest arrival',
      route: fastest.route,
      comparisonId: fastest.id,
      summary: `${fastest.route} is the quickest listed option at ${fastest.totalTravelTime || 'the shortest available travel time'}.`,
      color: routeIntelligenceColor('Fastest')
    },
    {
      key: 'same-day-recovery',
      badge: 'Most Backup Options',
      title: 'Best same-day recovery options',
      route: bestRecovery.route,
      comparisonId: bestRecovery.id,
      summary: `${bestRecovery.route} has the best same-day recovery mix of backup availability, confidence, and connection simplicity.`,
      color: routeIntelligenceColor('Most Backup Options')
    },
    {
      key: 'overnight-fallback',
      badge: 'Lowest Risk',
      title: 'Best overnight fallback',
      route: overnightFallback.route,
      comparisonId: overnightFallback.id,
      summary: `${overnightFallback.route} is the safest place to keep as an overnight fallback if the day tightens up.`,
      color: routeIntelligenceColor('Lowest Risk')
    }
  ] satisfies RouteIntelligenceInsight[]).slice(0, 7)
}

function routeIntelligenceBadgesFor(comparison: ItineraryComparison, insights: RouteIntelligenceInsight[]) {
  return insights
    .filter((insight) => insight.comparisonId === comparison.id)
    .map((insight) => insight.badge)
    .filter((badge, index, badges) => badges.indexOf(badge) === index)
}

function RouteIntelligenceSection({ insights }: { insights: RouteIntelligenceInsight[] }) {
  if (!insights.length) return null

  const primary = insights[0]
  return (
    <section className="nonrevy-route-intel" style={{ border: '1px solid #7dd3fc', borderRadius: 22, padding: 'clamp(14px, 3vw, 18px)', background: 'linear-gradient(135deg, rgba(14, 116, 144, 0.22), rgba(49, 46, 129, 0.34), rgba(15, 23, 42, 0.96))', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#67e8f9', textTransform: 'uppercase', letterSpacing: 1 }}>Route Intelligence</strong>
          <h3 style={{ fontSize: 26, margin: '8px 0' }}>Strategy picks for this search</h3>
          <p style={{ color: '#cbd5e1', margin: 0 }}>Simple traveler-focused recommendations from the current itinerary scores, confidence, airport backup data, and route risk signals.</p>
        </div>
        <span style={{ border: `1px solid ${primary.color}`, borderRadius: 999, color: primary.color, padding: '8px 12px', fontWeight: 'bold' }}>
          {primary.badge}: {primary.route}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginTop: 14 }}>
        {insights.map((insight) => {
          const badgeStyle = routeIntelligenceBadgeStyle(insight.badge)
          return (
            <article key={insight.key} className="nonrevy-intel-card" style={{ border: `1px solid ${insight.color}`, borderRadius: 16, padding: 14, background: 'rgba(2, 6, 23, 0.72)' }}>
              <span style={{ display: 'inline-flex', border: `1px solid ${badgeStyle.border}`, borderRadius: 999, padding: '4px 9px', color: badgeStyle.color, background: badgeStyle.background, fontSize: 12, fontWeight: 'bold' }}>
                {insight.badge}
              </span>
              <h4 style={{ color: '#f8fafc', margin: '10px 0 6px', fontSize: 18 }}>{insight.title}</h4>
              <p style={{ color: '#38bdf8', margin: '0 0 8px', fontWeight: 'bold' }}>{insight.route}</p>
              <p style={{ color: '#cbd5e1', margin: 0 }}>{insight.summary}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

type RecoveryStrength = 'Strong Recovery' | 'Moderate Recovery' | 'Limited Recovery'

type RecoveryPlanStep = {
  label: 'Primary Plan' | 'Backup Plan A' | 'Backup Plan B'
  route: string
  summary: string
}

type RecoveryStrategy = {
  score: number
  badge: RecoveryStrength
  alternativeDepartures: number
  alternativeGateways: number
  sameDayRecoveryPossible: boolean
  elevatedRisk: boolean
  plans: RecoveryPlanStep[]
}

function recoveryBadgeColor(badge: RecoveryStrength) {
  if (badge === 'Strong Recovery') return '#22c55e'
  if (badge === 'Moderate Recovery') return '#facc15'
  return '#f87171'
}

function recoveryBadgeFor(score: number): RecoveryStrength {
  if (score >= 72) return 'Strong Recovery'
  if (score >= 45) return 'Moderate Recovery'
  return 'Limited Recovery'
}

function routeEndpoints(route: string) {
  const airports = airportCodesFromRoute(route)
  return {
    airports,
    origin: airports[0] || '',
    destination: airports[airports.length - 1] || ''
  }
}

function routeGateways(route: string) {
  const { airports } = routeEndpoints(route)
  return airports.length > 2 ? airports.slice(1, -1) : []
}

function ItineraryRouteMap({ route, compact = false }: { route: string; compact?: boolean }) {
  const airports = airportCodesFromRoute(route)
  if (!airports.length) return null

  return (
    <div className={`nonrevy-route-map ${compact ? 'nonrevy-route-map--compact' : ''}`} aria-label={`Route map for ${route}`}>
      <div className="nonrevy-route-map__line" aria-hidden="true" />
      {airports.map((airport, index) => (
        <div key={`${route}-${airport}-${index}`} className="nonrevy-route-map__stop">
          <span className={`nonrevy-route-map__dot ${index === 0 || index === airports.length - 1 ? 'nonrevy-route-map__dot--terminal' : ''}`} />
          <strong>{airport}</strong>
          <small>{index === 0 ? 'Origin' : index === airports.length - 1 ? 'Arrive' : 'Connect'}</small>
        </div>
      ))}
    </div>
  )
}

function SuccessScoreDial({ score, label = 'Success' }: { score: number; label?: string }) {
  const safeScore = clampScore(score)
  return (
    <div className="nonrevy-score-dial" style={{ '--score': `${safeScore * 3.6}deg` } as CSSProperties} aria-label={`${label} score ${safeScore} percent`}>
      <div className="nonrevy-score-dial__ring">
        <span>{safeScore}%</span>
      </div>
      <div>
        <small>{label}</small>
        <strong>{safeScore >= 78 ? 'Strong shot' : safeScore >= 62 ? 'Workable' : 'Needs backup'}</strong>
      </div>
    </div>
  )
}

function PlannerSkeletonLoaders() {
  return (
    <section className="nonrevy-skeleton-wrap" aria-live="polite" aria-label="Loading itinerary recommendations">
      {[0, 1, 2].map((item) => (
        <article key={item} className="nonrevy-skeleton-card">
          <div className="nonrevy-skeleton nonrevy-skeleton--pill" />
          <div className="nonrevy-skeleton nonrevy-skeleton--title" />
          <div className="nonrevy-skeleton-map">
            <span /><span /><span />
          </div>
          <div className="nonrevy-skeleton-grid">
            <div /><div /><div /><div />
          </div>
        </article>
      ))}
    </section>
  )
}


type UniversalSearchCategory = 'Airport' | 'Route' | 'Itinerary' | 'Flight opportunity' | 'Premium cabin opportunity'

type UniversalSearchResult = {
  category: UniversalSearchCategory
  title: string
  summary: string
  actionQuery: string
  badge?: string
}

type UniversalSearchModel = {
  bestInterpretation: string
  alternateQueries: string[]
  results: UniversalSearchResult[]
}

const universalAirportAliases: Record<string, string[]> = {
  LAX: ['los angeles', 'la airport'],
  HND: ['tokyo', 'haneda', 'tokyo haneda'],
  NRT: ['tokyo', 'narita', 'tokyo narita'],
  SBP: ['san luis obispo', 'slo', 'obispo', 'san luis'],
  SEA: ['seattle', 'seatac', 'sea tac'],
  SFO: ['san francisco', 'bay area'],
  HNL: ['honolulu', 'oahu', 'hawaii'],
  OGG: ['maui', 'kahului'],
  JFK: ['new york', 'nyc'],
  LHR: ['london', 'heathrow'],
  CDG: ['paris', 'charles de gaulle']
}

const premiumCabinAliases: Record<string, string[]> = {
  Polaris: ['polaris', 'united polaris'],
  'Delta One': ['delta one', 'd1'],
  'lie-flat': ['lie flat', 'lie-flat', 'flat bed', 'premium cabin', 'business class']
}

function normalizedSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function compactSearchText(value: string) {
  return normalizedSearchText(value).replace(/\s+/g, '')
}

function airportDirectory() {
  return Object.values(airportMapScaffolds).map((airport) => ({
    ...airport,
    aliases: universalAirportAliases[airport.code] || []
  }))
}

function airportMatchesUniversalQuery(query: string) {
  const normalized = normalizedSearchText(query)
  const compact = compactSearchText(query)
  const codes: string[] = query.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  return airportDirectory().filter((airport) => {
    const fields = [airport.code, airport.name, ...(airport.aliases || [])]
    return codes.includes(airport.code) || fields.some((field) => {
      const normalizedField = normalizedSearchText(field)
      const compactField = compactSearchText(field)
      return normalizedField.includes(normalized) || normalized.includes(normalizedField) || compactField.includes(compact) || compact.includes(compactField)
    })
  }).slice(0, 4)
}

function universalFlightNumber(query: string) {
  return query.toUpperCase().match(/\b(?:UA|DL|AS|HA|AA|WN|B6|NK|F9|BA|JL|NH)\s?\d{1,4}\b/)?.[0].replace(/\s+/g, '')
}

function universalCabinProduct(query: string) {
  const normalized = normalizedSearchText(query)
  return Object.entries(premiumCabinAliases).find(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))?.[0]
}

function comparisonTouchesAirport(comparison: ItineraryComparison, code: string) {
  return airportCodesFromRoute(comparison.route).includes(code)
}

function bestInterpretationForUniversalSearch(query: string, parsed: ReturnType<typeof parseItineraryPrompt>, airportMatches: ReturnType<typeof airportMatchesUniversalQuery>, flightNumber?: string, cabinProduct?: string) {
  if (flightNumber) return `Flight search for ${flightNumber}`
  if (cabinProduct) return `Premium cabin opportunity search for ${cabinProduct}`
  if (parsed.origin && parsed.destination) return `Route search: ${parsed.origin} → ${parsed.destination}`
  if (parsed.origin && /\b(out of|from|depart|leaving)\b/i.test(query)) return `Open-flight search from ${parsed.origin}`
  if (parsed.destination) return `Destination search to ${parsed.destination}`
  if (airportMatches.length === 1) return `Airport search: ${airportMatches[0].code} · ${airportMatches[0].name}`
  if (airportMatches.length > 1) return `Ambiguous airport search; best match ${airportMatches[0].code}`
  return 'Open-ended nonrev opportunity search'
}

function alternateQueriesForUniversalSearch(query: string, parsed: ReturnType<typeof parseItineraryPrompt>, airports: ReturnType<typeof airportMatchesUniversalQuery>, travelerProfile: TravelerProfileScaffold) {
  const alternates = new Set<string>()
  const home = travelerProfile.homeAirport || 'LAX'
  airports.forEach((airport) => {
    alternates.add(`${home} to ${airport.code}`)
    alternates.add(`open flights out of ${airport.code} today`)
  })
  if (parsed.origin && !parsed.destination) {
    alternates.add(`${parsed.origin} to SEA`)
    alternates.add(`${parsed.origin} to LAX`)
  }
  if (parsed.destination && !parsed.origin) alternates.add(`${home} to ${parsed.destination}`)
  const cabin = universalCabinProduct(query)
  if (cabin) {
    alternates.add(`where can I get ${cabin} from ${home}`)
    alternates.add(`${home} to HND Polaris`)
  }
  if (!alternates.size) {
    alternates.add('LAX to HND')
    alternates.add('open flights out of SBP today')
    alternates.add('where can I get Polaris')
  }
  return [...alternates].filter((alternate) => alternate.toLowerCase() !== query.trim().toLowerCase()).slice(0, 4)
}

function buildUniversalSearchModel({
  query,
  comparisons,
  flights,
  travelerProfile
}: {
  query: string
  comparisons: ItineraryComparison[]
  flights: any[]
  travelerProfile: TravelerProfileScaffold
}): UniversalSearchModel | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  const parsed = parseItineraryPrompt(trimmed)
  const airports = airportMatchesUniversalQuery(trimmed)
  const flightNumber = universalFlightNumber(trimmed)
  const cabinProduct = universalCabinProduct(trimmed)
  const results: UniversalSearchResult[] = []

  airports.forEach((airport) => {
    results.push({
      category: 'Airport',
      title: `${airport.code} · ${airport.name}`,
      summary: `Use ${airport.code} as an origin, destination, or backup gateway in the planner.`,
      actionQuery: `${travelerProfile.homeAirport || 'LAX'} to ${airport.code}`,
      badge: 'Airport'
    })
  })

  const routeComparisons = comparisons.filter((comparison) => {
    if (parsed.origin && parsed.destination) return comparison.route.includes(parsed.origin) && comparison.route.includes(parsed.destination)
    if (parsed.origin) return comparisonTouchesAirport(comparison, parsed.origin)
    if (parsed.destination) return comparisonTouchesAirport(comparison, parsed.destination)
    return airports.some((airport) => comparisonTouchesAirport(comparison, airport.code))
  })

  routeComparisons.slice(0, 3).forEach((comparison, index) => {
    results.push({
      category: index === 0 ? 'Itinerary' : 'Route',
      title: comparison.route,
      summary: `${comparison.carrier} · ${comparison.flightNumber} · score ${comparison.score}/100 · confidence ${comparison.routeConfidence.score}/100.`,
      actionQuery: comparison.route.replace(/ → /g, ' to '),
      badge: index === 0 ? 'Top itinerary' : 'Route match'
    })
  })

  const exactFlightRows = flights.filter((flight) => flightNumber && String(flight.flight_number || flight.ident || '').replace(/\s+/g, '').toUpperCase() === flightNumber).slice(0, 3)
  if (flightNumber && exactFlightRows.length === 0) {
    results.push({
      category: 'Flight opportunity',
      title: flightNumber,
      summary: 'Flight-number search detected. Use Expand Details or Request load after a route search to verify current standby context; this does not imply seat availability.',
      actionQuery: flightNumber,
      badge: 'Flight search'
    })
  }
  exactFlightRows.forEach((flight) => {
    const route = `${flight.origin || 'TBD'} → ${flight.destination || 'TBD'}`
    results.push({
      category: 'Flight opportunity',
      title: `${flight.flight_number || flight.ident} · ${route}`,
      summary: `${flight.aircraft || 'Aircraft pending'} · ${flight.status || 'Status pending'} · score ${flight.score ?? 'pending'}.`,
      actionQuery: `${flight.flight_number || flight.ident}`,
      badge: 'Flight match'
    })
  })

  const premiumMatches = (cabinProduct ? comparisons : comparisons.filter((comparison) => premiumCabinScore(comparison) >= 150))
    .filter((comparison) => cabinProduct || /polaris|delta|united|lie|widebody|777|787|a330|a350/i.test(`${comparison.carrier} ${comparison.flightNumber} ${comparison.route}`))
    .slice(0, 3)
  premiumMatches.forEach((comparison) => {
    results.push({
      category: 'Premium cabin opportunity',
      title: `${cabinProduct || 'Premium cabin'} · ${comparison.route}`,
      summary: `${comparison.carrier} signal with long-haul/premium-airport routing. Verify aircraft and loads before acting.`,
      actionQuery: `${comparison.route.replace(/ → /g, ' to ')} ${cabinProduct || 'premium cabin'}`,
      badge: cabinProduct || 'Premium'
    })
  })

  const deduped = results.filter((result, index, all) => all.findIndex((item) => `${item.category}-${item.title}` === `${result.category}-${result.title}`) === index).slice(0, 8)
  return {
    bestInterpretation: bestInterpretationForUniversalSearch(trimmed, parsed, airports, flightNumber, cabinProduct),
    alternateQueries: alternateQueriesForUniversalSearch(trimmed, parsed, airports, travelerProfile),
    results: deduped.length ? deduped : [{
      category: 'Route',
      title: trimmed,
      summary: 'Open-ended search detected. Run it through the planner to turn this into ranked itinerary recommendations and recovery options.',
      actionQuery: trimmed,
      badge: 'Open search'
    }]
  }
}

function UniversalSearchPanel({
  query,
  comparisons,
  flights,
  travelerProfile,
  onChoose
}: {
  query: string
  comparisons: ItineraryComparison[]
  flights: any[]
  travelerProfile: TravelerProfileScaffold
  onChoose: (query: string) => void
}) {
  const model = useMemo(() => buildUniversalSearchModel({ query, comparisons, flights, travelerProfile }), [query, comparisons, flights, travelerProfile])
  if (!model) return null

  return (
    <section className="nonrevy-results-shell" style={{ border: '1px solid #334155', borderRadius: 22, padding: 'clamp(14px, 3vw, 18px)', background: 'rgba(15, 23, 42, 0.82)', marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: '#67e8f9', fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', margin: 0 }}>Universal search</p>
          <h2 style={{ margin: '6px 0', fontSize: 24 }}>Best interpretation: {model.bestInterpretation}</h2>
          <p style={{ color: '#94a3b8', margin: 0 }}>Search matches airports, routes, itineraries, flight numbers, and premium cabin opportunities without exposing technical diagnostics.</p>
        </div>
        {model.alternateQueries.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 520 }}>
            {model.alternateQueries.map((alternate) => (
              <button key={alternate} type="button" onClick={() => onChoose(alternate)} style={{ border: '1px solid #475569', borderRadius: 999, background: '#020617', color: '#cbd5e1', padding: '8px 10px', fontWeight: 700 }}>
                {alternate}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 12, marginTop: 14 }}>
        {model.results.map((result) => (
          <article key={`${result.category}-${result.title}`} style={{ border: '1px solid #1e293b', borderRadius: 16, padding: 14, background: '#020617' }}>
            <small style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 900 }}>{result.category}</small>
            <h3 style={{ color: '#f8fafc', margin: '6px 0', fontSize: 18 }}>{result.title}</h3>
            <p style={{ color: '#cbd5e1', margin: '0 0 10px' }}>{result.summary}</p>
            <button type="button" onClick={() => onChoose(result.actionQuery)} style={{ border: '1px solid #38bdf8', borderRadius: 999, background: '#082f49', color: '#cffafe', padding: '8px 10px', fontWeight: 800 }}>
              Search this
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function recommendationLabel(index: number) {
  if (index === 0) return 'Best Option'
  if (index === 1) return 'Backup Option'
  return 'Last Chance / Alternative Option'
}

function recommendationAccent(index: number) {
  if (index === 0) return '#22c55e'
  if (index === 1) return '#facc15'
  return '#fb7185'
}

function carrierFlightSummary(comparison: ItineraryComparison) {
  const flight = comparison.flightNumber && comparison.flightNumber !== 'Multiple options' ? comparison.flightNumber : 'multiple flight options'
  const legSummary = comparison.connections === 0 ? 'Nonstop' : `${comparison.connections} connection${comparison.connections === 1 ? '' : 's'}`
  return `${comparison.carrier} · ${flight} · ${legSummary}`
}

function plainEnglishRationale(comparison: ItineraryComparison, index: number) {
  const preferred = comparison.explanation.whyRankedHere[0] || comparison.why[0]
  if (preferred) return preferred
  if (index === 0) return 'This is the strongest overall option based on the current route score, confidence, and recovery signals.'
  if (index === 1) return 'This is the best backup if the first option tightens up, with a useful balance of score and flexibility.'
  return 'Keep this as the alternate path if the cleaner options do not work out.'
}

function keyRiskNote(comparison: ItineraryComparison) {
  if (comparison.riskLevel.toLowerCase().includes('high')) return `${comparison.riskLevel} risk — request a fresh load before committing.`
  if (comparison.connections > 0) return `${comparison.connections} connection${comparison.connections === 1 ? '' : 's'} add misconnect and recovery risk.`
  if (comparison.weatherRisk.scoreImpact >= 18) return 'Weather signal may reduce your margin on this routing.'
  if (comparison.disruption.disruptionImpactScore >= 22) return 'Disruption signals are elevated for this option.'
  if (comparison.routeConfidence.score < 70) return 'Confidence is moderate, so keep a backup ready.'
  return 'Lowest visible risk among the current recommendations; still verify loads before travel.'
}

function isElevatedRecoveryRisk(comparison: ItineraryComparison) {
  const risk = comparison.riskLevel.toLowerCase()
  return comparison.successProbability < 74 || comparison.routeConfidence.score < 70 || comparison.connections > 0 || risk.includes('high') || comparison.weatherRisk.scoreImpact >= 18 || comparison.disruption.disruptionImpactScore >= 22 || comparison.airportIntelligence.connectionRiskScore >= 55
}

function alternativeRecoveryOptions(current: ItineraryComparison, comparisons: ItineraryComparison[]) {
  const currentEndpoints = routeEndpoints(current.route)
  return comparisons
    .filter((option) => option.id !== current.id)
    .sort((a, b) => {
      const aEndpoints = routeEndpoints(a.route)
      const bEndpoints = routeEndpoints(b.route)
      const aDestinationMatch = aEndpoints.destination && aEndpoints.destination === currentEndpoints.destination ? 18 : 0
      const bDestinationMatch = bEndpoints.destination && bEndpoints.destination === currentEndpoints.destination ? 18 : 0
      return (b.score + b.successProbability + backupAvailabilityScore(b) + bDestinationMatch) - (a.score + a.successProbability + backupAvailabilityScore(a) + aDestinationMatch)
    })
}

function recoveryPlanSummary(current: ItineraryComparison, option?: ItineraryComparison, fallbackLabel?: string) {
  if (!option) return `${fallbackLabel || 'Backup'} is not available in the current result set. Broaden the search or add another carrier/date before relying on a recovery path.`
  const currentEndpoints = routeEndpoints(current.route)
  const optionEndpoints = routeEndpoints(option.route)
  const destinationMatch = currentEndpoints.destination && optionEndpoints.destination === currentEndpoints.destination
  if (destinationMatch) return `If ${current.route} fails, try ${option.route}. It is already in this result set and keeps the same destination target.`
  return `If ${current.route} fails, consider ${option.route}. This is an alternate gateway/path from the current recommendations, not guaranteed availability.`
}

function buildRecoveryStrategy(current: ItineraryComparison, comparisons: ItineraryComparison[]): RecoveryStrategy {
  const alternatives = alternativeRecoveryOptions(current, comparisons)
  const gateways = Array.from(new Set(alternatives.flatMap((option) => routeGateways(option.route))))
  const alternativeDepartures = alternatives.length
  const alternativeGateways = gateways.length
  const sameDayRecoveryPossible = alternatives.some((option) => option.successProbability >= 62 && option.routeConfidence.score >= 58 && option.disruption.routeHealth !== 'Red')
  const availabilityScore = backupAvailabilityScore(current)
  const score = clampScore(
    current.successProbability * 0.24 +
    current.routeConfidence.score * 0.18 +
    Math.min(30, alternativeDepartures * 10) +
    Math.min(18, alternativeGateways * 6) +
    Math.min(18, availabilityScore / 4) -
    current.connections * 4 -
    Math.max(0, current.weatherRisk.scoreImpact - 12) / 2 -
    Math.max(0, current.disruption.disruptionImpactScore - 18) / 3
  )
  const backupA = alternatives[0]
  const backupB = alternatives[1]

  return {
    score,
    badge: recoveryBadgeFor(score),
    alternativeDepartures,
    alternativeGateways,
    sameDayRecoveryPossible,
    elevatedRisk: isElevatedRecoveryRisk(current),
    plans: [
      {
        label: 'Primary Plan',
        route: current.route,
        summary: `${current.route} remains the primary plan with ${loadAwareScorePhrase(current)} and ${current.routeConfidence.score}/100 route confidence.`
      },
      {
        label: 'Backup Plan A',
        route: backupA?.route || 'No current alternate itinerary',
        summary: recoveryPlanSummary(current, backupA, 'Backup Plan A')
      },
      {
        label: 'Backup Plan B',
        route: backupB?.route || 'No second alternate itinerary',
        summary: recoveryPlanSummary(current, backupB, 'Backup Plan B')
      }
    ]
  }
}

function planBIntelligence(current: ItineraryComparison, comparisons: ItineraryComparison[]) {
  const generatedPaths = current.suggestedRecoveryPaths || []
  const generatedRoutePaths = generatedPaths.filter((path) => path.route && path.kind !== 'next-day')
  const generatedNextDay = generatedPaths.find((path) => path.kind === 'next-day')
  const currentDeparture = parseScheduleTime(current.departureDateTime)
  const laterSameDayFromResults = comparisons
    .filter((option) => option.id !== current.id)
    .filter((option) => routeEndpoints(option.route).destination === routeEndpoints(current.route).destination)
    .filter((option) => {
      const departure = parseScheduleTime(option.departureDateTime)
      return currentDeparture !== null && departure !== null && departure > currentDeparture && new Date(departure).toISOString().slice(0, 10) === new Date(currentDeparture).toISOString().slice(0, 10)
    })
    .map((option) => option.route)
  const sameDayRoutes = [...new Set([
    ...generatedRoutePaths.map((path) => path.route as string),
    ...laterSameDayFromResults
  ])].filter((route) => route !== current.route)
  const alternateHubs = [...new Set(sameDayRoutes.flatMap(routeGateways))]

  return {
    bestBackupRoute: sameDayRoutes[0],
    alternateHubs,
    sameDayRoutes: sameDayRoutes.slice(0, 3),
    nextDayFallback: (!sameDayRoutes.length || (typeof current.recoveryStrength === 'number' && current.recoveryStrength < 45)) ? generatedNextDay?.route || generatedNextDay?.label : undefined,
    recoveryStrength: current.recoveryStrength,
    hasBackupRoute: Boolean(sameDayRoutes.length || generatedNextDay)
  }
}

function PlanBItinerarySection({ comparison, comparisons }: { comparison: ItineraryComparison; comparisons: ItineraryComparison[] }) {
  const planB = planBIntelligence(comparison, comparisons)

  return (
    <details className="nonrevy-flight-board-row__details" onClick={(event) => event.stopPropagation()}>
      <summary>Plan B ▼</summary>
      {!planB.hasBackupRoute ? (
        <p>No strong backup route found.</p>
      ) : (
        <ul>
          {planB.bestBackupRoute ? <li>Best backup routing: {planB.bestBackupRoute}</li> : null}
          {planB.alternateHubs.length ? <li>Alternate hub options: {planB.alternateHubs.join(', ')}</li> : null}
          {planB.sameDayRoutes.length ? <li>Later same-day route options: {planB.sameDayRoutes.join(' · ')}</li> : null}
          {planB.nextDayFallback ? <li>Next-day fallback: {planB.nextDayFallback}</li> : null}
          {typeof planB.recoveryStrength === 'number' ? <li>Recovery strength score: {planB.recoveryStrength}/100</li> : null}
        </ul>
      )}
    </details>
  )
}

function RecoverySummarySection({ recovery }: { recovery?: RecoveryAnalysis }) {
  if (!recovery) return null
  const badge = recovery.strength === 'Excellent' ? '🟢' : recovery.strength === 'Good' ? '🟡' : recovery.strength === 'Fair' ? '🟠' : '🔴'
  const reasons = recovery.reasons.slice(0, 4)

  return (
    <section style={{ marginTop: 12, border: '1px solid #334155', borderRadius: 12, padding: 12, background: '#020617' }} aria-label="Recovery intelligence">
      <strong style={{ color: '#f8fafc' }}>Recovery {badge} {recovery.strength}</strong>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#cbd5e1' }}>
        {reasons.map((reason) => <li key={`recovery-${reason}`}>{reason}</li>)}
      </ul>
    </section>
  )
}

function DoorToDoorPlanSection({ plan }: { plan?: EndToEndTripPlan }) {
  const fallback = 'Placeholder — no live ground, lodging, or local transport API connected yet.'

  return (
    <details className="nonrevy-flight-board-row__details" onClick={(event) => event.stopPropagation()}>
      <summary>Door-to-door plan</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <p style={{ color: '#cbd5e1', margin: 0 }}><strong style={{ color: '#f8fafc' }}>Departure airport access:</strong> {plan?.departureGroundPlan || fallback}</p>
        <p style={{ color: '#cbd5e1', margin: 0 }}><strong style={{ color: '#f8fafc' }}>Arrival transport:</strong> {plan?.arrivalGroundPlan || fallback}</p>
        <p style={{ color: '#cbd5e1', margin: 0 }}><strong style={{ color: '#f8fafc' }}>Hotel/final destination:</strong> {plan?.hotelPlan || fallback}</p>
        <p style={{ color: '#cbd5e1', margin: 0 }}><strong style={{ color: '#f8fafc' }}>Backup if stranded:</strong> {plan?.backupPlan.summary || fallback}</p>
      </div>
    </details>
  )
}

function CommercialAvailabilitySection({ signal }: { signal?: SellableSeatSignal }) {
  const label = commercialAvailabilityLabel(signal)
  if (!label) return null

  return (
    <p style={{ color: '#cbd5e1', margin: '8px 0 0' }}>
      <strong style={{ color: '#f8fafc' }}>Commercial availability:</strong> {label}. Proxy signal only; not confirmed non-rev seat availability.
    </p>
  )
}

function confidenceStatusIcon(level?: ConfidenceLevel) {
  if (level === 'excellent') return '🟢'
  if (level === 'good') return '🟡'
  if (level === 'fair') return '🟠'
  if (level === 'poor') return '🔴'
  return '⚪'
}

function recoveryStatusIcon(recovery?: RecoveryAnalysis) {
  if (!recovery) return '⚪'
  if (recovery.strength === 'Excellent') return '🟢'
  if (recovery.strength === 'Good') return '🟢'
  if (recovery.strength === 'Fair') return '🟡'
  return '🔴'
}

function commercialStatusIcon(signal?: SellableSeatSignal) {
  if (signal?.sellableStatus === 'available') return '🟢'
  if (signal?.sellableStatus === 'limited') return '🟡'
  if (signal?.sellableStatus === 'unavailable') return '🔴'
  return '⚪'
}

function communityStatusIcon(signal?: FlightCommunitySummary) {
  if (signal?.status === 'favorable') return '🟢'
  if (signal?.status === 'mixed' || signal?.status === 'limited') return '🟡'
  if (signal?.status === 'unavailable') return '🔴'
  return '⚪'
}

function historicalReliabilityStatusIcon(reliability?: HistoricalReliability) {
  if (reliability?.signal.level === 'excellent') return '🟢'
  if (reliability?.signal.level === 'good') return '🟡'
  if (reliability?.signal.level === 'fair') return '🟠'
  if (reliability?.signal.level === 'poor') return '🔴'
  return '⚪'
}

function cleanRecommendationTitle(title: string) {
  if (/best overall choice/i.test(title)) return 'Best Overall'
  return title.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/ Choice$/, '')
}

function recoveryCardSummary(recovery?: RecoveryAnalysis) {
  if (!recovery) return 'Unknown recovery signal'
  if (recovery.laterFlightOpportunities >= 2) return 'Multiple backup departures available'
  if (recovery.laterFlightOpportunities === 1) return 'One later backup departure available'
  if (recovery.alternateAirportCount > 0) return 'Alternate airport options available'
  return recovery.primaryRecoveryOption?.summary || recovery.summary
}

function commercialCardSummary(signal?: SellableSeatSignal) {
  if (!signal) return 'Commercial availability signal unknown'
  if (signal.sellableStatus === 'available') return 'Still being sold commercially'
  if (signal.sellableStatus === 'limited') return 'Commercial availability signal limited'
  if (signal.sellableStatus === 'unavailable') return 'Commercial availability signal unavailable'
  return 'Commercial availability signal unknown'
}

function communityCardSummary(signal?: FlightCommunitySummary) {
  if (!signal || signal.activeReportCount === 0 || signal.status === 'unknown') return 'Recent community reports unknown'
  return communitySignalLabel(signal.status)
}

function historicalReliabilityCardSummary(reliability?: HistoricalReliability) {
  if (!reliability || reliability.signal.level === 'unknown') return 'Unknown'
  return `${historicalReliabilityDisplayLabel(reliability.signal.level)} · avg delay ${Math.round(reliability.averageDelayMinutes || 0)} min`
}

function weatherCardSummary(weatherRisk?: WeatherRisk) {
  return weatherRisk ? weatherRiskDisplayWithIcon(weatherRisk.level) : 'Unknown'
}

function doorToDoorCardSummary(comparison: ItineraryComparison) {
  const estimate = comparison.endToEnd?.estimatedDoorToDoorTime
    ?.replace(/^Placeholder estimate:\s*/i, '')
    .replace(/^flight itinerary/i, 'flight itinerary')
  if (estimate) return `Estimated ${estimate}`
  if (!isMissingLiveLegDetail(comparison.totalTravelTime)) return `Estimated ${compactDurationLabel(comparison.totalTravelTime)} plus ground buffers`
  return 'Estimated door-to-door timing unavailable'
}

function conciseWhyRouteReasons(comparison: ItineraryComparison, reasons: string[]) {
  const fallback = [comparison.whyThisRoute, ...comparison.why, ...comparison.explanation.whyRankedHere]
    .filter((reason): reason is string => Boolean(reason))
  return [...reasons, ...fallback].map(compactReasonText).filter(Boolean).slice(0, 3)
}

function ItineraryIntelligenceSummary({ comparison, recommendation, reasons }: { comparison: ItineraryComparison; recommendation: string; reasons: string[] }) {
  const whyReasons = conciseWhyRouteReasons(comparison, reasons)

  return (
    <div className="nonrevy-flight-board-row__decision" aria-label="Itinerary intelligence summary">
      <strong>⭐ {cleanRecommendationTitle(recommendation)}</strong>
      <div style={{ display: 'grid', gap: 4, marginTop: 8, color: '#cbd5e1' }}>
        <span>{confidenceStatusIcon(comparison.routeConfidence.level)} Route Confidence {routeConfidenceLabel(comparison.routeConfidence.level)}</span>
        <span>{recoveryStatusIcon(comparison.recovery)} Recovery Strength {comparison.recovery?.strength || 'Unknown'} — {recoveryCardSummary(comparison.recovery)}</span>
        <span>{commercialStatusIcon(comparison.sellableSeatSignal)} Commercial Availability Signal — {commercialCardSummary(comparison.sellableSeatSignal)}</span>
        <span>{communityStatusIcon(comparison.communitySignal)} Community Signal — {communityCardSummary(comparison.communitySignal)}</span>
        <span>{historicalReliabilityStatusIcon(comparison.historicalReliability)} Historical Reliability — {historicalReliabilityCardSummary(comparison.historicalReliability)}</span>
        <span>🌦️ Weather — {weatherCardSummary(comparison.weatherRisk)}</span>
        <span>🟢 Door-to-Door Summary — {doorToDoorCardSummary(comparison)}</span>
      </div>
      {whyReasons.length ? (
        <div style={{ marginTop: 8 }}>
          <strong>Why this route</strong>
          <ul>
            {whyReasons.map((reason) => <li key={`${comparison.id}-intel-why-${reason}`}>{reason}</li>)}
          </ul>
        </div>
      ) : null}
      <small style={{ color: '#94a3b8' }}>Signals are advisory only: no guaranteed seats, confirmed standby clearance, or exact nonrev loads.</small>
    </div>
  )
}

function CommunitySignalLine({ signal }: { signal?: FlightCommunitySummary }) {
  if (!signal || signal.activeReportCount === 0 || signal.status === 'unknown') return null
  return (
    <p style={{ color: '#cbd5e1', margin: '8px 0 0' }}>
      <strong style={{ color: '#f8fafc' }}>Community signal:</strong> {communitySignalLabel(signal.status)} · {signal.activeReportCount} recent report{signal.activeReportCount === 1 ? '' : 's'} · {signal.confidence} confidence. <small style={{ color: '#94a3b8' }}>Not confirmed standby clearance.</small>
    </p>
  )
}

function HistoricalReliabilityLine({ reliability }: { reliability?: HistoricalReliability }) {
  const label = reliability ? historicalReliabilityDisplayLabel(reliability.signal.level) : 'Unknown'
  return (
    <p style={{ color: '#cbd5e1', margin: '8px 0 0' }}>
      <strong style={{ color: '#f8fafc' }}>Historical Reliability:</strong> {label}. <small style={{ color: '#94a3b8' }}>Advisory past-performance signal; future API placeholders include FlightAware historical, Cirium, AviationStack, FAA BTS, Eurocontrol, and internal analytics.</small>
    </p>
  )
}

function CompactRouteConfidenceLine({ confidence }: { confidence?: RouteConfidence }) {
  if (!confidence) return null
  const positiveFactors = confidence.positiveFactors.slice(0, 2)
  const cautionFactor = confidence.cautionFactors[0]

  return (
    <div style={{ color: '#cbd5e1', margin: '8px 0 0' }}>
      <p style={{ margin: 0 }}>
        <strong style={{ color: '#f8fafc' }}>Route confidence:</strong> {routeConfidenceLabel(confidence.level)}
      </p>
      {positiveFactors.length || cautionFactor ? (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {positiveFactors.map((factor) => <li key={`${factor.source}-${factor.label}`}>{factor.label}</li>)}
          {cautionFactor ? <li key={`${cautionFactor.source}-${cautionFactor.label}`}>{cautionFactor.label}</li> : null}
        </ul>
      ) : null}
      <small style={{ color: '#94a3b8' }}>Not guaranteed standby clearance.</small>
    </div>
  )
}

function RecoveryStrategySection({ comparison, comparisons }: { comparison: ItineraryComparison; comparisons: ItineraryComparison[] }) {
  const recovery = buildRecoveryStrategy(comparison, comparisons)
  const color = recoveryBadgeColor(recovery.badge)

  return (
    <details className="nonrevy-premium-details nonrevy-recovery-details" style={{ marginTop: 14, border: `1px solid ${color}`, borderRadius: 14, padding: 12, background: '#020617' }}>
      <summary style={{ color, cursor: 'pointer', fontWeight: 'bold' }}>
        Recovery Strategy · {recovery.badge}
      </summary>
      <p style={{ color: '#cbd5e1', margin: '10px 0 0' }}>
        {recovery.elevatedRisk
          ? 'This itinerary has elevated risk signals, so keep these recovery moves ready before you commit.'
          : 'Risk is currently manageable, but these are the available recovery moves from the current result set.'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 12 }}>
        {[
          ['Recovery Score', `${recovery.score}/100`, color],
          ['Alternative departures', recovery.alternativeDepartures, '#38bdf8'],
          ['Alternative gateways', recovery.alternativeGateways, '#c084fc'],
          ['Same-day recovery', recovery.sameDayRecoveryPossible ? 'Yes' : 'No', recovery.sameDayRecoveryPossible ? '#22c55e' : '#f87171']
        ].map(([label, value, metricColor]) => (
          <div key={`${comparison.id}-recovery-${label}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
            <small style={{ color: '#94a3b8' }}>{label}</small>
            <p style={{ margin: '4px 0 0', color: String(metricColor), fontWeight: 'bold' }}>{value}</p>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {comparison.suggestedRecoveryPaths?.map((path) => (
          <article key={`${comparison.id}-suggested-${path.id}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 12, background: '#0f172a' }}>
            <strong style={{ color: '#f8fafc' }}>Backup option · {path.label}</strong>
            {path.route ? <p style={{ color: '#38bdf8', margin: '6px 0', fontWeight: 'bold' }}>{path.route}</p> : null}
            <p style={{ color: '#cbd5e1', margin: 0 }}>{path.note}</p>
          </article>
        ))}
        {recovery.plans.map((plan) => (
          <article key={`${comparison.id}-${plan.label}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 12, background: '#0f172a' }}>
            <strong style={{ color: '#f8fafc' }}>{plan.label}</strong>
            <p style={{ color: '#38bdf8', margin: '6px 0', fontWeight: 'bold' }}>{plan.route}</p>
            <p style={{ color: '#cbd5e1', margin: 0 }}>{plan.summary}</p>
          </article>
        ))}
      </div>
      <p style={{ color: '#94a3b8', margin: '10px 0 0' }}>
        Recovery uses only the current itinerary recommendations, airport backup-routing signals, and existing route scoring. It does not create or imply seat availability.
      </p>
    </details>
  )
}

type CopilotResponse = {
  recommendedAction: string
  bestRoute: string
  backupRoute: string
  recoveryStrategy: string
  why: string[]
}

const copilotExamples = [
  'Get me to Tokyo tomorrow.',
  'Best Polaris route this weekend.',
  'Open flights from SBP today.',
  'Get me to London with the lowest risk.',
  'Find me the best backup route to HND.'
]

function copilotIntent(prompt: string) {
  const normalized = prompt.toLowerCase()
  if (normalized.includes('backup') || normalized.includes('recover')) return 'backup'
  if (normalized.includes('polaris') || normalized.includes('premium') || normalized.includes('business')) return 'premium'
  if (normalized.includes('risk') || normalized.includes('safe')) return 'lowest-risk'
  if (normalized.includes('fast') || normalized.includes('quick')) return 'fastest'
  return 'recommended'
}

function chooseCopilotComparison(prompt: string, comparisons: ItineraryComparison[]) {
  if (!comparisons.length) return null
  const insights = buildRouteIntelligenceInsights(comparisons)
  const intent = copilotIntent(prompt)
  const insight = insights.find((item) => {
    if (intent === 'backup') return item.badge === 'Most Backup Options'
    if (intent === 'premium') return item.badge === 'Best Premium Cabin'
    if (intent === 'lowest-risk') return item.badge === 'Lowest Risk'
    if (intent === 'fastest') return item.badge === 'Fastest'
    return item.badge === 'Recommended'
  })
  return comparisons.find((comparison) => comparison.id === insight?.comparisonId) || comparisons[0]
}

function matchingWatchlistNote(route: string, watches: ReturnType<typeof loadSavedTripWatchlist>) {
  const routeAirports = airportCodesFromRoute(route)
  const destination = routeAirports[routeAirports.length - 1]
  const match = watches.find((watch) => watch.selectedItinerary === route || (destination && watch.destination === destination))
  if (!match) return ''
  return `Watchlist has ${match.origin} → ${match.destination} for ${match.travelDate || 'flexible dates'}, so keep that monitored while planning.`
}

function buildCopilotResponse({
  prompt,
  comparisons,
  travelerProfile,
  watches
}: {
  prompt: string
  comparisons: ItineraryComparison[]
  travelerProfile: TravelerProfileScaffold
  watches: ReturnType<typeof loadSavedTripWatchlist>
}): CopilotResponse {
  const selected = chooseCopilotComparison(prompt, comparisons)
  if (!selected) {
    const preview = parseTripPlannerPrompt(prompt || 'Get me somewhere', travelerProfile)
    return {
      recommendedAction: prompt.trim() ? 'Run this as a planner search.' : 'Ask Copilot for a route, cabin, airport, or risk preference.',
      bestRoute: `${preview.origin} → ${preview.destination}`,
      backupRoute: 'Pending itinerary results',
      recoveryStrategy: 'Recovery strategy appears after the itinerary engine returns route options.',
      why: [
        `I parsed this as ${preview.origin} to ${preview.destination} for ${preview.dateRange}.`,
        `Traveler profile starts from ${travelerProfile.homeAirport || 'your saved home airport'} with ${travelerProfile.travelerType} assumptions.`,
        'Submit the Copilot search to use the existing itinerary, route intelligence, and recovery engines.'
      ]
    }
  }

  const alternatives = alternativeRecoveryOptions(selected, comparisons)
  const backup = alternatives[0] || comparisons.find((comparison) => comparison.id !== selected.id)
  const recovery = buildRecoveryStrategy(selected, comparisons)
  const watchlistNote = matchingWatchlistNote(selected.route, watches)
  const intent = copilotIntent(prompt)
  const action = intent === 'backup'
    ? 'Use the strongest backup-routing option first.'
    : intent === 'premium'
      ? 'Prioritize cabin upside, then protect it with a backup route.'
    : intent === 'lowest-risk'
      ? 'Choose the lowest-risk path and keep same-day recovery ready.'
    : intent === 'fastest'
      ? 'Take the fastest viable arrival if the load picture holds.'
    : 'Start with the recommended route and keep the backup warm.'

  return {
    recommendedAction: action,
    bestRoute: selected.route,
    backupRoute: backup?.route || 'No alternate itinerary in current results',
    recoveryStrategy: `${recovery.badge} · ${recovery.sameDayRecoveryPossible ? 'same-day recovery is possible from current options' : 'same-day recovery is limited in current options'}.`,
    why: [
      `${selected.route} scores ${selected.score}/100 with ${loadAwareScorePhrase(selected)} and ${selected.routeConfidence.score}/100 route confidence.`,
      selected.connections === 0 ? 'Nonstop routing keeps transfer risk low.' : `${selected.connections} connection${selected.connections === 1 ? '' : 's'} adds risk, so Copilot is pairing it with recovery options.`,
      `${recovery.alternativeDepartures} alternate departure option${recovery.alternativeDepartures === 1 ? '' : 's'} and ${recovery.alternativeGateways} alternate gateway${recovery.alternativeGateways === 1 ? '' : 's'} are visible in current itinerary results.`,
      watchlistNote || `Traveler profile preference starts from ${travelerProfile.homeAirport || 'your saved home airport'} with ${travelerProfile.preferredAirports.join(', ') || 'no preferred airports set'}.`
    ]
  }
}

function CopilotPanel({
  prompt,
  setPrompt,
  status,
  loading,
  comparisons,
  travelerProfile,
  onSubmit
}: {
  prompt: string
  setPrompt: (value: string) => void
  status: string
  loading: boolean
  comparisons: ItineraryComparison[]
  travelerProfile: TravelerProfileScaffold
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [watches, setWatches] = useState<ReturnType<typeof loadSavedTripWatchlist>>([])

  useEffect(() => {
    function refreshWatches() {
      setWatches(loadSavedTripWatchlist())
    }

    refreshWatches()
    window.addEventListener('nonrevy-watchlist-updated', refreshWatches)
    window.addEventListener('storage', refreshWatches)
    return () => {
      window.removeEventListener('nonrevy-watchlist-updated', refreshWatches)
      window.removeEventListener('storage', refreshWatches)
    }
  }, [])

  const response = useMemo(
    () => buildCopilotResponse({ prompt, comparisons, travelerProfile, watches }),
    [prompt, comparisons, travelerProfile, watches]
  )

  return (
    <section className="nonrevy-copilot-panel" style={{ border: '1px solid #7dd3fc', borderRadius: 24, padding: 'clamp(16px, 4vw, 22px)', background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.72), rgba(49, 46, 129, 0.46), rgba(15, 23, 42, 0.96))', marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: '#67e8f9', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>NONREVY Copilot</p>
          <h2 style={{ margin: '0 0 8px' }}>Tell Copilot what matters most.</h2>
          <p style={{ color: '#cbd5e1', margin: 0 }}>Copilot turns plain English into planner searches, then summarizes route intelligence, recovery, profile, and watchlist signals.</p>
        </div>
        <span style={{ border: '1px solid #22c55e', borderRadius: 999, color: '#bbf7d0', padding: '8px 12px', fontWeight: 'bold' }}>
          Existing planner engine
        </span>
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <label htmlFor="nonrevy-copilot-prompt" style={{ display: 'block', color: '#f8fafc', fontWeight: 'bold', marginBottom: 8 }}>
          Ask Copilot
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}>
          <input
            id="nonrevy-copilot-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Get me to Tokyo tomorrow."
            style={{ boxSizing: 'border-box', width: '100%', padding: 14, borderRadius: 16, border: '1px solid #475569', background: '#020617', color: 'white' }}
          />
          <button type="submit" disabled={loading} style={{ padding: '12px 18px', borderRadius: 14, border: 'none', background: loading ? '#475569' : '#67e8f9', color: '#020617', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Searching…' : 'Ask'}
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {copilotExamples.map((example) => (
          <button key={example} type="button" onClick={() => setPrompt(example)} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #334155', background: '#020617', color: '#cbd5e1', fontWeight: 'bold' }}>
            {example}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginTop: 16 }}>
        {[
          ['Recommended action', response.recommendedAction, '#67e8f9'],
          ['Best route', response.bestRoute, '#22c55e'],
          ['Backup route', response.backupRoute, '#facc15'],
          ['Recovery strategy', response.recoveryStrategy, '#c084fc']
        ].map(([label, value, color]) => (
          <article key={label} style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617' }}>
            <small style={{ color: '#94a3b8' }}>{label}</small>
            <p style={{ margin: '6px 0 0', color: String(color), fontWeight: 'bold' }}>{value}</p>
          </article>
        ))}
      </div>

      <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
        <strong style={{ color: '#f8fafc' }}>Why this recommendation</strong>
        <ul style={{ color: '#cbd5e1', paddingLeft: 20, marginBottom: 0 }}>
          {response.why.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </section>
      {status ? <p style={{ color: '#67e8f9', fontWeight: 'bold', marginBottom: 0 }}>{status}</p> : null}
    </section>
  )
}


function routeCoverageStatusLabel(suggestion: RouteCoverageSuggestion) {
  if (suggestion.lookupStatus === 'provider_rows_found') return 'Schedule rows may exist — verify live loads'
  if (suggestion.lookupStatus === 'skipped_rate_limited') return 'Lookup skipped safely'
  if (suggestion.lookupStatus === 'provider_warning') return 'Lookup unavailable'
  if (suggestion.lookupStatus === 'provider_no_rows') return 'No schedule rows confirmed'
  return 'Guidance only'
}

function routeAirportCodes(route?: string) {
  return (route || '').match(/\b[A-Za-z]{3}\b/g)?.map((code) => code.toUpperCase()) || []
}

function routeMatchesRequestedEndpoints(route: string | undefined, origin?: string, destination?: string) {
  if (!origin || !destination || !route) return false
  const codes = routeAirportCodes(route)
  return codes.length >= 2 && codes[0] === origin && codes[codes.length - 1] === destination
}

function isRecoveryAirportPath(path: SuggestedRecoveryPath, origin?: string, destination?: string) {
  if (path.kind !== 'positioning' && path.kind !== 'nearby-destination') return false
  return !routeMatchesRequestedEndpoints(path.route, origin, destination)
}

function ProductionEmptyState({ reasons, origin, destination, suggestions = [], recovery }: { reasons: string[]; origin?: string; destination?: string; suggestions?: RouteCoverageSuggestion[]; recovery?: RecoveryIntelligence }) {
  const recoveryPaths = recovery?.suggestedRecoveryPaths || []
  const topRoutes = suggestions
    .filter((suggestion) => routeMatchesRequestedEndpoints(suggestion.searchQuery, origin, destination))
    .map((suggestion) => ({ id: suggestion.id, label: suggestion.searchQuery, searchQuery: suggestion.searchQuery, status: routeCoverageStatusLabel(suggestion) }))
  const recoveryAirports = recoveryPaths
    .filter((path) => isRecoveryAirportPath(path, origin, destination))
    .map((path) => ({ id: path.id, label: path.label, status: 'Recovery guidance only' }))
  const hasTopRoutes = topRoutes.length > 0

  return (
    <section className="nonrevy-production-empty" aria-live="polite">
      <p className="nonrevy-production-empty__eyebrow">Search results</p>
      <h2>{hasTopRoutes ? 'Top route frameworks currently available' : "We couldn't find live results for this search right now."}</h2>
      <p className="nonrevy-production-empty__subtext">
        Live availability unavailable. Top Routes are complete origin-to-destination frameworks; Recovery Airports are positioning guidance only.
      </p>
      <p className="nonrevy-production-empty__guidance-note">
        {recovery ? `${recovery.explanation} Recovery strength: ${recovery.recoveryStrength}/100.` : 'Route frameworks and recovery guidance are separated because recovery airports are not itineraries.'}
      </p>
      <div className="nonrevy-production-empty__grid">
        <section>
          <strong>Next actions</strong>
          <ul>
            <li>Review Top Routes only as complete frameworks</li>
            <li><a href="/load-reports">Request loads</a></li>
            <li><a href="/intelligence">View route intelligence</a></li>
          </ul>
        </section>
        <section>
          <strong>Top Routes</strong>
          {topRoutes.length ? (
            <ul className="nonrevy-production-empty__suggestions">
              {topRoutes.map((route) => (
                <li key={route.id}>
                  <a href={travelerSearchUrl(route.searchQuery)}>{route.label}</a>
                  <span>{route.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nonrevy-production-empty__muted">No complete {origin || 'origin'} → {destination || 'destination'} frameworks are available right now.</p>
          )}
        </section>
        <section>
          <strong>Recovery Airports</strong>
          {recoveryAirports.length ? (
            <ul className="nonrevy-production-empty__suggestions">
              {recoveryAirports.map((airport) => (
                <li key={airport.id}>
                  <span>{airport.label}</span>
                  <span>{airport.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nonrevy-production-empty__muted">No separate positioning airports are suggested for this search.</p>
          )}
        </section>
      </div>
      <details className="nonrevy-production-empty__details">
        <summary>Why no results?</summary>
        <ul>
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </details>
    </section>
  )
}

type CommunityLoadFormState = {
  flightNumber: string
  date: string
  availableSeats: string
  standbyCount: string
  cabin: string
  notes: string
}

function itineraryLoadDate(comparison: ItineraryComparison, travelDate: string) {
  const trimmedTravelDate = travelDate.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedTravelDate)) return trimmedTravelDate
  const match = comparison.departureDateTime.match(/\d{4}-\d{2}-\d{2}/)
  return match?.[0] || ''
}

function communityFreshnessClass(freshness: CommunityLoadFreshness | null) {
  return `nonrevy-community-loads__freshness nonrevy-community-loads__freshness--${(freshness || 'none').toLowerCase()}`
}

function initialCommunityLoadForm(comparison: ItineraryComparison, travelDate: string): CommunityLoadFormState {
  return {
    flightNumber: comparison.flightNumber,
    date: itineraryLoadDate(comparison, travelDate),
    availableSeats: '',
    standbyCount: '',
    cabin: '',
    notes: ''
  }
}

function ItineraryComparisonPanel({ comparisons, travelDate, communityLoads, onCommunityLoadsUpdated, trustReceipt, title = 'Top 5 Routes', moreTitle = 'More routes' }: { comparisons: ItineraryComparison[]; travelDate: string; communityLoads: CommunityLoadReport[]; onCommunityLoadsUpdated: () => void; trustReceipt: SearchTrustReceiptProps; title?: string; moreTitle?: string }) {
  const [compareStatus, setCompareStatus] = useState('')
  const [savedComparisons, setSavedComparisons] = useState<SavedItineraryComparison[]>([])
  const [expandedDetailIds, setExpandedDetailIds] = useState<string[]>([])
  const [selectedComparisonId, setSelectedComparisonId] = useState('')
  const [activeCommunityLoadId, setActiveCommunityLoadId] = useState('')
  const [activeLoadRequestId, setActiveLoadRequestId] = useState('')
  const [communityLoadForm, setCommunityLoadForm] = useState<CommunityLoadFormState>({ flightNumber: '', date: '', availableSeats: '', standbyCount: '', cabin: '', notes: '' })
  const [communityLoadStatus, setCommunityLoadStatus] = useState('Community Loads ready. Submit or request a load without changing scoring.')

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

  if (comparisons.length === 0) return null


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
      setSelectedComparisonId(comparison.id)
      setSavedComparisons(loadSavedItineraryComparisons())
      setCompareStatus(`Saved ${saved.route} for side-by-side comparison.`)
    }
  }

  async function shareItinerary(comparison: ItineraryComparison) {
    const summary = `${comparison.carrier} ${comparison.flightNumber} · ${comparison.departureDateTime} → ${comparison.arrivalDateTime} · ${compactStopsLabel(comparison.connections)} · ${comparison.totalTravelTime} · confidence ${comparison.successPrediction.confidenceScore}/100`
    const url = `${window.location.origin}/results?q=${encodeURIComponent(comparison.route)}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'NONREVY itinerary', text: summary, url })
        setCompareStatus('Share sheet opened.')
        return
      }
      await navigator.clipboard.writeText(`${summary}\n${url}`)
      setCompareStatus('Itinerary link copied.')
    } catch {
      setCompareStatus('Share was canceled.')
    }
  }

  function openLoadRequestForm(comparison: ItineraryComparison) {
    setSelectedComparisonId(comparison.id)
    setDetailsOpen(comparison.id, true)
    setActiveLoadRequestId(activeLoadRequestId === comparison.id ? '' : comparison.id)
    setActiveCommunityLoadId('')
    setCommunityLoadForm(initialCommunityLoadForm(comparison, travelDate))
    setCommunityLoadStatus('Flight and date are prefilled. Tap Submit Request to ask the community for this load.')
  }

  function submitLoadRequest(comparison: ItineraryComparison) {
    const routeAirports = communityRouteAirports(comparison.route)
    const flightNumber = communityLoadForm.flightNumber || comparison.flightNumber
    const date = communityLoadForm.date || itineraryLoadDate(comparison, travelDate)
    if (!flightNumber.trim() || !date) {
      setCommunityLoadStatus('Flight number and date are required before requesting a load.')
      return
    }
    const saved = saveCommunityLoadRequest({
      flightNumber,
      carrier: comparison.carrier,
      route: comparison.route,
      origin: routeAirports.origin,
      destination: routeAirports.destination,
      date
    })
    if (saved) {
      setActiveLoadRequestId('')
      setCommunityLoadStatus(`Load requested for ${saved.flightNumber} on ${saved.date}.`)
    }
  }

  function openCommunityLoadForm(comparison: ItineraryComparison) {
    setSelectedComparisonId(comparison.id)
    setDetailsOpen(comparison.id, true)
    setActiveCommunityLoadId(activeCommunityLoadId === comparison.id ? '' : comparison.id)
    setActiveLoadRequestId('')
    setCommunityLoadForm(initialCommunityLoadForm(comparison, travelDate))
    setCommunityLoadStatus('Fast Submit Load is ready. Required fields are flight, date, seats, and standby count.')
  }

  function updateCommunityLoadForm(field: keyof CommunityLoadFormState, value: string) {
    setCommunityLoadForm((current) => ({ ...current, [field]: value }))
  }

  function submitCommunityLoad(event: FormEvent<HTMLFormElement>, comparison: ItineraryComparison) {
    event.preventDefault()
    const availableSeats = Number(communityLoadForm.availableSeats)
    const standbyCount = Number(communityLoadForm.standbyCount)
    if (!communityLoadForm.flightNumber.trim() || !communityLoadForm.date || !Number.isFinite(availableSeats) || !Number.isFinite(standbyCount)) {
      setCommunityLoadStatus('Flight number, date, available seats, and standby count are required.')
      return
    }

    const routeAirports = communityRouteAirports(comparison.route)
    const contributor = loadCommunityContributorReputation()
    const saved = saveCommunityLoadReport({
      flightNumber: communityLoadForm.flightNumber,
      carrier: comparison.carrier,
      route: comparison.route,
      origin: routeAirports.origin,
      destination: routeAirports.destination,
      date: communityLoadForm.date,
      availableSeats,
      standbyCount,
      cabin: communityLoadForm.cabin,
      notes: communityLoadForm.notes,
      contributorId: contributor.contributorId
    })

    if (saved) {
      onCommunityLoadsUpdated()
      setActiveCommunityLoadId('')
      setCommunityLoadForm(initialCommunityLoadForm(comparison, travelDate))
      setCommunityLoadStatus(`Community load saved: ${saved.availableSeats} available • ${saved.standbyCount} standby · trust ${saved.sourceTrustScore}/100.`)
    }
  }

  function markCommunityLoad(report: CommunityLoadReport, status: CommunityLoadValidationStatus) {
    validateCommunityLoadReport(report.id, status)
    onCommunityLoadsUpdated()
    setCommunityLoadStatus(`Marked report ${status.toLowerCase()}. Contributor trust signal updated locally.`)
  }

  function removeComparison(id: string) {
    setSavedComparisons(removeSavedItineraryComparison(id))
    setCompareStatus('Removed saved itinerary option.')
  }

  function clearComparisons() {
    setSavedComparisons(clearSavedItineraryComparisons())
    setCompareStatus('Cleared saved itinerary comparisons.')
  }

  function setDetailsOpen(id: string, open: boolean) {
    setExpandedDetailIds((current) => {
      if (open && !current.includes(id)) return [...current, id]
      if (!open && current.includes(id)) return current.filter((item) => item !== id)
      return current
    })
  }

  function openDetails(comparison: ItineraryComparison) {
    setSelectedComparisonId(comparison.id)
    setDetailsOpen(comparison.id, true)
  }

  const compactItineraries = sortCompactItineraries(comparisons)
    .map(comparisonWithDisplayRouteIntegrity)
    .map(ensureRouteFrameworkLabels)
  const topRouteItineraries = compactItineraries.slice(0, 5)
  const moreRouteItineraries = sortMoreRouteItineraries(compactItineraries.slice(5))
  const routeInsights = buildRouteIntelligenceInsights(compactItineraries)

function searchTrustReceiptTone(dataMode: string, debug: ItineraryDebugMetadata | null) {
  const normalizedMode = dataMode.toLowerCase()
  if (debug?.trueLiveDataAvailable || normalizedMode.includes('live provider')) {
    return {
      label: 'Live data checked',
      color: '#22c55e',
      border: 'rgba(34, 197, 94, 0.42)',
      background: 'rgba(20, 83, 45, 0.20)',
      message: 'Rankings are using current provider data where available. Still verify final loads before leaving for the airport.'
    }
  }
  if (normalizedMode.includes('stored supabase')) {
    return {
      label: 'Stored schedule data',
      color: '#38bdf8',
      border: 'rgba(56, 189, 248, 0.40)',
      background: 'rgba(8, 47, 73, 0.24)',
      message: 'Rankings use stored schedule rows and local signals. Treat load confidence as planning guidance until a fresh load is confirmed.'
    }
  }
  if (normalizedMode.includes('no current')) {
    return {
      label: 'No live rows shown',
      color: '#facc15',
      border: 'rgba(250, 204, 21, 0.42)',
      background: 'rgba(113, 63, 18, 0.24)',
      message: 'No current live itinerary data is confirmed for this search. Use alternate dates, broader carrier scope, or request a load.'
    }
  }
  if (normalizedMode.includes('demo') || normalizedMode.includes('test') || normalizedMode.includes('nearest')) {
    return {
      label: 'Testing data',
      color: '#f472b6',
      border: 'rgba(244, 114, 182, 0.42)',
      background: 'rgba(131, 24, 67, 0.22)',
      message: 'These rows may include testing or nearest-date data. Useful for beta QA, not airport-day decisions.'
    }
  }
  return {
    label: 'Planning guidance',
    color: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.30)',
    background: 'rgba(15, 23, 42, 0.72)',
    message: 'Use these rankings as planning guidance and verify critical load details before travel.'
  }
}

function SearchTrustReceipt({ dataMode, source, status, warnings, debug }: SearchTrustReceiptProps) {
  const tone = searchTrustReceiptTone(dataMode, debug)
  const providerNote = debug?.trueLiveDataAvailable
    ? 'Current provider API data confirmed for this result set.'
    : debug?.trueLiveDataUnavailableReason || 'Provider availability details are kept in diagnostics.'
  const freshnessNotes = debug?.dataFreshnessExplanation || []
  const pipelineNotes = [...new Set([...warnings, ...freshnessNotes, ...(debug?.providerExplanation || [])])].slice(0, 6)

  return (
    <aside className="nonrevy-search-trust-receipt" style={{ borderColor: tone.border, background: tone.background }} aria-label="Search result trust summary">
      <div className="nonrevy-search-trust-receipt__topline">
        <strong style={{ color: tone.color }}>{tone.label}</strong>
        <span>{dataMode}</span>
      </div>
      <p>{tone.message}</p>
      <details>
        <summary>Trust details</summary>
        <ul>
          <li>Source: {source}</li>
          <li>Status: {status}</li>
          <li>{providerNote}</li>
          {pipelineNotes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </details>
    </aside>
  )
}

function renderFlightBoardRow(comparison: ItineraryComparison, showPlanB = false) {
    const index = compactItineraries.findIndex((item) => item.id === comparison.id)
    const rankIndex = index >= 0 ? index : 0
    const nextBackup = compactItineraries[index + 1] || compactItineraries.find((item) => item.id !== comparison.id)
    const scoreColor = trafficLightScoreColor(comparison.successPrediction.confidenceScore)
    const routeAirports = airportCodesFromComparisonRoute(comparison.route)
    const legCount = comparison.connections + 1
    const isSelected = selectedComparisonId === comparison.id
    const isExpanded = expandedDetailIds.includes(comparison.id)
    const carrierCode = compactCarrierCode(comparison.carrier, comparison.flightNumber)
    const airlineName = airlineNameForCarrier(comparison.carrier, carrierCode)
    const flightNumber = compactFlightNumberLabel(comparison.flightNumber, carrierCode)
    const depTime = compactFlightBoardTime(comparison.departureDateTime, routeAirports[0])
    const arrTime = compactFlightBoardTime(comparison.arrivalDateTime, routeAirports[routeAirports.length - 1])
    const arrivalOffset = flightBoardDayOffset(comparison.arrivalDateTime, comparison.departureDateTime)
    const arrivalDisplay = arrTime.replace(/ \+\d+$/, '')
    const confidenceScore = comparison.successPrediction.confidenceScore
    const legDisplays = itineraryCardLegDisplays(comparison)
    const hasPrimaryFlightId = comparison.dataFreshnessRule !== 'route-framework' && !isMissingLiveLegDetail(comparison.carrier) && !isMissingLiveLegDetail(comparison.flightNumber)
    const durationLabel = isMissingLiveLegDetail(comparison.totalTravelTime) ? 'Live details unavailable.' : compactDurationLabel(comparison.totalTravelTime)
    const communityLoad = communityLoadSummaryForItinerary(communityLoads, { flightNumber: comparison.flightNumber, route: comparison.route, date: travelDate.trim() || undefined })
    const communityIntelligence = comparison.communityIntelligence || communityLoadIntelligenceForItinerary(communityLoads, { flightNumber: comparison.flightNumber, route: comparison.route, date: itineraryLoadDate(comparison, travelDate) || undefined })
    const communityLoadRowText = communityLoadCompactRowText(communityIntelligence)
    const latestCommunityLoad = communityIntelligence?.latestReport || communityLoad.latestReport
    const submitLoadOpen = activeCommunityLoadId === comparison.id
    const requestLoadOpen = activeLoadRequestId === comparison.id
    const contributor = loadCommunityContributorReputation()
    const scoreLabel = trafficLightScoreLabel(confidenceScore)
    const routeRecommendation = routeRecommendationTitle(comparison, compactItineraries)
    const whyRouteReasons = routeExplanationReasons(comparison, compactItineraries)

    return (
      <article
        key={`row-${comparison.id}`}
        className={`nonrevy-flight-board-row ${isSelected ? 'nonrevy-flight-board-row--selected' : ''}`}
        style={{ '--score-color': scoreColor, '--confidence-color': scoreColor } as CSSProperties}
        onClick={() => openDetails(comparison)}
      >
        <div className="nonrevy-flight-board-row__main">
          <div className="nonrevy-flight-board-row__content" aria-label={`${comparison.route} ${legDisplays.map((leg) => `${leg.route}: ${leg.detail}`).join(' ')} ${depTime} to ${arrTime} ${compactStopsLabel(comparison.connections)} ${comparison.totalTravelTime} ${scoreLabel}`}>
            <div className="nonrevy-flight-board-row__flight-data">
              <div className="nonrevy-flight-board-row__primary-line">
                <span className="nonrevy-flight-board-row__route">{comparison.route}</span>
                <span className="nonrevy-flight-board-row__score" title={`${scoreLabel} itinerary signal`}>{scoreLabel}</span>
              </div>
              {hasPrimaryFlightId ? (
                <div className="nonrevy-flight-board-row__airline-line" title={`${airlineName} ${carrierCode}${flightNumber}`} aria-label={`${airlineName} ${carrierCode}${flightNumber}`}>
                  <span className="nonrevy-flight-board-row__airline-name">{airlineName}</span>
                  <strong className="nonrevy-flight-board-row__flight-number">{carrierCode}{flightNumber}</strong>
                </div>
              ) : <div className="nonrevy-flight-board-row__airline-line nonrevy-flight-board-row__availability">Live details unavailable.</div>}
              <div className="nonrevy-flight-board-row__time-line" aria-label={`Depart ${depTime}, arrive ${arrivalDisplay}`}>
                <strong className="nonrevy-flight-board-row__time-value">{depTime}</strong>
                <span className="nonrevy-flight-board-row__time-arrow" aria-hidden="true">→</span>
                <strong className="nonrevy-flight-board-row__time-value">{arrivalDisplay}{arrivalOffset > 0 ? <span className="nonrevy-flight-board-row__overnight">+{arrivalOffset}</span> : null}</strong>
              </div>
              <div className="nonrevy-flight-board-row__secondary-line">
                <span className="nonrevy-flight-board-row__stops">{compactStopsLabel(comparison.connections)}</span>
                <span className="nonrevy-flight-board-row__duration">{durationLabel}</span>
                {comparison.dataFreshnessRule === 'route-framework'
                  ? <span className="nonrevy-flight-board-row__availability">Live time unavailable</span>
                  : null}
              </div>
            </div>

          </div>
        </div>

        <ItineraryIntelligenceSummary comparison={comparison} recommendation={routeRecommendation} reasons={whyRouteReasons} />

        {showPlanB ? <PlanBItinerarySection comparison={comparison} comparisons={compactItineraries} /> : null}

        <details open={isExpanded} onToggle={(event) => setDetailsOpen(comparison.id, event.currentTarget.open)} className="nonrevy-flight-board-row__details" onClick={(event) => event.stopPropagation()}>
          <summary>Details</summary>
          <div className="nonrevy-flight-row__detail-grid">
            <section className="nonrevy-flight-board-row__detail-actions">
              <strong>Actions</strong>
              <div className="nonrevy-flight-board-row__actions nonrevy-flight-board-row__actions--details">
                <button type="button" onClick={() => openCommunityLoadForm(comparison)} title="Submit Load" aria-label="Submit community load">＋</button>
                <button type="button" onClick={() => openLoadRequestForm(comparison)} title="Request load" aria-label="Request load">Load</button>
                <button type="button" onClick={() => saveForComparison(comparison)} title="Save" aria-label="Save itinerary">☆</button>
                </div>
            </section>
            <section>
              <strong>{compactRankingLabel(rankIndex, comparison)}</strong>
              <p>{comparison.whyThisRoute || plainEnglishRationale(comparison, rankIndex)}</p>
              {comparison.topRouteWhy?.length ? (
                <ul>
                  {comparison.topRouteWhy.map((reason) => <li key={`${comparison.id}-top-route-${reason}`}>{reason}</li>)}
                </ul>
              ) : null}
              <CompactRouteConfidenceLine confidence={comparison.routeConfidence} />
              <CommunitySignalLine signal={comparison.communitySignal} />
              <HistoricalReliabilityLine reliability={comparison.historicalReliability} />
              <CommercialAvailabilitySection signal={comparison.sellableSeatSignal} />
              <RecoverySummarySection recovery={comparison.recovery} />
              <DoorToDoorPlanSection plan={comparison.endToEnd} />
              <ItineraryIntelligenceDetailPanel comparison={comparison} backup={nextBackup} />
            </section>
            <section className="nonrevy-community-loads">
              <strong>Community Loads</strong>
              {communityIntelligence ? (
                <div className="nonrevy-community-loads__card nonrevy-community-loads__card--intelligence">
                  <div className="nonrevy-community-loads__card-head">
                    <strong>Community Intelligence</strong>
                    <span className={communityFreshnessClass(communityIntelligence.freshness)}>{communityIntelligence.freshness}</span>
                  </div>
                  <p className="nonrevy-community-loads__counts">{communityIntelligence.averageAvailableSeats ?? '—'} Open • {communityIntelligence.averageStandbyCount ?? '—'} Listed</p>
                  {communityLoadRowText ? <p className="nonrevy-community-loads__compact-confidence">{communityLoadRowText}</p> : null}
                  <p className="nonrevy-community-loads__compact-confidence">{communityIntelligence.reportCount} Report{communityIntelligence.reportCount === 1 ? '' : 's'} · {communityIntelligence.communityConfidence} Confidence · {Math.round(communityIntelligence.scoringWeight * 100)}% scoring weight</p>
                  <p>Confidence {communityIntelligence.confidenceScore}/100 · Agreement {communityIntelligence.agreementScore}/100 · Freshness {communityIntelligence.freshnessScore}/100</p>
                  <div className="nonrevy-community-loads__why">
                    <strong>Load Impact</strong>
                    <ul>
                      {communityIntelligence.loadImpactExplanation.map((reason) => <li key={`${comparison.id}-load-impact-${reason}`}>{reason}</li>)}
                    </ul>
                  </div>
                  {communityIntelligence.outlierReportIds.length ? <p>{communityIntelligence.outlierReportIds.length} outlier report{communityIntelligence.outlierReportIds.length === 1 ? '' : 's'} down-weighted.</p> : null}
                  <div className="nonrevy-community-loads__why">
                    <strong>Why community confidence</strong>
                    <ul>
                      {communityIntelligence.explanation.map((reason) => <li key={`${comparison.id}-community-intelligence-${reason}`}>{reason}</li>)}
                    </ul>
                  </div>
                  {latestCommunityLoad?.validationStatus ? <p>Latest validation: {latestCommunityLoad.validationStatus}</p> : null}
                  {latestCommunityLoad ? (
                    <div className="nonrevy-community-loads__validation" aria-label="Validate community load report">
                      {(['Confirmed', 'Outdated', 'Inaccurate'] as CommunityLoadValidationStatus[]).map((status) => (
                        <button key={`${latestCommunityLoad.id}-${status}`} type="button" onClick={() => markCommunityLoad(latestCommunityLoad, status)}>{status}</button>
                      ))}
                    </div>
                  ) : null}
                  {communityIntelligence.cabin && communityIntelligence.cabin !== 'ANY' ? <p>Cabin: {communityIntelligence.cabin}</p> : null}
                  {latestCommunityLoad?.notes ? <p>Latest notes: {latestCommunityLoad.notes}</p> : null}
                </div>
              ) : latestCommunityLoad ? (
                <div className="nonrevy-community-loads__card">
                  <p><strong>Community Load</strong> {latestCommunityLoad.availableSeats} Open • {latestCommunityLoad.standbyCount} Listed</p>
                  <p>{relativeCommunityLoadTime(latestCommunityLoad.createdAt)} · Trust {communityLoad.averageTrustScore || latestCommunityLoad.sourceTrustScore} · {communityLoad.reportCount} Report{communityLoad.reportCount === 1 ? '' : 's'}</p>
                </div>
              ) : (
                <p>No community load reports yet for this itinerary.</p>
              )}
              <div className="nonrevy-community-loads__quick-actions">
                <button type="button" className="nonrevy-community-loads__submit-toggle" onClick={() => openLoadRequestForm(comparison)}>{requestLoadOpen ? 'Close Request' : 'Request Load'}</button>
                <button type="button" className="nonrevy-community-loads__submit-toggle nonrevy-secondary-action" onClick={() => openCommunityLoadForm(comparison)}>{submitLoadOpen ? 'Close Submit' : 'Community reports'}</button>
              </div>
              {requestLoadOpen ? (
                <div className="nonrevy-community-loads__request">
                  <strong>Request Load</strong>
                  <p>{communityLoadForm.flightNumber || comparison.flightNumber} · {communityLoadForm.date || itineraryLoadDate(comparison, travelDate) || 'Date needed'} · {comparison.route}</p>
                  <button type="button" onClick={() => submitLoadRequest(comparison)}>Submit Request</button>
                </div>
              ) : null}
              {submitLoadOpen ? (
                <form className="nonrevy-community-loads__form" onSubmit={(event) => submitCommunityLoad(event, comparison)}>
                  <label>
                    Flight number
                    <input value={communityLoadForm.flightNumber} onChange={(event) => updateCommunityLoadForm('flightNumber', event.target.value.toUpperCase())} required />
                  </label>
                  <label>
                    Date
                    <input type="date" value={communityLoadForm.date} onChange={(event) => updateCommunityLoadForm('date', event.target.value)} required />
                  </label>
                  <label>
                    Available seats
                    <input type="number" min="0" value={communityLoadForm.availableSeats} onChange={(event) => updateCommunityLoadForm('availableSeats', event.target.value)} required />
                  </label>
                  <label>
                    Standby count
                    <input type="number" min="0" value={communityLoadForm.standbyCount} onChange={(event) => updateCommunityLoadForm('standbyCount', event.target.value)} required />
                  </label>
                  <label>
                    Cabin optional
                    <input value={communityLoadForm.cabin} onChange={(event) => updateCommunityLoadForm('cabin', event.target.value)} placeholder="Economy, Premium, Polaris…" />
                  </label>
                  <label>
                    Notes optional
                    <textarea value={communityLoadForm.notes} onChange={(event) => updateCommunityLoadForm('notes', event.target.value)} rows={2} placeholder="Gate note, timing, upgrade context…" />
                  </label>
                  <button type="submit">Save Community Load</button>
                </form>
              ) : null}
              <div className="nonrevy-community-loads__profile">
                <strong>Contributor Profile</strong>
                <span>{contributor.totalReports} Reports Submitted</span>
                <span>Trust Score {contributor.trustScore}/100 · {contributor.trustLevel}</span>
                <span>{contributor.confirmedValidations} Confirmed · {contributor.outdatedValidations} Outdated · {contributor.inaccurateValidations} Inaccurate</span>
                <span>{communityContributorTrustBreakdown(contributor).explanation[0]}</span>
              </div>
              <p className="nonrevy-community-loads__status">{communityLoadStatus}</p>
            </section>
            <section>
              <strong>Trust-first score details</strong>
              <p><strong>Overall score:</strong> {comparison.nextGenSuccess.score}/100 · <strong>Success:</strong> {comparison.successPrediction.displayValue} · <strong>Confidence:</strong> {comparison.successPrediction.confidenceBadge} ({comparison.successPrediction.confidenceScore}/100)</p>
              <p><strong>Top positives:</strong> {comparison.nextGenSuccess.topPositiveFactors.map((factor) => factor.detail).join(' · ')}</p>
              <p><strong>Top risk:</strong> {comparison.nextGenSuccess.topRiskFactor.detail}</p>
              <p><strong>Load:</strong> {rowLoadIntelligenceLabel(comparison)}</p>
              <details className="nonrevy-premium-details" style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617', marginTop: 10 }}>
                <summary style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}>Personal Success Predictor</summary>
                <p><strong>Estimated Success:</strong> {comparison.personalSuccessPrediction.probability}% · <strong>Confidence:</strong> {comparison.personalSuccessPrediction.confidence}</p>
                <strong>Why:</strong>
                <ul>
                  {comparison.personalSuccessPrediction.why.map((reason) => <li key={`${comparison.id}-personal-${reason}`}>{reason}</li>)}
                </ul>
              </details>
              {comparison.nextGenSuccess.communityIntelligenceImpact ? <p><strong>Community scoring:</strong> {comparison.nextGenSuccess.communityIntelligenceImpact.reportCount} report{comparison.nextGenSuccess.communityIntelligenceImpact.reportCount === 1 ? '' : 's'} blended at up to {comparison.nextGenSuccess.communityIntelligenceImpact.maxWeight}% of score · base {comparison.nextGenSuccess.communityIntelligenceImpact.baseScore}/100 → community-adjusted {comparison.nextGenSuccess.communityIntelligenceImpact.blendedScore}/100.{comparison.nextGenSuccess.communityIntelligenceImpact.scoreCap ? ` Score capped at ${comparison.nextGenSuccess.communityIntelligenceImpact.scoreCap} by load margin guardrails.` : ''}</p> : null}
              {communityIntelligence ? <p>{communityLoadImpactSummary(communityIntelligence)}</p> : null}
              <p>{comparison.successPrediction.loadExplanation}</p>
              <p>{comparison.successPrediction.confidenceExplanation}</p>
              {comparison.loadSupport.source ? <p>Load source: {comparison.loadSupport.source}</p> : null}
              <div className="nonrevy-flight-board-row__confidence-factors">
                <strong>Confidence Factors:</strong>
                <ul>
                  {compactConfidenceFactors(comparison).map((reason) => <li key={`${comparison.id}-confidence-${reason}`}>{reason}</li>)}
                </ul>
              </div>
              <ScoringExplanationDetails comparison={comparison} backup={nextBackup} />
            </section>

            <section>
              <strong>Aircraft/details</strong>
              <p>{comparison.aircraftDetails}</p>
              <p>Duration {comparison.totalTravelTime} · {legCount} leg{comparison.connections === 0 ? '' : 's'} · {comparison.airportIntelligence.connectionRiskScore}/100 connection risk</p>
              <ItineraryRouteMap route={comparison.route} />
              <RouteAirportDetails route={comparison.route} />
            </section>

            <section>
              <strong>Source/data freshness</strong>
              <p>{comparison.sourceDetails}</p>
              {comparison.marketingFlightNumbers?.length ? <p><strong>Marketing/codeshare numbers:</strong> {comparison.marketingFlightNumbers.join(', ')}</p> : null}
              <div className="nonrevy-flight-row__badges">
                {comparison.providerBadges.slice(0, 4).map((badge) => <ProviderBadge key={`${comparison.id}-${badge}`} label={badge} />)}
                <WeatherRiskBadge weatherRisk={comparison.weatherRisk} />
              </div>
              <p>{comparison.communityReportSummary}</p>
              <OutcomeCapture subjectType="route-recommendation" subjectId={`comparison-${comparison.id}`} title={`Planner recommendation ${comparison.route}`} route={comparison.route} />
            </section>
          </div>
        </details>

        <div className="nonrevy-flight-board-row__actions nonrevy-primary-actions" onClick={(event) => event.stopPropagation()} aria-label="Itinerary actions">
          <button className="nonrevy-primary-action nonrevy-primary-action--request-loads" type="button" onClick={() => openLoadRequestForm(comparison)} title="Request Load" aria-label="Request load">Request Load</button>
          <button className="nonrevy-row-action-pill" type="button" onClick={() => saveForComparison(comparison)} title="Save" aria-label="Save itinerary">Save</button>
          <button className="nonrevy-row-action-pill" type="button" onClick={() => void shareItinerary(comparison)} title="Share" aria-label="Share itinerary">Share</button>
        </div>
      </article>
    )
  }

  return (
    <section className="nonrevy-results-shell nonrevy-compact-results nonrevy-flight-board" style={{ border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: 14, padding: 'clamp(6px, 2vw, 10px)', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.86))', marginBottom: 16 }}>
      <div className="nonrevy-flight-board__header">
        <strong>{title}</strong>
        {moreRouteItineraries.length ? <span>{moreRouteItineraries.length} more route{moreRouteItineraries.length === 1 ? '' : 's'}</span> : null}
      </div>

      {compareStatus && <p className="nonrevy-compact-results__status nonrevy-compact-results__status--save">{compareStatus}</p>}

      <div className="nonrevy-flight-board__list" aria-label="Top 5 route options">
        {topRouteItineraries.map((comparison) => renderFlightBoardRow(comparison, true))}
      </div>

      {moreRouteItineraries.length ? (
        <details className="nonrevy-more-routes" style={{ marginTop: 8, border: '1px solid #334155', borderRadius: 10, padding: 8, background: '#020617' }}>
          <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>{moreTitle} ▼</summary>
          <p style={{ color: '#94a3b8', margin: '8px 0' }}>Routes 6+ stay sorted by earliest available arrival time. Route frameworks without live times are labeled “Live time unavailable.”</p>
          <div className="nonrevy-flight-board__list" aria-label="More route options">
            {moreRouteItineraries.map((comparison) => renderFlightBoardRow(comparison))}
          </div>
        </details>
      ) : null}

      <details className="nonrevy-premium-details" style={{ marginTop: 8, border: '1px solid #334155', borderRadius: 10, padding: 8, background: '#020617' }}>
        <summary style={{ color: '#c084fc', cursor: 'pointer', fontWeight: 'bold' }}>Advanced sections</summary>
        <details className="nonrevy-premium-details" style={{ marginTop: 8 }}>
          <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Diagnostics</summary>
          <SearchTrustReceipt {...trustReceipt} />
        </details>
        <details className="nonrevy-premium-details" style={{ marginTop: 8 }}>
          <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Provider details</summary>
          <p style={{ color: '#cbd5e1' }}>Source: {trustReceipt.source}</p>
          <p style={{ color: '#cbd5e1' }}>Status: {trustReceipt.status}</p>
        </details>
        <details className="nonrevy-premium-details" style={{ marginTop: 8 }}>
          <summary className="nonrevy-secondary-action" style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Route intelligence</summary>
          <RouteIntelligenceSection insights={routeInsights} />
        </details>
        <details className="nonrevy-premium-details" style={{ marginTop: 8 }}>
          <summary className="nonrevy-secondary-action" style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Recovery guidance</summary>
          <p style={{ color: '#cbd5e1' }}>Recovery guidance is separated from Top Routes so positioning and recovery moves are not presented as ranked itineraries.</p>
          {topRouteItineraries.slice(0, 3).map((comparison) => (
            <section key={`${comparison.id}-recovery-guidance`} style={{ marginTop: 8 }}>
              <strong>{comparison.route}</strong>
              <p style={{ color: '#cbd5e1' }}>{keyRiskNote(comparison)}</p>
              <RecoveryStrategySection comparison={comparison} comparisons={compactItineraries} />
            </section>
          ))}
        </details>
        <details className="nonrevy-premium-details" style={{ marginTop: 8 }}>
          <summary className="nonrevy-secondary-action" style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Nearby airports</summary>
          <AirportIntelligenceSection comparisons={compactItineraries} />
        </details>
        <details className="nonrevy-premium-details" style={{ marginTop: 8 }}>
          <summary className="nonrevy-secondary-action" style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Historical trends</summary>
          {trustReceipt.debug?.historicalIntelligence ? (
            <p style={{ color: '#cbd5e1' }}>Historical success {trustReceipt.debug.historicalIntelligence.historicalSuccess.score}/100 · confidence {trustReceipt.debug.historicalIntelligence.historicalSuccess.confidence}/100 · sample size {trustReceipt.debug.historicalIntelligence.historicalSuccess.sampleSize}.</p>
          ) : (
            <p style={{ color: '#cbd5e1' }}>Historical data is not available for this search.</p>
          )}
        </details>
        <details className="nonrevy-premium-details" style={{ marginTop: 8 }}>
          <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Copilot settings</summary>
          <p style={{ color: '#cbd5e1' }}>Copilot and operator controls stay hidden unless operator tools are enabled.</p>
        </details>
        <details className="nonrevy-premium-details" style={{ marginTop: 8 }}>
          <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Confidence factors</summary>
          <RouteConfidenceSection comparisons={compactItineraries} />
          <WeatherIntelligenceSection comparisons={compactItineraries} />
          <DisruptionIntelligenceSection comparisons={compactItineraries} />
        </details>
      </details>

      <details className="nonrevy-premium-details" style={{ border: '1px solid #334155', borderRadius: 10, padding: 8, background: '#020617', marginTop: 8 }}>
        <summary style={{ color: '#c084fc', cursor: 'pointer', fontWeight: 'bold' }}>Saved itinerary comparison</summary>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <p style={{ color: '#94a3b8', margin: 0 }}>Saved locally in this browser for side-by-side planning.</p>
          {savedComparisons.length > 0 && <button type="button" onClick={clearComparisons} style={{ padding: '7px 9px', borderRadius: 9, border: '1px solid #475569', background: '#0f172a', color: '#f8fafc', fontWeight: 'bold' }}>Clear saved comparisons</button>}
        </div>
        {savedComparisons.length === 0 ? (
          <p style={{ color: '#cbd5e1' }}>No saved itinerary options yet. Use Save on any row.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {savedComparisons.map((item) => (
              <article key={item.id} style={{ border: '1px solid #334155', borderRadius: 10, padding: 8, background: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <p style={{ color: '#cbd5e1', margin: 0 }}>{item.carrier} · {item.route} · Saved score {item.successProbability}% · {item.totalTravelTime}</p>
                  <button type="button" onClick={() => removeComparison(item.id)} style={{ padding: '6px 8px', borderRadius: 9, border: '1px solid #f87171', background: '#1f2937', color: '#fecaca', fontWeight: 'bold' }}>Remove</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </details>
    </section>
  )
}

export function PlanPage({ compactResultsMode = false }: { compactResultsMode?: boolean } = {}) {
  const [tripGoal, setTripGoal] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [travelWindow, setTravelWindow] = useState('')
  const [travelDateError, setTravelDateError] = useState('')
  const [travelerCount, setTravelerCount] = useState('1')
  const [maxLegs, setMaxLegs] = useState('2')
  const [carrier, setCarrier] = useState('all')
  const [personalTestingMode, setPersonalTestingMode] = useState(false)
  const [nearestDateToleranceDays, setNearestDateToleranceDays] = useState('45')
  const [voiceStatus, setVoiceStatus] = useState('Voice capture scaffold ready.')
  const [submitted, setSubmitted] = useState(false)
  const [itineraryStatus, setItineraryStatus] = useState('Enter an itinerary request to search live flight data.')
  const [itineraryLoading, setItineraryLoading] = useState(false)
  const [liveItineraries, setLiveItineraries] = useState<LiveItineraryResult[]>([])
  const [frameworkRoutes, setFrameworkRoutes] = useState<LiveItineraryResult[]>([])
  const [itineraryWarnings, setItineraryWarnings] = useState<string[]>([])
  const [itinerarySource, setItinerarySource] = useState('FlightAware live schedules')
  const [itineraryDataMode, setItineraryDataMode] = useState('Awaiting live search')
  const [itineraryDebug, setItineraryDebug] = useState<ItineraryDebugMetadata | null>(null)
  const [query, setQuery] = useState('')
  const [flights, setFlights] = useState<any[]>([])
  const [lastUpdated, setLastUpdated] = useState('')
  const [travelerProfile, setTravelerProfile] = useState(defaultTravelerProfile)
  const [loadReports, setLoadReports] = useState<LoadReport[]>([])
  const [communityLoads, setCommunityLoads] = useState<CommunityLoadReport[]>([])
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [routeConfidenceScores, setRouteConfidenceScores] = useState<number[]>([])
  const [confidenceUpdateTrigger, setConfidenceUpdateTrigger] = useState<ConfidenceUpdateTrigger>('local-signal-refresh')
  const [aiTripPrompt, setAiTripPrompt] = useState('get me to Maui this weekend')
  const [aiPlannerStatus, setAiPlannerStatus] = useState('AI planner scaffold ready for natural language trip requests.')
  const [copilotPrompt, setCopilotPrompt] = useState('Get me to Tokyo tomorrow.')
  const [copilotStatus, setCopilotStatus] = useState('Copilot ready. Ask for a route, cabin, risk preference, or backup strategy.')
  const [developerMode, setDeveloperMode] = useState(false)
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
    const operatorMode = ['1', 'true', 'yes'].includes((params.get('operator') || params.get('developer') || params.get('debug') || '').toLowerCase()) || window.localStorage.getItem('nonrevyDeveloperMode') === 'true'
    setDeveloperMode(operatorMode)
    const initialQuery = params.get('q') || ''
    const initialAiTrip = params.get('aiTrip') || ''
    const initialDate = params.get('date') || ''
    if (initialDate) setTravelWindow(initialDate)
    setQuery(initialQuery || initialAiTrip)
    if (initialAiTrip) {
      setAiTripPrompt(initialAiTrip)
      setCopilotPrompt(initialAiTrip)
      setTripGoal(initialAiTrip)
      setAiPlannerStatus('AI trip planner scaffold parsed your homepage request.')
      setCopilotStatus('Copilot parsed your homepage request and refreshed planner recommendations.')
      runItinerarySearch(initialAiTrip, { travelWindow: initialDate })
    } else if (initialQuery) {
      setTripGoal(initialQuery)
      setCopilotPrompt(initialQuery)
      setCopilotStatus('Copilot loaded your search into the planner.')
      runItinerarySearch(initialQuery, { travelWindow: initialDate })
    }
  }, [])

  useEffect(() => {
    function refreshLocalScaffolds(trigger: ConfidenceUpdateTrigger = 'local-signal-refresh') {
      setConfidenceUpdateTrigger(trigger)
      setTravelerProfile(loadTravelerProfileFromStorage())
      setLoadReports(loadLoadReports())
      setCommunityLoads(loadCommunityLoads())
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
    window.addEventListener('nonrevy-community-loads-updated', refreshForLoadReports)
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshForOutcomes)
    window.addEventListener('nonrevy-weather-risk-updated', refreshForWeather)
    window.addEventListener('nonrevy-disruption-status-updated', refreshForDisruption)
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refreshForLocal)
    window.addEventListener('nonrevy-watchlist-updated', refreshForLocal)
    window.addEventListener('storage', refreshForLocal)
    return () => {
      window.removeEventListener('nonrevy-load-reports-updated', refreshForLoadReports)
      window.removeEventListener('nonrevy-community-loads-updated', refreshForLoadReports)
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
        setFlights([])
        setLastUpdated(`${new Date().toLocaleTimeString()} · no live provider rows`)
        return
      }

      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/flights?select=*&order=created_at.desc&limit=100`,
          { headers: { apikey: supabaseKey } }
        )
        const data = await res.json()
        setFlights(Array.isArray(data) && data.length ? data.filter((flight) => !String(flight.id || '').startsWith('demo-') && !String(flight.source_provider || flight.sourceProvider || '').toLowerCase().includes('demo')) : [])
        setLastUpdated(`${new Date().toLocaleTimeString()}${Array.isArray(data) && data.length ? '' : ' · no live provider rows'}`)
      } catch {
        setFlights([])
        setLastUpdated(`${new Date().toLocaleTimeString()} · no live provider rows`)
      }
    }

    loadFlights()
    const refresh = window.setInterval(loadFlights, 30000)
    return () => window.clearInterval(refresh)
  }, [])

  async function runItinerarySearch(searchText: string, overrides: ItinerarySearchOverrides = {}) {
    const trimmedSearch = searchText.trim()
    const originAirport = (overrides.homeAirport ?? homeAirport).trim().toUpperCase()
    const parsedSearchDate = parseItineraryPrompt(trimmedSearch).date
    const requestedTravelWindow = (parsedSearchDate || overrides.travelWindow || travelWindow).trim()
    if (parsedSearchDate && parsedSearchDate !== travelWindow) setTravelWindow(parsedSearchDate)
    const requestedCarrier = overrides.carrier ?? carrier
    const requestedMaxLegs = overrides.maxLegs ?? maxLegs
    const dateError = validateTravelDate(requestedTravelWindow)

    if (dateError) {
      setTravelDateError(dateError)
      setLiveItineraries([])
      setFrameworkRoutes([])
      setItineraryDebug(null)
      setItineraryStatus(dateError)
      setItineraryDataMode('Awaiting valid date')
      return
    }
    setTravelDateError('')

    if (!trimmedSearch && !originAirport) {
      setLiveItineraries([])
      setFrameworkRoutes([])
      setItineraryDebug(null)
      setItineraryStatus('Enter an itinerary request to search live flight data.')
      setItineraryDataMode('Awaiting live search')
      return
    }

    setItineraryLoading(true)
    markActivationStep('runFirstTripPlan')
    setConfidenceUpdateTrigger('itinerary-search-run')
    setItineraryStatus('Searching live itinerary data…')
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
      const rawItineraries = Array.isArray(data?.itineraries) ? data.itineraries as LiveItineraryResult[] : []
      const rawFrameworkRoutes = Array.isArray(data?.frameworkRoutes) ? data.frameworkRoutes as LiveItineraryResult[] : []
      const itineraries = rawItineraries.filter(isProductionItinerary)
      const frameworkRouteResults = [...rawFrameworkRoutes, ...rawItineraries.filter(isFrameworkRoute)]
        .filter(isFrameworkRoute)
      setLiveItineraries(itineraries)
      setFrameworkRoutes(frameworkRouteResults)
      const apiWarnings = Array.isArray(data?.warnings) ? data.warnings : []
      setItineraryWarnings(data?.errorMessage ? [...new Set([...apiWarnings, data.errorMessage])] : apiWarnings)
      setItinerarySource(data?.sourceLabel || (data?.enrichedWithFlightAware ? 'Stored Supabase flight data + FlightAware enrichment' : 'Stored Supabase flight data'))
      setItineraryDataMode(data?.dataMode === 'route-frameworks'
        ? 'Route frameworks · live availability unavailable'
        : data?.dataMode === 'no-current-live-data'
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
      const routeCoverageSuggestions = Array.isArray(data?.routeCoverageSuggestions)
        ? data.routeCoverageSuggestions
        : Array.isArray(data?.debug?.routeCoverageSuggestions) ? data.debug.routeCoverageSuggestions : []
      setItineraryStatus(itineraries.length
        ? `${itineraries.length} live itinerary result${itineraries.length === 1 ? '' : 's'} found for ${data?.request?.origin || 'any origin'} → ${data?.request?.destination || 'any destination'}.`
        : frameworkRouteResults.length || routeCoverageSuggestions.length
          ? `Framework Routes available for ${data?.request?.origin || 'any origin'} → ${data?.request?.destination || 'any destination'}. Live schedule details unavailable.`
          : "We couldn't find live results for this search right now."
      )
    } catch {
      setLiveItineraries([])
      setFrameworkRoutes([])
      setItineraryDebug(null)
      setItineraryStatus("We couldn't find live results for this search right now.")
      setItineraryDataMode('No current live data')
      setItineraryWarnings(['Live results were unavailable for this search.'])
    } finally {
      setItineraryLoading(false)
    }
  }

  async function submitPlanRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    const parsedSearchDate = parseItineraryPrompt(tripGoal).date
    const effectiveTravelWindow = parsedSearchDate || travelWindow
    const dateError = validateTravelDate(effectiveTravelWindow)
    setTravelDateError(dateError)
    if (parsedSearchDate && parsedSearchDate !== travelWindow) setTravelWindow(parsedSearchDate)
    if (dateError) {
      setItineraryStatus(dateError)
      setItineraryDataMode('Awaiting valid date')
      return
    }
    if (tripGoal.trim()) {
      setQuery(tripGoal.trim())
      if (!compactResultsMode) {
        const params = new URLSearchParams({ q: tripGoal.trim() })
        if (effectiveTravelWindow.trim()) params.set('date', effectiveTravelWindow.trim())
        window.location.href = `/results?${params.toString()}`
        return
      }
      const params = new URLSearchParams({ q: tripGoal.trim() })
      if (effectiveTravelWindow.trim()) params.set('date', effectiveTravelWindow.trim())
      window.history.replaceState(null, '', `/results?${params.toString()}`)
    }
    await runItinerarySearch(tripGoal, { maxLegs: '2', travelWindow: effectiveTravelWindow })
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
    setFrameworkRoutes([])
    setItineraryDataMode('Awaiting live search')
    setItinerarySource('Live itinerary search')
    setItineraryStatus('Carrier scope updated. Add a route to search live itinerary data.')
  }

  function handleMaxLegsChange(nextMaxLegs: string) {
    setMaxLegs(nextMaxLegs)
    const currentSearch = (tripGoal || query).trim()
    if (currentSearch || homeAirport.trim()) {
      void runItinerarySearch(currentSearch, { maxLegs: nextMaxLegs })
      return
    }
    setLiveItineraries([])
    setFrameworkRoutes([])
    setItineraryDataMode('Awaiting live search')
    setItinerarySource('Live itinerary search')
    setItineraryStatus('Max legs updated. Add a route to search live itinerary data.')
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
    setCopilotPrompt(prompt)
    setSubmitted(true)
    const parsedSearchDate = parseItineraryPrompt(prompt).date
    if (parsedSearchDate) setTravelWindow(parsedSearchDate)
    setAiPlannerStatus('AI planner scaffold generated route guidance and refreshed itinerary results.')
    setCopilotStatus('Copilot is using the refreshed itinerary, route intelligence, and recovery results.')
    const params = new URLSearchParams({ aiTrip: prompt })
    if (parsedSearchDate) params.set('date', parsedSearchDate)
    if (!compactResultsMode) {
      window.location.href = `/results?${params.toString()}`
      return
    }
    window.history.replaceState(null, '', `/results?${params.toString()}`)
    await runItinerarySearch(prompt, { maxLegs: '2', travelWindow: parsedSearchDate || travelWindow })
  }

  async function submitCopilotPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = copilotPrompt.trim()
    if (!prompt) {
      setCopilotStatus('Ask Copilot for a destination, cabin, risk preference, open flights, or backup route.')
      return
    }

    setTripGoal(prompt)
    setQuery(prompt)
    setAiTripPrompt(prompt)
    setSubmitted(true)
    const parsedSearchDate = parseItineraryPrompt(prompt).date
    if (parsedSearchDate) setTravelWindow(parsedSearchDate)
    setCopilotStatus('Copilot translated your request into a planner search.')
    const params = new URLSearchParams({ aiTrip: prompt })
    if (parsedSearchDate) params.set('date', parsedSearchDate)
    if (!compactResultsMode) {
      window.location.href = `/results?${params.toString()}`
      return
    }
    window.history.replaceState(null, '', `/results?${params.toString()}`)
    await runItinerarySearch(prompt, { maxLegs: '2', travelWindow: parsedSearchDate || travelWindow })
  }


  function runUniversalSearchChoice(nextQuery: string) {
    const prompt = nextQuery.trim()
    if (!prompt) return
    setTripGoal(prompt)
    setQuery(prompt)
    setAiTripPrompt(prompt)
    setCopilotPrompt(prompt)
    setSubmitted(true)
    setAiPlannerStatus('Universal search interpreted your airport, route, flight, cabin, or open-ended request.')
    setCopilotStatus('Copilot is using the universal search interpretation with current route intelligence and recovery signals.')
    const parsedSearchDate = parseItineraryPrompt(prompt).date
    if (parsedSearchDate) setTravelWindow(parsedSearchDate)
    const params = new URLSearchParams({ aiTrip: prompt })
    if (parsedSearchDate) params.set('date', parsedSearchDate)
    if (!compactResultsMode) {
      window.location.href = `/results?${params.toString()}`
      return
    }
    window.history.replaceState(null, '', `/results?${params.toString()}`)
    void runItinerarySearch(prompt, { maxLegs: '2', travelWindow: parsedSearchDate || travelWindow })
  }

  const matchingFlights = useMemo(
    () => flights.filter((flight) => flightMatchesSearch(flight, query || tripGoal)),
    [flights, query, tripGoal]
  )
  const visibleFlights = (query || tripGoal) ? matchingFlights : flights
  const flightResultsLabel = query || tripGoal
    ? matchingFlights.length
      ? `${matchingFlights.length} matching flights`
      : 'No matching live flight rows'
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

  const itineraryComparisons = useMemo(() => {
    const comparisons = liveItineraries.map((itinerary) => buildLiveItineraryComparison(
      itinerary,
      predictionEngine,
      historicalStats.routes,
      loadReports,
      communityLoads,
      outcomes,
      travelerProfile,
      scoringScaffold.routeIntelligence,
      scoringScaffold.weights,
      scoringScaffold.recommendationScope,
      confidenceUpdateTrigger
    ))

    return sortCompactItineraries(comparisons)
  }, [liveItineraries, predictionEngine, historicalStats.routes, loadReports, communityLoads, outcomes, travelerProfile, scoringScaffold.routeIntelligence, scoringScaffold.weights, scoringScaffold.recommendationScope, confidenceUpdateTrigger])

  const frameworkRouteComparisons = useMemo(() => {
    const comparisons = frameworkRoutes.map((itinerary) => buildLiveItineraryComparison(
      itinerary,
      predictionEngine,
      historicalStats.routes,
      loadReports,
      communityLoads,
      outcomes,
      travelerProfile,
      scoringScaffold.routeIntelligence,
      scoringScaffold.weights,
      scoringScaffold.recommendationScope,
      confidenceUpdateTrigger
    ))

    return sortCompactItineraries(comparisons)
  }, [frameworkRoutes, predictionEngine, historicalStats.routes, loadReports, communityLoads, outcomes, travelerProfile, scoringScaffold.routeIntelligence, scoringScaffold.weights, scoringScaffold.recommendationScope, confidenceUpdateTrigger])

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
  const hasSearchedForItineraries = submitted || Boolean(query.trim() || tripGoal.trim()) || itineraryDataMode === 'No current live data'
  const showProductionEmptyState = !itineraryLoading && hasSearchedForItineraries && itineraryComparisons.length === 0 && frameworkRouteComparisons.length === 0
  const productionEmptyReasons = productionEmptyStateReasons({
    dataMode: itineraryDataMode,
    status: itineraryStatus,
    debug: itineraryDebug,
    travelDateError,
    hasRequestedDate: Boolean(travelWindow.trim())
  })

  if (compactResultsMode) {
    return (
      <main className="app-shell nonrevy-plan-shell nonrevy-results-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 'clamp(8px, 2.4vw, 14px)', fontFamily: 'Arial', overflowX: 'hidden' }}>
        <section className="nonrevy-results-page__shell">
          <form onSubmit={submitPlanRequest} className="nonrevy-results-search" aria-label="Edit itinerary search">
            <a href="/" className="nonrevy-results-search__brand" aria-label="NONREVY home">NONREVY</a>
            <input
              value={tripGoal}
              onChange={(event) => setTripGoal(event.target.value)}
              placeholder="LAX to HND tomorrow"
              aria-label="Search itinerary"
            />
            <input
              type="date"
              value={travelWindow}
              onChange={(event) => {
                const nextDate = event.target.value
                setTravelWindow(nextDate)
                setTravelDateError(validateTravelDate(nextDate))
              }}
              onBlur={(event) => setTravelDateError(validateTravelDate(event.target.value))}
              aria-label="Travel date"
            />
            <button className="nonrevy-primary-action nonrevy-primary-action--search" type="submit" disabled={itineraryLoading}>{itineraryLoading ? 'Searching…' : 'Search'}</button>
          </form>

          {travelDateError ? <p className="nonrevy-results-page__warning">{travelDateError}</p> : null}

          {itineraryLoading ? <PlannerSkeletonLoaders /> : null}
          {showProductionEmptyState ? <ProductionEmptyState reasons={productionEmptyReasons} origin={itineraryDebug?.parsedOrigin} destination={itineraryDebug?.parsedDestination} suggestions={itineraryDebug?.routeCoverageSuggestions} recovery={itineraryDebug?.recoveryIntelligence} /> : null}
          {itineraryComparisons.length > 0 ? <ItineraryComparisonPanel comparisons={itineraryComparisons} travelDate={travelWindow} communityLoads={communityLoads} onCommunityLoadsUpdated={() => setCommunityLoads(loadCommunityLoads())} trustReceipt={{ dataMode: itineraryDataMode, source: itinerarySource, status: itineraryStatus, warnings: itineraryWarnings, debug: itineraryDebug }} /> : null}
          {frameworkRouteComparisons.length > 0 ? <ItineraryComparisonPanel comparisons={frameworkRouteComparisons} travelDate={travelWindow} communityLoads={communityLoads} onCommunityLoadsUpdated={() => setCommunityLoads(loadCommunityLoads())} trustReceipt={{ dataMode: 'Framework Routes · live schedule unavailable', source: 'Framework Routes', status: 'Live schedules could not be attached to these routes.', warnings: itineraryWarnings, debug: itineraryDebug }} title="Framework Routes" moreTitle="More framework routes" /> : null}

          {developerMode ? (
            <details className="nonrevy-results-page__below">
              <summary>Operator tools and diagnostics</summary>
              <CopilotPanel
                prompt={copilotPrompt}
                setPrompt={setCopilotPrompt}
                status={copilotStatus}
                loading={itineraryLoading}
                comparisons={itineraryComparisons}
                travelerProfile={travelerProfile}
                onSubmit={submitCopilotPrompt}
              />
              <UniversalSearchPanel
                query={query || tripGoal || aiTripPrompt || copilotPrompt}
                comparisons={itineraryComparisons}
                flights={flights}
                travelerProfile={travelerProfile}
                onChoose={runUniversalSearchChoice}
              />
              <details style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617', marginTop: 12 }}>
                <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Developer Diagnostics</summary>
                <p style={{ color: '#94a3b8' }}>Source: {itinerarySource} · Mode: {itineraryDataMode} · Max legs: 2 default · Status: {itineraryStatus}</p>
                {itineraryDebug ? <pre style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1', fontSize: 12 }}>{JSON.stringify(itineraryDebug, null, 2)}</pre> : null}
              </details>
            </details>
          ) : null}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell nonrevy-plan-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 'clamp(16px, 4vw, 32px)', fontFamily: 'Arial', overflowX: 'hidden' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/results" style={{ marginRight: 16, color: '#67e8f9' }}>Search</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#fb7185', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
          Search and itinerary planner
        </p>
        <h1 style={{ fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1.05, margin: '8px 0 12px' }}>
          Plan your nonrevy route.
        </h1>
        <p style={{ color: '#94a3b8', maxWidth: 720, fontSize: 18 }}>
          Compact feasible itinerary rows appear first. Settings, scoring internals, recovery, route intelligence, and diagnostics stay below or behind details.
        </p>
        <details style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a', color: '#cbd5e1' }}>
          <summary style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}>Passenger flight coverage details</summary>
          <ul style={{ marginBottom: 0, marginTop: 10 }}>
            {passengerFlightCoverageNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </details>


        <section className="nonrevy-planner-card" style={{ border: '1px solid #c084fc', borderRadius: 24, padding: 'clamp(16px, 4vw, 22px)', background: 'linear-gradient(135deg, rgba(49, 46, 129, 0.66), rgba(15, 23, 42, 0.96))', marginTop: 24, overflow: 'hidden' }}>
          <p style={{ color: '#c084fc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Universal AI search</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18, alignItems: 'start', width: '100%' }}>
            <form onSubmit={submitAiTripPlanner} style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 30, margin: '0 0 10px' }}>Search airports, routes, flights, cabins, or trip ideas.</h2>
              <p style={{ color: '#cbd5e1' }}>
                Examples: “LAX to HND”, “UA39”, “San Luis Obispo”, “open flights out of SBP today”, “where can I get Polaris”.
              </p>
              <textarea
                value={aiTripPrompt}
                onChange={(event) => setAiTripPrompt(event.target.value)}
                rows={4}
                placeholder="LAX to HND, UA39, Tokyo Haneda, Polaris, open flights out of SBP today..."
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
                Search with AI
              </button>
              <p style={{ color: '#d8b4fe', marginBottom: 0 }}>{aiPlannerStatus}</p>
            </form>

            <aside style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#020617', minWidth: 0, overflowWrap: 'anywhere' }}>
              <details>
                <summary style={{ color: '#22c55e', cursor: 'pointer', fontWeight: 'bold' }}>AI recommendation preview</summary>
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
              <details style={{ marginTop: 12 }}>
                <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Why this route?</summary>
                <ul style={{ color: '#cbd5e1', paddingLeft: 20, marginBottom: 0 }}>
                  {aiTripPlan.whyThisRoute.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </details>
              </details>
            </aside>
          </div>
        </section>

        <section style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 26, marginBottom: 10 }}>Feasible itineraries</h2>
          {itineraryLoading ? (
            <p style={{ color: '#facc15' }}>{itineraryStatus}</p>
          ) : null}
          {itineraryLoading ? <PlannerSkeletonLoaders /> : null}
          {showProductionEmptyState ? <ProductionEmptyState reasons={productionEmptyReasons} origin={itineraryDebug?.parsedOrigin} destination={itineraryDebug?.parsedDestination} suggestions={itineraryDebug?.routeCoverageSuggestions} recovery={itineraryDebug?.recoveryIntelligence} /> : null}
          {itineraryComparisons.length > 0 ? <ItineraryComparisonPanel comparisons={itineraryComparisons} travelDate={travelWindow} communityLoads={communityLoads} onCommunityLoadsUpdated={() => setCommunityLoads(loadCommunityLoads())} trustReceipt={{ dataMode: itineraryDataMode, source: itinerarySource, status: itineraryStatus, warnings: itineraryWarnings, debug: itineraryDebug }} /> : null}
          {frameworkRouteComparisons.length > 0 ? <ItineraryComparisonPanel comparisons={frameworkRouteComparisons} travelDate={travelWindow} communityLoads={communityLoads} onCommunityLoadsUpdated={() => setCommunityLoads(loadCommunityLoads())} trustReceipt={{ dataMode: 'Framework Routes · live schedule unavailable', source: 'Framework Routes', status: 'Live schedules could not be attached to these routes.', warnings: itineraryWarnings, debug: itineraryDebug }} title="Framework Routes" moreTitle="More framework routes" /> : null}
        </section>

        {developerMode ? (
          <>
            <CopilotPanel
              prompt={copilotPrompt}
              setPrompt={setCopilotPrompt}
              status={copilotStatus}
              loading={itineraryLoading}
              comparisons={itineraryComparisons}
              travelerProfile={travelerProfile}
              onSubmit={submitCopilotPrompt}
            />

            <UniversalSearchPanel
              query={query || tripGoal || aiTripPrompt || copilotPrompt}
              comparisons={itineraryComparisons}
              flights={flights}
              travelerProfile={travelerProfile}
              onChoose={runUniversalSearchChoice}
            />

            <details style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a', marginTop: 18 }}>
              <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Operator search settings, carrier scope, and voice input</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 18, marginTop: 16 }}>
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
        </details>

            <section style={{ marginTop: 30 }}>
              <h2 style={{ fontSize: 24, marginBottom: 10 }}>Additional provider details</h2>
          <details className="nonrevy-premium-details" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginBottom: 16 }}>
            <summary style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}>Developer Diagnostics</summary>
            <p style={{ color: '#94a3b8', marginTop: 12 }}>{itineraryStatus} · Source: {itinerarySource}</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${itineraryDataMode === 'Live provider API data' ? '#22c55e' : itineraryDataMode.includes('Fallback') || itineraryDataMode.includes('Nearest') || itineraryDataMode.includes('test') || itineraryDataMode.includes('No current') ? '#facc15' : '#334155'}`, borderRadius: 999, padding: '6px 12px', background: '#020617', color: itineraryDataMode === 'Live provider API data' ? '#bbf7d0' : itineraryDataMode.includes('Fallback') || itineraryDataMode.includes('Nearest') || itineraryDataMode.includes('test') || itineraryDataMode.includes('No current') ? '#fef3c7' : '#cbd5e1', marginBottom: 14, fontWeight: 'bold' }}>
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
            {itineraryDebug?.deduplicationNotes?.length ? (
              <div style={{ border: '1px solid #38bdf8', borderRadius: 14, padding: 14, background: '#082f49', color: '#bae6fd', marginBottom: 14 }}>
                <strong>Deduplication diagnostics</strong>
                <p style={{ margin: '6px 0 0' }}>Removed rows: {itineraryDebug.deduplicatedRowsRemoved || 0}</p>
                <ul style={{ marginBottom: 0 }}>
                  {itineraryDebug.deduplicationNotes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </div>
            ) : null}
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
            {itineraryDebug?.providerDiagnostics?.length ? (
              <div style={{ border: '1px solid #155e75', borderRadius: 12, padding: 10, background: 'rgba(8, 47, 73, 0.38)', color: '#cffafe', marginTop: 12 }}>
                <strong>Structured provider diagnostics</strong>
                <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>Freshness, partial coverage, rate-limit, and fallback signals are separated so the UI does not imply stronger provider certainty than exists.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10, marginTop: 10 }}>
                  {itineraryDebug.providerDiagnostics.map((diagnostic) => (
                    <article key={diagnostic.id} style={{ border: `1px solid ${diagnostic.severity === 'error' ? '#f87171' : diagnostic.severity === 'warning' ? '#facc15' : '#38bdf8'}`, borderRadius: 12, padding: 10, background: '#020617' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <strong style={{ textTransform: 'capitalize' }}>{diagnostic.category.replace('-', ' ')}</strong>
                        <small style={{ color: diagnostic.severity === 'error' ? '#fecaca' : diagnostic.severity === 'warning' ? '#fde68a' : '#bae6fd', textTransform: 'uppercase', fontWeight: 'bold' }}>{diagnostic.severity}</small>
                      </div>
                      <p style={{ margin: '6px 0 0', color: '#e0f2fe' }}>{diagnostic.summary}</p>
                      <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>{diagnostic.detail}</p>
                      {diagnostic.evidenceCount ? <small style={{ color: '#67e8f9' }}>Evidence count: {diagnostic.evidenceCount}</small> : null}
                    </article>
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
              <details style={{ marginTop: 12 }}>
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
          </details>
          {liveItineraries.length > 0 ? (
            <details className="nonrevy-premium-details" style={{ border: '1px solid #334155', borderRadius: 18, padding: 14, background: '#020617', marginTop: 16 }}>
              <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Developer Diagnostics: flight details, airport details, aircraft, duration, connection notes, and provider data</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, marginTop: 14 }}>
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
            </details>
          ) : (
            <div style={{ border: '1px solid #facc15', borderRadius: 18, padding: 18, background: '#1c1917', color: '#fde68a' }}>
              <h3 style={{ marginTop: 0 }}>No current live itinerary data</h3>
              <p style={{ color: '#fef3c7', marginBottom: 0 }}>
                Production-safe mode is active, so nearest-date testing matches and demo fallback itinerary cards are hidden. Try an exact date with available live provider data, or enable NONREVY_TEST_DATA_MODE=true only for personal testing.
              </p>
            </div>
          )}
            </section>
          </>
        ) : null}

        <details className="nonrevy-premium-details" style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a', color: '#cbd5e1', marginTop: 18 }}>
          <summary style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}>Advanced Details: scoring engine, route intelligence, and profile signals</summary>
          <strong style={{ color: '#38bdf8', display: 'block', marginTop: 14 }}>Scoring engine scaffold</strong>
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
        </details>

        <details className="nonrevy-premium-details" style={{ marginTop: 30, border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#020617' }}>
          <summary style={{ color: '#67e8f9', cursor: 'pointer', fontWeight: 'bold' }}>Developer Diagnostics: flight results and raw flight data</summary>
          <p style={{ color: '#94a3b8', marginTop: 12 }}>
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
        </details>


      </section>
    </main>
  )
}

export default PlanPage

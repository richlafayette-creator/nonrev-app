import {
  discoverGateways as defaultDiscoverGateways,
  gatewayAssumptions,
  type GatewayCandidate
} from './gatewayDiscovery'
import {
  assembleItineraries as defaultAssembleItineraries,
  itineraryAssemblyAssumptions,
  type BetaItinerary,
  type BetaItinerarySegment,
  type FallbackOption,
  type TravelTimelineItem
} from './itineraryAssembler'
import {
  generateStrategies as defaultGenerateStrategies,
  strategyAssumptions,
  type ItineraryPlan
} from './itineraryStrategy'
import {
  generateRecommendations as defaultGenerateRecommendations,
  recommendationResultAssumptions,
  type RecommendationOptions,
  type RecommendationResult,
  type RecommendationSignals,
  type TripRecommendation
} from './recommendationEngine'
import {
  createDefaultTripMission,
  normalizeTripMission,
  parseMissionFromPrompt,
  tripMissionAssumptions,
  tripMissionIsComplete,
  type TripMission,
  type TripPriority
} from './tripMission'
import {
  defaultTravelerProfile,
  normalizeTravelerProfile,
  travelerProfileAssumptions,
  normalizeAirlineCode,
  findActiveZedAgreement,
  isEntireTravelingPartyEligible,
  zedAgreementVerificationIsFresh,
  type TravelerProfileScaffold
} from './travelerProfile'
import {
  SearchExecutionEngine,
  mergeProviderItineraries,
  type SearchExecutionItinerary,
  type SearchExecutionSegment,
  type SearchExecutionProvider,
  type SearchExecutionProviderAttribution,
  type SearchExecutionProviderRun,
  type SearchExecutionResult
} from './searchExecutionEngine'
import { createDefaultProviderManager } from './providerAdapters'
import { type ProviderHealth, type ProviderManager } from './providerManager'
import { airportByIata } from './airportIntentResolver'

export type SearchTripType = 'one_way' | 'round_trip' | 'open_jaw'

export type NaturalSearchObject = {
  prompt?: string
  origin?: string | string[]
  destination?: string | string[]
  departureDate?: string
  returnDate?: string
  travelerCount?: number
  travelers?: number
  travelerProfile?: Partial<TravelerProfileScaffold>
  tripMission?: Partial<TripMission> | string
  tripType?: SearchTripType
  returnOrigin?: string
  returnDestination?: string
  preferredDepartureAirports?: string[]
  preferredDestinations?: string[]
  destinationRegion?: string
  flexibleGateway?: boolean
  allowZed?: boolean
  allowRevenue?: boolean
  allowRail?: boolean
  allowFerry?: boolean
  priority?: TripPriority
}

export type SearchPipelineStage =
  | 'trip_mission'
  | 'traveler_profile'
  | 'gateway_discovery'
  | 'itinerary_strategy'
  | 'recommendation_engine'
  | 'itinerary_assembly'
  | 'final_result'

export type SearchPipelineAdapters = {
  discoverGateways?: (mission: TripMission) => GatewayCandidate[]
  generateStrategies?: (mission: TripMission, gateways: GatewayCandidate[]) => ItineraryPlan[]
  generateRecommendations?: (
    mission: TripMission,
    strategies: ItineraryPlan[],
    profile: Partial<TravelerProfileScaffold>,
    options: RecommendationOptions
  ) => RecommendationResult
  assembleItineraries?: (input: {
    recommendationResult: RecommendationResult
    mission: TripMission
    travelerProfile: Partial<TravelerProfileScaffold>
    gateways: GatewayCandidate[]
    strategies: ItineraryPlan[]
    now: Date
  }) => BetaItinerary[]
}

export type SearchPipelineOptions = {
  now?: Date
  signals?: RecommendationSignals
  adapters?: SearchPipelineAdapters
  executionResult?: SearchExecutionResult
  executionProviders?: SearchExecutionProvider[]
  providerManager?: ProviderManager
  executionTimeoutMs?: number
  compositionMinimumConnectionMinutes?: number
  compositionMaximumConnectionMinutes?: number
  connectionSearchMinimumDirectItineraries?: number
  maxConnectionHubsSearched?: number
  maxOriginFirstHubsSearched?: number
  maxCompositionLegs?: number
  maxProviderRoutePairs?: number
  maxSegmentCandidatesPerRoutePair?: number
  maxComposedItinerariesRetained?: number
}

type ExecutionRouteSegment = NonNullable<SearchExecutionResult['request']['routeSegments']>[number]

const defaultConnectionSearchMinimumDirectItineraries = 1
const defaultMaxConnectionHubsSearched = 2
const defaultMaxOriginFirstHubsSearched = 4
const defaultMaxCompositionLegs = 3
const defaultMaxProviderRoutePairs = 16
const defaultMaxSegmentCandidatesPerRoutePair = 300
const defaultMaxComposedItinerariesRetained = 16

function routeSegmentsForExecution(result: SearchResult): ExecutionRouteSegment[] {
  return result.itineraries.flatMap((itinerary) =>
    itinerary.journeys.flatMap((journey) =>
      journey.segments.map((segment, index) => ({
        origin: segment.origin,
        destination: segment.destination,
        transportType: segment.mode,
        carrier: segment.carrier,
        journeyDate: journey.date,
        itineraryId: itinerary.id,
        segmentIndex: index
      }))
    )
  )
}

function routePairKey(segment: Pick<ExecutionRouteSegment, 'origin' | 'destination' | 'transportType' | 'journeyDate'>) {
  return [
    normalizeAirportCode(segment.origin) || segment.origin,
    normalizeAirportCode(segment.destination) || segment.destination,
    segment.transportType,
    segment.journeyDate || ''
  ].join('|')
}

function dedupeExecutionRouteSegments(segments: ExecutionRouteSegment[]) {
  const seen = new Set<string>()
  const deduped: ExecutionRouteSegment[] = []
  segments.forEach((segment) => {
    const key = routePairKey(segment)
    if (seen.has(key)) return
    seen.add(key)
    deduped.push(segment)
  })
  return deduped
}

function directExecutionRouteSegments(mission: TripMission): ExecutionRouteSegment[] {
  const normalized = normalizeTripMission(mission)
  const origins = uniqueStrings([...(normalized.preferredDepartureAirports || []), ...(normalized.originAirports || [])].map(normalizeAirportCode).filter(Boolean))
  const destinations = uniqueStrings((normalized.preferredDestinations || []).map(normalizeAirportCode).filter(Boolean))
  return origins.flatMap((origin) => destinations
    .filter((destination) => destination && destination !== origin)
    .map((destination) => ({
      origin,
      destination,
      transportType: 'flight' as const,
      journeyDate: normalized.departureDate
    })))
}

function directScheduledItineraryCount(result: SearchExecutionResult, mission: TripMission) {
  const directPairs = new Set(directExecutionRouteSegments(mission).map((segment) => `${segment.origin}-${segment.destination}`))
  if (!directPairs.size) return 0
  return result.itineraries.filter((itinerary) =>
    itinerary.segments.length === 1 &&
    directPairs.has(`${itinerary.segments[0]?.origin}-${itinerary.segments[0]?.destination}`) &&
    executionSegmentHasSchedule(itinerary.segments[0])
  ).length
}

function sameAirportConnectionRouteSegments(input: {
  mission: TripMission
  gateways: GatewayCandidate[]
  existingSegments: ExecutionRouteSegment[]
  maxConnectionHubs: number
  maxProviderRoutePairs: number
}): ExecutionRouteSegment[] {
  const normalized = normalizeTripMission(input.mission)
  const origin = normalizeAirportCode(normalized.preferredDepartureAirports[0] || normalized.originAirports[0])
  const destination = normalizeAirportCode(normalized.preferredDestinations[0])
  if (!origin || !destination) return []

  const existing = new Set(input.existingSegments.map(routePairKey))
  const segments: ExecutionRouteSegment[] = []
  const hubs = input.gateways
    .map((gateway) => normalizeAirportCode(gateway.airportCode))
    .filter((hub, index, values) => hub && hub !== origin && hub !== destination && values.indexOf(hub) === index)
    .slice(0, Math.max(0, input.maxConnectionHubs))

  for (const hub of hubs) {
    if (input.existingSegments.length + segments.length + 2 > input.maxProviderRoutePairs) break
    const first: ExecutionRouteSegment = { origin, destination: hub, transportType: 'flight', journeyDate: normalized.departureDate, itineraryId: `connection-market-${hub}`, segmentIndex: 0 }
    const second: ExecutionRouteSegment = { origin: hub, destination, transportType: 'flight', journeyDate: normalized.departureDate, itineraryId: `connection-market-${hub}`, segmentIndex: 1 }
    if (existing.has(routePairKey(first)) || existing.has(routePairKey(second))) continue
    existing.add(routePairKey(first))
    existing.add(routePairKey(second))
    segments.push(first, second)
  }

  return segments
}

function originDepartureDiscoveryRouteSegments(input: {
  mission: TripMission
  existingSegments: ExecutionRouteSegment[]
  maxProviderRoutePairs: number
}): ExecutionRouteSegment[] {
  const normalized = normalizeTripMission(input.mission)
  const origins = uniqueStrings([...(normalized.preferredDepartureAirports || []), ...(normalized.originAirports || [])].map(normalizeAirportCode).filter(Boolean))
  const destination = normalizeAirportCode(normalized.preferredDestinations[0])
  if (!origins.length || !destination) return []
  if (input.existingSegments.length >= input.maxProviderRoutePairs) return []
  const existing = new Set(input.existingSegments.map(routePairKey))
  const segments: ExecutionRouteSegment[] = []
  for (const origin of origins) {
    if (input.existingSegments.length + segments.length >= input.maxProviderRoutePairs) break
    const segment: ExecutionRouteSegment = {
    origin,
    destination: '*',
    transportType: 'flight',
    journeyDate: normalized.departureDate,
    itineraryId: 'origin-departure-discovery',
    segmentIndex: 0
    }
    const key = routePairKey(segment)
    if (existing.has(key)) continue
    existing.add(key)
    segments.push(segment)
  }
  return segments
}

function scheduledDepartureHubsFromOrigin(result: SearchExecutionResult, mission: TripMission, maxHubs: number) {
  const normalized = normalizeTripMission(mission)
  const origins = new Set(uniqueStrings([...(normalized.preferredDepartureAirports || []), ...(normalized.originAirports || [])].map(normalizeAirportCode).filter(Boolean)))
  const destinations = new Set(uniqueStrings((normalized.preferredDestinations || []).map(normalizeAirportCode).filter(Boolean)))
  if (!origins.size || !destinations.size || maxHubs <= 0) return []
  const scores = new Map<string, number>()
  executionCandidates(result).forEach((candidate) => {
    const segment = candidate.segment
    if (!origins.has(segment.origin) || destinations.has(segment.destination) || !executionSegmentHasSchedule(segment)) return
    scores.set(segment.destination, (scores.get(segment.destination) || 0) + 1)
  })
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([hub]) => hub)
    .slice(0, maxHubs)
}

function originFirstConnectionRouteSegments(input: {
  mission: TripMission
  firstHopHubs: string[]
  destinationHubs: string[]
  existingSegments: ExecutionRouteSegment[]
  maxProviderRoutePairs: number
}): ExecutionRouteSegment[] {
  const normalized = normalizeTripMission(input.mission)
  const destinations = uniqueStrings((normalized.preferredDestinations || []).map(normalizeAirportCode).filter(Boolean))
  if (!destinations.length) return []
  const existing = new Set(input.existingSegments.map(routePairKey))
  const segments: ExecutionRouteSegment[] = []
  const add = (origin: string, destinationCode: string, itineraryId: string, segmentIndex: number) => {
    if (!origin || !destinationCode || origin === destinationCode) return
    if (input.existingSegments.length + segments.length >= input.maxProviderRoutePairs) return
    const segment: ExecutionRouteSegment = {
      origin,
      destination: destinationCode,
      transportType: 'flight',
      journeyDate: normalized.departureDate,
      itineraryId,
      segmentIndex
    }
    const key = routePairKey(segment)
    if (existing.has(key)) return
    existing.add(key)
    segments.push(segment)
  }

  for (const destination of destinations) {
    for (const firstHub of input.firstHopHubs) add(firstHub, destination, `origin-first-${firstHub}-${destination}`, 1)
  }

  for (const firstHub of input.firstHopHubs) {
    for (const destinationHub of input.destinationHubs) {
      if (destinationHub === firstHub || destinations.includes(destinationHub)) continue
      for (const destination of destinations) {
        add(firstHub, destinationHub, `origin-first-${firstHub}-${destinationHub}-${destination}`, 1)
        add(destinationHub, destination, `origin-first-${firstHub}-${destinationHub}-${destination}`, 2)
      }
    }
  }

  return segments
}

function plusDays(date: string | undefined, days: number) {
  if (!date) return undefined
  const parsed = Date.parse(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(parsed)) return undefined
  const next = new Date(parsed)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function airportRegion(code: string) {
  const country = airportByIata(code)?.country || ''
  if ([
    'Albania', 'Andorra', 'Austria', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Cyprus',
    'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland',
    'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Montenegro', 'Netherlands', 'Norway',
    'Poland', 'Portugal', 'Romania', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland',
    'Turkey', 'United Kingdom'
  ].includes(country)) return 'Europe'
  if (['Japan'].includes(country)) return 'Japan'
  if (['Maldives', 'Singapore', 'South Korea', 'Taiwan', 'China', 'Thailand', 'India', 'United Arab Emirates'].includes(country)) return 'Asia'
  return country
}

function providerDiscoveredHubDepartureSegments(input: {
  mission: TripMission
  firstHopHubs: string[]
  existingSegments: ExecutionRouteSegment[]
  maxProviderRoutePairs: number
}): ExecutionRouteSegment[] {
  const normalized = normalizeTripMission(input.mission)
  const existing = new Set(input.existingSegments.map(routePairKey))
  const segments: ExecutionRouteSegment[] = []
  for (const hub of input.firstHopHubs.map(normalizeAirportCode).filter(Boolean)) {
    if (input.existingSegments.length + segments.length >= input.maxProviderRoutePairs) break
    const segment: ExecutionRouteSegment = {
      origin: hub,
      destination: '*',
      transportType: 'flight',
      journeyDate: normalized.departureDate,
      itineraryId: `provider-graph-${hub}-any`,
      segmentIndex: 1
    }
    const key = routePairKey(segment)
    if (existing.has(key)) continue
    existing.add(key)
    segments.push(segment)
  }
  return segments
}

function providerDiscoveredOnwardHubs(result: SearchExecutionResult, mission: TripMission, firstHopHubs: string[], maxHubs: number) {
  const normalized = normalizeTripMission(mission)
  const origins = new Set(uniqueStrings([...(normalized.preferredDepartureAirports || []), ...(normalized.originAirports || [])].map(normalizeAirportCode).filter(Boolean)))
  const destinations = new Set(uniqueStrings((normalized.preferredDestinations || []).map(normalizeAirportCode).filter(Boolean)))
  const firstHopSet = new Set(firstHopHubs)
  const destinationRegion = airportRegion([...destinations][0] || '')
  const scores = new Map<string, number>()
  executionCandidates(result).forEach((candidate) => {
    const segment = candidate.segment
    if (!firstHopSet.has(segment.origin) || origins.has(segment.destination) || firstHopSet.has(segment.destination) || destinations.has(segment.destination)) return
    if (!executionSegmentHasSchedule(segment)) return
    const regionBonus = airportRegion(segment.destination) === destinationRegion ? 100 : 0
    scores.set(segment.destination, (scores.get(segment.destination) || 0) + 1 + regionBonus)
  })
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([hub]) => hub)
    .slice(0, maxHubs)
}

function providerDiscoveredDestinationSegments(input: {
  mission: TripMission
  onwardHubs: string[]
  existingSegments: ExecutionRouteSegment[]
  maxProviderRoutePairs: number
}): ExecutionRouteSegment[] {
  const normalized = normalizeTripMission(input.mission)
  const destinations = uniqueStrings((normalized.preferredDestinations || []).map(normalizeAirportCode).filter(Boolean))
  const dates = uniqueStrings([normalized.departureDate, plusDays(normalized.departureDate, 1)].filter((item): item is string => Boolean(item)))
  const existing = new Set(input.existingSegments.map(routePairKey))
  const segments: ExecutionRouteSegment[] = []
  const add = (origin: string, destination: string, date: string | undefined) => {
    if (!origin || !destination || origin === destination) return
    if (input.existingSegments.length + segments.length >= input.maxProviderRoutePairs) return
    const segment: ExecutionRouteSegment = {
      origin,
      destination,
      transportType: 'flight',
      journeyDate: date,
      itineraryId: `provider-graph-${origin}-${destination}`,
      segmentIndex: 2
    }
    const key = routePairKey(segment)
    if (existing.has(key)) return
    existing.add(key)
    segments.push(segment)
  }
  for (const hub of input.onwardHubs.map(normalizeAirportCode).filter(Boolean)) {
    for (const destination of destinations) {
      for (const date of dates) add(hub, destination, date)
    }
  }
  return segments
}

export type SearchResultRecommendation = {
  label: TripRecommendation['label']
  rank: number
  status: TripRecommendation['status']
  gateway: string
  finalScore: number
  confidence: number
  estimatedSuccess: number
  summary: string
  warnings: string[]
  risks: string[]
}

export type ZedEligibilityStatus = 'eligible' | 'partial' | 'not_eligible' | 'unknown'

export type SearchResultZedEligibility = {
  status: ZedEligibilityStatus
  label: string
  requiredCarriers: string[]
  eligibleCarriers: string[]
  ineligibleCarriers: string[]
  unknownCarriers: string[]
  revenueAlternative: boolean
  action?: string
  reasons: string[]
}

export type SearchResultProviderHubQuality = {
  hub: string
  score: number
  feasible: boolean
  legOptionCounts: number[]
  reasons: string[]
}

export type SearchResultItinerary = {
  id: string
  recommendationLabel: TripRecommendation['label']
  recommendationRank: number
  gateway: string
  confidence: number
  summary: string
  detailedSummary: string
  segments: BetaItinerarySegment[]
  timeline: TravelTimelineItem[]
  fallbacks: FallbackOption[]
  requiredZedAirlines: string[]
  eligibleZedAirlines: string[]
  revenueAirlines: string[]
  zedEligibility?: SearchResultZedEligibility
  providerHubQuality?: SearchResultProviderHubQuality
  providerAttribution: SearchExecutionProviderAttribution[]
  weatherPlaceholder: string
  missingData: string[]
  unknownScheduleIndicators: string[]
  journeys: Array<{
    direction: 'outbound' | 'return'
    origin: string
    destination: string
    date?: string
    segments: BetaItinerarySegment[]
    timeline: TravelTimelineItem[]
  }>
}

export type SearchPipelineTraceItem = {
  stage: SearchPipelineStage
  status: 'ok' | 'partial' | 'failed'
  message: string
}

export type SearchResult = {
  id: string
  generatedAt: string
  tripType: SearchTripType
  mission: TripMission
  travelerProfile: TravelerProfileScaffold
  gateways: GatewayCandidate[]
  strategies: ItineraryPlan[]
  recommendationResult: RecommendationResult
  recommendations: {
    planA?: SearchResultRecommendation
    planB?: SearchResultRecommendation
    planC?: SearchResultRecommendation
    ranked: SearchResultRecommendation[]
  }
  itineraries: SearchResultItinerary[]
  confidence: {
    score: number
    label: 'high' | 'medium' | 'low'
    reason: string
  }
  warnings: string[]
  missingData: string[]
  unknownScheduleIndicators: string[]
  weatherPlaceholder: string
  segments: BetaItinerarySegment[]
  summary: string
  timeline: TravelTimelineItem[]
  fallbacks: FallbackOption[]
  providerRuns: SearchExecutionProviderRun[]
  providerHealth: ProviderHealth[]
  pipelineTrace: SearchPipelineTraceItem[]
  assumptions: string[]
}

const unknownScheduleTexts = [
  'Unknown - not provided by route framework',
  'Unknown - provider schedule validation required',
  'Unknown - live load data not attached',
  'Unknown - ground schedule provider not attached'
]

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean)
  const single = stringValue(value)
  return single ? [single] : []
}

function normalizeAirportCode(value: unknown) {
  const code = stringValue(value).toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : ''
}

function normalizeDate(value: unknown) {
  const text = stringValue(value)
  if (!text) return undefined
  const parsed = Date.parse(`${text}T00:00:00Z`)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined
}

function destinationRegionFromText(value: string) {
  const text = value.trim().toLowerCase()
  if (text === 'japan') return 'Japan'
  if (['europe', 'asia', 'caribbean'].includes(text)) return text[0].toUpperCase() + text.slice(1)
  return undefined
}

function destinationOverlay(destination: unknown) {
  const values = stringArray(destination)
  const regions = values.map(destinationRegionFromText).filter((region): region is string => Boolean(region))
  const airportOrPlaceDestinations = values.filter((value) => !destinationRegionFromText(value))
  return {
    destinationRegion: regions[0],
    preferredDestinations: airportOrPlaceDestinations
  }
}

function requestPrompt(request: NaturalSearchObject) {
  return [
    request.prompt,
    stringArray(request.origin).length ? `from ${stringArray(request.origin).join(' or ')}` : '',
    stringArray(request.destination).length ? `to ${stringArray(request.destination).join(' or ')}` : '',
    request.departureDate,
    request.returnDate ? `return ${request.returnDate}` : ''
  ].filter(Boolean).join(' ')
}

function baseMissionFromRequest(request: NaturalSearchObject) {
  if (typeof request.tripMission === 'string') return parseMissionFromPrompt(request.tripMission)
  if (request.tripMission && typeof request.tripMission === 'object') return normalizeTripMission(request.tripMission)
  return parseMissionFromPrompt(requestPrompt(request))
}

function inferTripType(request: NaturalSearchObject, mission: TripMission): SearchTripType {
  if (request.tripType) return request.tripType
  if (request.returnOrigin || request.returnDestination) return 'open_jaw'
  if (mission.returnDate || request.returnDate) return 'round_trip'
  return 'one_way'
}

export function normalizeSearchMission(request: NaturalSearchObject) {
  const base = baseMissionFromRequest(request)
  const originAirports = stringArray(request.origin).map(normalizeAirportCode).filter(Boolean)
  const preferredDepartureAirports = (request.preferredDepartureAirports || originAirports).map(normalizeAirportCode).filter(Boolean)
  const destination = destinationOverlay(request.destination)

  return normalizeTripMission({
    ...base,
    ...(originAirports.length ? { originAirports } : {}),
    ...(preferredDepartureAirports.length ? { preferredDepartureAirports } : {}),
    ...(destination.destinationRegion ? { destinationRegion: destination.destinationRegion } : {}),
    preferredDestinations: uniqueStrings([
      ...(destination.preferredDestinations.length ? destination.preferredDestinations : []),
      ...(request.preferredDestinations || base.preferredDestinations)
    ]),
    ...(request.destinationRegion ? { destinationRegion: request.destinationRegion } : {}),
    ...(request.departureDate ? { departureDate: request.departureDate } : {}),
    ...(request.returnDate ? { returnDate: request.returnDate } : {}),
    travelers: request.travelerCount || request.travelers || base.travelers,
    flexibleGateway: request.flexibleGateway ?? base.flexibleGateway,
    allowZed: request.allowZed ?? base.allowZed,
    allowRevenue: request.allowRevenue ?? base.allowRevenue,
    allowRail: request.allowRail ?? base.allowRail,
    allowFerry: request.allowFerry ?? base.allowFerry,
    priority: request.priority || base.priority
  })
}

function stageWarning(stage: SearchPipelineStage, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return `${stage.replace(/_/g, ' ')} failed: ${message}`
}

function trace(stage: SearchPipelineStage, status: SearchPipelineTraceItem['status'], message: string): SearchPipelineTraceItem {
  return { stage, status, message }
}

function emptyRecommendationResult(mission: TripMission, now: Date, warnings: string[] = []): RecommendationResult {
  return {
    missionSummary: tripMissionAssumptions(mission),
    recommendations: [],
    generatedAt: now.toISOString(),
    dataQuality: 'low',
    warnings
  }
}

function recommendationSummary(recommendation: TripRecommendation): SearchResultRecommendation {
  return {
    label: recommendation.label,
    rank: recommendation.rank,
    status: recommendation.status,
    gateway: recommendation.plan.gateway,
    finalScore: recommendation.finalScore,
    confidence: recommendation.confidence,
    estimatedSuccess: recommendation.estimatedSuccess,
    summary: recommendation.explanation.summary,
    warnings: uniqueStrings(recommendation.dataWarnings),
    risks: uniqueStrings(recommendation.risks.map((risk) => `${risk.title}: ${risk.description}`))
  }
}

function recommendationBuckets(ranked: SearchResultRecommendation[]) {
  return {
    planA: ranked.find((recommendation) => recommendation.label === 'Plan A'),
    planB: ranked.find((recommendation) => recommendation.label === 'Plan B'),
    planC: ranked.find((recommendation) => recommendation.label === 'Plan C'),
    ranked
  }
}

function segmentUnknownScheduleIndicators(segment: BetaItinerarySegment) {
  return uniqueStrings([
    segment.schedule.flightNumber,
    segment.schedule.departureTime,
    segment.schedule.arrivalTime,
    segment.schedule.seatCount,
    ...segment.notes.filter((note) => /unknown|not attached|provider validation/i.test(note))
  ])
}

function knownProviderValue(value: unknown) {
  return typeof value === 'string' && value.trim() && !/^unknown\b|^not provided\b|^live load unavailable\b/i.test(value.trim())
}

function normalizedMode(value: string) {
  return value === 'rail' || value === 'ferry' || value === 'car' || value === 'surface' || value === 'flight'
    ? value
    : 'surface'
}

function executionMatchesSearchItinerary(searchItinerary: SearchResultItinerary, executionItinerary: SearchExecutionItinerary) {
  if (searchItinerary.segments.length !== executionItinerary.segments.length) return false
  return searchItinerary.segments.every((segment, index) => {
    const providerSegment = executionItinerary.segments[index]
    if (!providerSegment) return false
    if (segment.origin !== providerSegment.origin || segment.destination !== providerSegment.destination) return false
    if (segment.mode !== normalizedMode(providerSegment.transportType)) return false
    if (segment.carrier && providerSegment.carrier && segment.carrier !== providerSegment.carrier) return false
    return true
  })
}

function applyExecutionSegment(segment: BetaItinerarySegment, executionSegment: SearchExecutionItinerary['segments'][number]): BetaItinerarySegment {
  const providerNotes = uniqueStrings([
    executionSegment.airlineName || executionSegment.airlineCode || executionSegment.carrier
      ? `Airline: ${[executionSegment.airlineName, executionSegment.airlineCode].filter(Boolean).join(' ') || executionSegment.carrier}`
      : '',
    executionSegment.flightNumber ? `Flight: ${executionSegment.flightNumber}` : '',
    executionSegment.flightStatus ? `Flight status: ${executionSegment.flightStatus}` : '',
    executionSegment.departureTerminal || executionSegment.departureGate
      ? `Departure terminal/gate: ${[executionSegment.departureTerminal, executionSegment.departureGate].filter(Boolean).join('/')}`
      : '',
    executionSegment.arrivalTerminal || executionSegment.arrivalGate
      ? `Arrival terminal/gate: ${[executionSegment.arrivalTerminal, executionSegment.arrivalGate].filter(Boolean).join('/')}`
      : '',
    executionSegment.fetchedAt ? `Schedule data: Aviationstack, fetched ${executionSegment.fetchedAt}` : ''
  ])
  return {
    ...segment,
    ...(segment.carrier || !knownProviderValue(executionSegment.airlineCode || executionSegment.carrier) ? {} : { carrier: executionSegment.airlineCode || executionSegment.carrier }),
    schedule: {
      flightNumber: knownProviderValue(executionSegment.flightNumber) ? executionSegment.flightNumber || segment.schedule.flightNumber : segment.schedule.flightNumber,
      departureTime: knownProviderValue(executionSegment.departureTime) ? executionSegment.departureTime || segment.schedule.departureTime : segment.schedule.departureTime,
      arrivalTime: knownProviderValue(executionSegment.arrivalTime) ? executionSegment.arrivalTime || segment.schedule.arrivalTime : segment.schedule.arrivalTime,
      seatCount: knownProviderValue(executionSegment.seatCount) ? executionSegment.seatCount || segment.schedule.seatCount : segment.schedule.seatCount,
      ...(knownProviderValue(executionSegment.scheduledDepartureUtc || executionSegment.scheduledDeparture || executionSegment.departureTime) ? { scheduledDepartureUtc: executionSegment.scheduledDepartureUtc || executionSegment.scheduledDeparture || executionSegment.departureTime } : segment.schedule.scheduledDepartureUtc ? { scheduledDepartureUtc: segment.schedule.scheduledDepartureUtc } : {}),
      ...(knownProviderValue(executionSegment.scheduledArrivalUtc || executionSegment.scheduledArrival || executionSegment.arrivalTime) ? { scheduledArrivalUtc: executionSegment.scheduledArrivalUtc || executionSegment.scheduledArrival || executionSegment.arrivalTime } : segment.schedule.scheduledArrivalUtc ? { scheduledArrivalUtc: segment.schedule.scheduledArrivalUtc } : {}),
      ...(knownProviderValue(executionSegment.departureTimeZone) ? { departureTimeZone: executionSegment.departureTimeZone } : segment.schedule.departureTimeZone ? { departureTimeZone: segment.schedule.departureTimeZone } : {}),
      ...(knownProviderValue(executionSegment.arrivalTimeZone) ? { arrivalTimeZone: executionSegment.arrivalTimeZone } : segment.schedule.arrivalTimeZone ? { arrivalTimeZone: segment.schedule.arrivalTimeZone } : {}),
      ...(knownProviderValue(executionSegment.departureAirportTimeZone || executionSegment.departureTimeZone) ? { departureAirportTimeZone: executionSegment.departureAirportTimeZone || executionSegment.departureTimeZone } : segment.schedule.departureAirportTimeZone ? { departureAirportTimeZone: segment.schedule.departureAirportTimeZone } : {}),
      ...(knownProviderValue(executionSegment.arrivalAirportTimeZone || executionSegment.arrivalTimeZone) ? { arrivalAirportTimeZone: executionSegment.arrivalAirportTimeZone || executionSegment.arrivalTimeZone } : segment.schedule.arrivalAirportTimeZone ? { arrivalAirportTimeZone: segment.schedule.arrivalAirportTimeZone } : {})
    },
    estimatedDuration: knownProviderValue(executionSegment.duration) && segment.estimatedDuration.startsWith('Unknown')
      ? executionSegment.duration || segment.estimatedDuration
      : segment.estimatedDuration,
    notes: uniqueStrings([
      ...segment.notes,
      ...(executionSegment.notes || []),
      ...providerNotes,
      knownProviderValue(executionSegment.scheduleStatus) ? executionSegment.scheduleStatus || '' : '',
      knownProviderValue(executionSegment.loadStatus) ? executionSegment.loadStatus || '' : ''
    ])
  }
}

const defaultCompositionMinimumConnectionMinutes = 90
const defaultCompositionMaximumConnectionMinutes = 36 * 60

type CompositionOptions = Pick<SearchPipelineOptions, 'compositionMinimumConnectionMinutes' | 'compositionMaximumConnectionMinutes' | 'maxComposedItinerariesRetained' | 'maxCompositionLegs'>

type ExecutionSegmentCandidate = {
  segment: SearchExecutionItinerary['segments'][number]
  attribution: SearchExecutionProviderAttribution[]
}

function executionSegmentIdentity(segment: SearchExecutionItinerary['segments'][number]) {
  return [
    segment.providerId || 'provider',
    segment.providerRecordId || segment.flightNumber || 'flight',
    segment.origin,
    segment.destination,
    segment.scheduledDeparture || segment.departureTime || 'departure'
  ].map((value) => String(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()).join('-')
}

function executionSegmentHasSchedule(segment: SearchExecutionItinerary['segments'][number]) {
  return knownProviderValue(segment.flightNumber) &&
    knownProviderValue(segment.scheduledDeparture || segment.departureTime) &&
    knownProviderValue(segment.scheduledArrival || segment.arrivalTime)
}

function executionSegmentTimeMs(segment: SearchExecutionItinerary['segments'][number], field: 'arrival' | 'departure') {
  const value = field === 'arrival'
    ? segment.scheduledArrival || segment.arrivalTime
    : segment.scheduledDeparture || segment.departureTime
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : undefined
}

function connectionMinutes(first: SearchExecutionItinerary['segments'][number], second: SearchExecutionItinerary['segments'][number]) {
  const arrival = executionSegmentTimeMs(first, 'arrival')
  const departure = executionSegmentTimeMs(second, 'departure')
  if (arrival === undefined || departure === undefined) return undefined
  return Math.round((departure - arrival) / 60000)
}

function connectionIsValid(
  first: SearchExecutionItinerary['segments'][number],
  second: SearchExecutionItinerary['segments'][number],
  options: CompositionOptions = {}
) {
  if (first.destination !== second.origin) return false
  const minutes = connectionMinutes(first, second)
  if (minutes === undefined) return false
  const minimum = options.compositionMinimumConnectionMinutes || defaultCompositionMinimumConnectionMinutes
  const maximum = options.compositionMaximumConnectionMinutes || defaultCompositionMaximumConnectionMinutes
  return minutes >= minimum && minutes <= maximum
}

function providerScheduleIdentity(segment: SearchExecutionItinerary['segments'][number]) {
  return [
    segment.origin,
    segment.destination,
    normalizedCarrierCode(segment.carrier || segment.airlineCode),
    segment.flightNumber || '',
    segment.scheduledDeparture || segment.departureTime || '',
    segment.scheduledArrival || segment.arrivalTime || ''
  ].join('|')
}

function distinctProviderScheduleCount(
  candidates: ExecutionSegmentCandidate[],
  origin: string,
  destination: string
) {
  const seen = new Set<string>()
  candidates.forEach((candidate) => {
    const segment = candidate.segment
    if (segment.origin !== origin || segment.destination !== destination) return
    if (!executionSegmentHasSchedule(segment)) return
    seen.add(providerScheduleIdentity(segment))
  })
  return seen.size
}

function allAttributionFreshness(values: SearchExecutionProviderAttribution[]) {
  const ages = values
    .map((item) => item.freshnessAgeMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!ages.length) return undefined
  return Math.max(...ages)
}

function providerHubQualityForExecutionItinerary(
  itinerary: SearchExecutionItinerary,
  allCandidates: ExecutionSegmentCandidate[],
  options: CompositionOptions = {}
): SearchResultProviderHubQuality | undefined {
  if (itinerary.segments.length < 2) return undefined
  const hub = itinerary.segments[0]?.destination
  if (!hub) return undefined

  const reasons: string[] = []
  const legOptionCounts = itinerary.segments.map((segment) =>
    distinctProviderScheduleCount(allCandidates, segment.origin, segment.destination)
  )
  const sameAirport = itinerary.segments.every((segment, index, segments) => index === 0 || segments[index - 1].destination === segment.origin)
  const scheduled = itinerary.segments.every(executionSegmentHasSchedule)
  const feasible = sameAirport && scheduled && itinerary.segments.every((segment, index, segments) =>
    index === 0 || connectionIsValid(segments[index - 1], segment, options)
  )

  if (sameAirport) reasons.push('same-airport connection endpoints match')
  else reasons.push('connection endpoints do not match the same airport')
  if (scheduled) reasons.push('provider schedules are attached for every leg')
  else reasons.push('one or more legs lack provider schedule data')
  if (feasible) reasons.push('connection timing satisfies the configured threshold')
  else reasons.push('connection timing is not provider-validated as feasible')

  const supportedLegs = legOptionCounts.filter((count) => count > 0).length
  const extraOptions = legOptionCounts.reduce((total, count) => total + Math.max(0, count - 1), 0)
  const freshnessAgeMs = allAttributionFreshness(itinerary.providerAttribution || [])
  const stalePenalty = freshnessAgeMs !== undefined && freshnessAgeMs > 45 * 60 * 1000 ? 8 : 0
  if (freshnessAgeMs !== undefined) reasons.push(`provider freshness age ${freshnessAgeMs}ms`)

  const score = feasible
    ? clampScore(45 + supportedLegs * 20 + Math.min(15, extraOptions * 5) - stalePenalty)
    : clampScore(supportedLegs * 12 - stalePenalty)

  return {
    hub,
    score,
    feasible,
    legOptionCounts,
    reasons: uniqueStrings(reasons)
  }
}

function executionSegmentMatchesFrameworkSegment(
  frameworkSegment: BetaItinerarySegment,
  candidate: SearchExecutionItinerary['segments'][number]
) {
  if (frameworkSegment.mode !== normalizedMode(candidate.transportType)) return false
  if (frameworkSegment.origin !== candidate.origin || frameworkSegment.destination !== candidate.destination) return false
  if (frameworkSegment.carrier && candidate.carrier && frameworkSegment.carrier !== candidate.carrier) return false
  return executionSegmentHasSchedule(candidate)
}

function attributionForCandidate(itinerary: SearchExecutionItinerary, segment: SearchExecutionItinerary['segments'][number]) {
  if (itinerary.providerAttribution?.length) return itinerary.providerAttribution
  if (segment.providerId) {
    return [{
      providerId: segment.providerId,
      providerName: segment.providerId,
      providerRecordIds: segment.providerRecordId ? [segment.providerRecordId] : [],
      fetchedAt: segment.fetchedAt,
      fields: segment.providerSuppliedFields
    }]
  }
  return []
}

function mergeExecutionAttribution(values: SearchExecutionProviderAttribution[]) {
  const merged = new Map<string, SearchExecutionProviderAttribution>()
  values.forEach((item) => {
    const key = item.providerId || item.providerName
    if (!key || merged.has(key)) return
    merged.set(key, item)
  })
  return [...merged.values()]
}

function executionCandidates(executionResult: SearchExecutionResult): ExecutionSegmentCandidate[] {
  return executionResult.itineraries.flatMap((itinerary) =>
    itinerary.segments.map((segment) => ({
      segment,
      attribution: attributionForCandidate(itinerary, segment)
    }))
  )
}

function composedDataQuality(segments: SearchExecutionItinerary['segments']) {
  return segments.every((segment) => segment.sourceConfidence === 'provider_reported') ? 'high' : 'medium'
}

function composeExecutionItinerariesForFramework(
  framework: SearchResultItinerary,
  executionResult: SearchExecutionResult,
  options: CompositionOptions = {}
): SearchExecutionItinerary[] {
  if (framework.segments.length < 2) return []
  if (framework.segments.some((segment) => segment.mode !== 'flight')) return []
  const candidates = executionCandidates(executionResult)
  const candidatesByLeg = framework.segments.map((segment) =>
    candidates.filter((candidate) => executionSegmentMatchesFrameworkSegment(segment, candidate.segment))
  )
  if (candidatesByLeg.some((items) => !items.length)) return []

  const composed: SearchExecutionItinerary[] = []
  const maxComposed = Math.max(1, Math.min(options.maxComposedItinerariesRetained || defaultMaxComposedItinerariesRetained, defaultMaxComposedItinerariesRetained))
  const walk = (index: number, selected: ExecutionSegmentCandidate[], used: Set<string>) => {
    if (composed.length >= maxComposed) return
    if (index === candidatesByLeg.length) {
      const segments = selected.map((candidate) => candidate.segment)
      const id = `composed-${framework.id}-${segments.map(executionSegmentIdentity).join('-')}`
      composed.push({
        id,
        dataQuality: composedDataQuality(segments),
        providerAttribution: mergeExecutionAttribution([
          ...selected.flatMap((candidate) => candidate.attribution),
          {
            providerId: 'nonrevy-itinerary-composer',
            providerName: 'Nonrevy itinerary composer',
            fields: ['segment-composition']
          }
        ]),
        segments,
        warnings: ['Nonrevy composed this itinerary from provider-returned segment schedules; the provider did not return it as a packaged itinerary.']
      })
      return
    }

    for (const candidate of candidatesByLeg[index]) {
      const identity = executionSegmentIdentity(candidate.segment)
      if (used.has(identity)) continue
      const previous = selected.at(-1)?.segment
      if (previous && !connectionIsValid(previous, candidate.segment, options)) continue
      const nextUsed = new Set(used)
      nextUsed.add(identity)
      walk(index + 1, [...selected, candidate], nextUsed)
    }
  }

  walk(0, [], new Set())
  return composed
}

function executionItineraryMatchesRequestedJourney(itinerary: SearchExecutionItinerary, mission: TripMission) {
  const normalized = normalizeTripMission(mission)
  const origin = normalizeAirportCode(normalized.preferredDepartureAirports[0] || normalized.originAirports[0])
  const destination = normalizeAirportCode(normalized.preferredDestinations[0])
  const first = itinerary.segments[0]
  const last = itinerary.segments.at(-1)
  return Boolean(origin && destination && first?.origin === origin && last?.destination === destination)
}

function composeOriginFirstExecutionItineraries(
  executionResult: SearchExecutionResult,
  mission: TripMission,
  options: CompositionOptions = {}
): SearchExecutionItinerary[] {
  const normalized = normalizeTripMission(mission)
  const origin = normalizeAirportCode(normalized.preferredDepartureAirports[0] || normalized.originAirports[0])
  const destination = normalizeAirportCode(normalized.preferredDestinations[0])
  if (!origin || !destination) return []

  const maxLegs = Math.max(2, Math.min(options.maxCompositionLegs || defaultMaxCompositionLegs, defaultMaxCompositionLegs))
  const maxComposed = Math.max(1, Math.min(options.maxComposedItinerariesRetained || defaultMaxComposedItinerariesRetained, defaultMaxComposedItinerariesRetained))
  const candidates = executionCandidates(executionResult)
    .filter((candidate) => executionSegmentHasSchedule(candidate.segment))
    .sort((a, b) =>
      (executionSegmentTimeMs(a.segment, 'departure') || 0) - (executionSegmentTimeMs(b.segment, 'departure') || 0) ||
      a.segment.origin.localeCompare(b.segment.origin) ||
      a.segment.destination.localeCompare(b.segment.destination) ||
      (a.segment.flightNumber || '').localeCompare(b.segment.flightNumber || '')
    )
  const byOrigin = new Map<string, ExecutionSegmentCandidate[]>()
  candidates.forEach((candidate) => {
    if (candidate.segment.origin === candidate.segment.destination) return
    const values = byOrigin.get(candidate.segment.origin) || []
    values.push(candidate)
    byOrigin.set(candidate.segment.origin, values)
  })

  const composed: SearchExecutionItinerary[] = []
  const seen = new Set<string>()
  const walk = (selected: ExecutionSegmentCandidate[], used: Set<string>, currentAirport: string) => {
    if (composed.length >= maxComposed) return
    if (selected.length >= maxLegs) return

    for (const candidate of byOrigin.get(currentAirport) || []) {
      if (composed.length >= maxComposed) return
      const identity = executionSegmentIdentity(candidate.segment)
      if (used.has(identity)) continue
      const previous = selected.at(-1)?.segment
      if (previous && !connectionIsValid(previous, candidate.segment, options)) continue

      const nextSelected = [...selected, candidate]
      const nextUsed = new Set(used)
      nextUsed.add(identity)
      if (candidate.segment.destination === destination) {
        if (nextSelected.length < 2) continue
        const segments = nextSelected.map((item) => item.segment)
        if (segments[0]?.origin !== origin || segments.at(-1)?.destination !== destination) continue
        const signature = segments.map(executionSegmentIdentity).join('>')
        if (seen.has(signature)) continue
        seen.add(signature)
        composed.push({
          id: `origin-first-composed-${segments.map(executionSegmentIdentity).join('-')}`,
          dataQuality: composedDataQuality(segments),
          providerAttribution: mergeExecutionAttribution([
            ...nextSelected.flatMap((item) => item.attribution),
            {
              providerId: 'nonrevy-itinerary-composer',
              providerName: 'Nonrevy itinerary composer',
              fields: ['origin-first-segment-composition']
            }
          ]),
          segments,
          warnings: ['Nonrevy composed this complete itinerary from provider-returned segment schedules; every leg starts and ends on the requested same-airport chain.']
        })
        continue
      }

      walk(nextSelected, nextUsed, candidate.segment.destination)
    }
  }

  walk([], new Set(), origin)
  return composed
}

function missingDataForSearchItinerary(itinerary: SearchResultItinerary) {
  return uniqueStrings([
    ...itinerary.segments.flatMap((segment) => [
      segment.schedule.flightNumber.startsWith('Unknown') ? `${segment.origin}-${segment.destination} flight number` : '',
      segment.schedule.departureTime.startsWith('Unknown') ? `${segment.origin}-${segment.destination} departure time` : '',
      segment.schedule.arrivalTime.startsWith('Unknown') ? `${segment.origin}-${segment.destination} arrival time` : '',
      segment.schedule.seatCount.startsWith('Unknown') ? `${segment.origin}-${segment.destination} live loads` : '',
      segment.mode === 'flight' && !segment.carrier ? `${segment.origin}-${segment.destination} carrier` : ''
    ]),
    ...itinerary.missingData.filter((item) => !/flight number|departure time|arrival time|live loads|carrier/i.test(item))
  ])
}

function normalizedCarrierCode(value: unknown) {
  const code = typeof value === 'string' ? normalizeAirlineCode(value) : ''
  return /^[A-Z0-9]{2,3}$/.test(code) ? code : ''
}

function activeZedAgreementCodes(profile: TravelerProfileScaffold) {
  return uniqueStrings(profile.zedAgreements
    .filter((agreement) => agreement.active)
    .map((agreement) => normalizedCarrierCode(agreement.airlineCode)))
}

function itineraryCarrierCodes(itinerary: SearchResultItinerary) {
  return uniqueStrings(itinerary.segments
    .filter((segment) => segment.mode === 'flight')
    .map((segment) => normalizedCarrierCode(segment.carrier)))
}

function zedEligibilityLabel(status: ZedEligibilityStatus) {
  if (status === 'eligible') return 'ZED eligible'
  if (status === 'partial') return 'ZED partly confirmed'
  if (status === 'not_eligible') return 'ZED not eligible'
  return 'ZED eligibility unknown'
}

function evaluateItineraryZedEligibility(
  itinerary: SearchResultItinerary,
  mission: TripMission,
  travelerProfile: TravelerProfileScaffold
): SearchResultZedEligibility {
  const normalizedMission = normalizeTripMission(mission)
  const requiredCarriers = normalizedMission.allowZed ? itineraryCarrierCodes(itinerary) : []
  const activeAgreementCodes = activeZedAgreementCodes(travelerProfile)
  const missingCarrierCount = itinerary.segments.filter((segment) => segment.mode === 'flight' && !normalizedCarrierCode(segment.carrier)).length
  const eligibleCarriers: string[] = []
  const ineligibleCarriers: string[] = []
  const unknownCarriers: string[] = []
  const reasons: string[] = []

  if (!normalizedMission.allowZed) {
    return {
      status: 'unknown',
      label: 'ZED eligibility unknown',
      requiredCarriers,
      eligibleCarriers,
      ineligibleCarriers,
      unknownCarriers,
      revenueAlternative: normalizedMission.allowRevenue,
      action: 'Review ZED agreements',
      reasons: ['ZED travel was not requested for this search.']
    }
  }

  requiredCarriers.forEach((carrierCode) => {
    const agreement = findActiveZedAgreement(travelerProfile, carrierCode)
    if (!agreement) {
      if (activeAgreementCodes.length) {
        ineligibleCarriers.push(carrierCode)
        reasons.push(`${carrierCode}: no active stored ZED agreement for this traveler profile.`)
      } else {
        unknownCarriers.push(carrierCode)
        reasons.push(`${carrierCode}: profile has no stored active ZED agreements to verify against.`)
      }
      return
    }

    if (isEntireTravelingPartyEligible(travelerProfile, carrierCode)) {
      eligibleCarriers.push(carrierCode)
      reasons.push(`${carrierCode}: stored agreement covers the current traveling party.`)
      if (!zedAgreementVerificationIsFresh(agreement)) reasons.push(`${carrierCode}: agreement verification is stale or missing; re-check before travel.`)
      return
    }

    ineligibleCarriers.push(carrierCode)
    reasons.push(`${carrierCode}: stored agreement does not cover the entire traveling party.`)
  })

  if (missingCarrierCount) {
    unknownCarriers.push('carrier unknown')
    reasons.push('At least one scheduled flight segment lacks a carrier code, so eligibility cannot be fully determined.')
  }

  const status: ZedEligibilityStatus = ineligibleCarriers.length
    ? 'not_eligible'
    : requiredCarriers.length && eligibleCarriers.length === requiredCarriers.length && !unknownCarriers.length
      ? 'eligible'
      : eligibleCarriers.length
        ? 'partial'
        : 'unknown'

  return {
    status,
    label: zedEligibilityLabel(status),
    requiredCarriers,
    eligibleCarriers: uniqueStrings(eligibleCarriers),
    ineligibleCarriers: uniqueStrings(ineligibleCarriers),
    unknownCarriers: uniqueStrings(unknownCarriers),
    revenueAlternative: normalizedMission.allowRevenue && status === 'not_eligible',
    ...(status !== 'eligible' ? { action: 'Review ZED agreements' } : {}),
    reasons: uniqueStrings(reasons)
  }
}

function applyItineraryZedEligibility(
  itinerary: SearchResultItinerary,
  mission: TripMission,
  travelerProfile: TravelerProfileScaffold
): SearchResultItinerary {
  const zedEligibility = evaluateItineraryZedEligibility(itinerary, mission, travelerProfile)
  return {
    ...itinerary,
    requiredZedAirlines: zedEligibility.requiredCarriers,
    eligibleZedAirlines: zedEligibility.eligibleCarriers,
    revenueAirlines: zedEligibility.revenueAlternative ? zedEligibility.ineligibleCarriers : itinerary.revenueAirlines,
    zedEligibility
  }
}

function executionSegmentToBetaSegment(segment: SearchExecutionSegment, index: number): BetaItinerarySegment {
  return {
    id: `live-segment-${index + 1}`,
    origin: segment.origin,
    destination: segment.destination,
    mode: segment.transportType === 'surface' ? 'car' : segment.transportType,
    carrier: segment.carrier || segment.airlineCode || segment.airlineName,
    schedule: {
      flightNumber: segment.flightNumber || 'Unknown',
      departureTime: segment.scheduledDeparture || segment.departureTime || 'Unknown',
      arrivalTime: segment.scheduledArrival || segment.arrivalTime || 'Unknown',
      seatCount: segment.seatCount || 'Unknown - live loads not attached',
      ...(knownProviderValue(segment.scheduledDepartureUtc || segment.scheduledDeparture || segment.departureTime) ? { scheduledDepartureUtc: segment.scheduledDepartureUtc || segment.scheduledDeparture || segment.departureTime } : {}),
      ...(knownProviderValue(segment.scheduledArrivalUtc || segment.scheduledArrival || segment.arrivalTime) ? { scheduledArrivalUtc: segment.scheduledArrivalUtc || segment.scheduledArrival || segment.arrivalTime } : {}),
      ...(knownProviderValue(segment.departureTimeZone) ? { departureTimeZone: segment.departureTimeZone } : {}),
      ...(knownProviderValue(segment.arrivalTimeZone) ? { arrivalTimeZone: segment.arrivalTimeZone } : {}),
      ...(knownProviderValue(segment.departureAirportTimeZone || segment.departureTimeZone) ? { departureAirportTimeZone: segment.departureAirportTimeZone || segment.departureTimeZone } : {}),
      ...(knownProviderValue(segment.arrivalAirportTimeZone || segment.arrivalTimeZone) ? { arrivalAirportTimeZone: segment.arrivalAirportTimeZone || segment.arrivalTimeZone } : {})
    },
    estimatedDuration: segment.duration || 'Unknown',
    notes: segment.flightStatus ? [`Flight status: ${segment.flightStatus}`] : []
  }
}

function applyExecutionResultToItineraries(
  mission: TripMission,
  travelerProfile: TravelerProfileScaffold,
  itineraries: SearchResultItinerary[],
  executionResult?: SearchExecutionResult,
  options: CompositionOptions = {}
) {
  if (!executionResult?.itineraries.length) return itineraries
  const frameworkComposedExecutionItineraries = itineraries.flatMap((itinerary) => composeExecutionItinerariesForFramework(itinerary, executionResult, options))
  const originFirstComposedExecutionItineraries = composeOriginFirstExecutionItineraries(executionResult, mission, options)
  const executionItineraries = [
    ...executionResult.itineraries,
    ...frameworkComposedExecutionItineraries,
    ...originFirstComposedExecutionItineraries
  ]
  const allExecutionCandidates: ExecutionSegmentCandidate[] = executionItineraries.flatMap((executionItinerary) =>
    executionItinerary.segments.map((segment) => ({
      segment,
      attribution: attributionForCandidate(executionItinerary, segment)
    }))
  )
  const standaloneExecutionItineraries = executionItineraries.filter((executionItinerary) =>
    executionItineraryMatchesRequestedJourney(executionItinerary, mission)
  )
  const liveItineraries = standaloneExecutionItineraries.map((executionItinerary, itineraryIndex) => {
      const segments = executionItinerary.segments.map(executionSegmentToBetaSegment)
      const first = segments[0]
      const last = segments.at(-1)
    const requiredZedAirlines = normalizeTripMission(mission).allowZed ? uniqueStrings(segments.filter((segment) => segment.mode === 'flight' && segment.carrier).map((segment) => normalizeAirlineCode(segment.carrier))) : []
    const eligibleZedAirlines = requiredZedAirlines.filter((carrierCode) => isEntireTravelingPartyEligible(travelerProfile, carrierCode))
    const revenueAirlines = normalizeTripMission(mission).allowRevenue ? requiredZedAirlines.filter((carrierCode) => !eligibleZedAirlines.includes(carrierCode)) : []
    const providerHubQuality = providerHubQualityForExecutionItinerary(executionItinerary, allExecutionCandidates, options)
    const baseConfidence = executionItinerary.dataQuality === "high" ? 80 : executionItinerary.dataQuality === "medium" ? 65 : 50
      return {
        id: executionItinerary.id || `live-${itineraryIndex + 1}`,
        recommendationLabel: "Plan A" as const,
        recommendationRank: itineraryIndex + 1,
        gateway: last?.destination || first?.destination || "Unknown",
        confidence: providerHubQuality ? clampScore(baseConfidence + Math.floor(providerHubQuality.score / 10)) : baseConfidence,
      requiredZedAirlines,
      eligibleZedAirlines,
      revenueAirlines,
        ...(providerHubQuality ? { providerHubQuality } : {}),
        summary: first && last ? `${first.origin} to ${last.destination} live schedule option` : "Live schedule option",
        detailedSummary: "Live provider itinerary. Schedule data is available; nonrev loads and final success scoring are not yet attached.",
        segments,
        timeline: [],
        fallbacks: [],
        providerAttribution: executionItinerary.providerAttribution || [],
        weatherPlaceholder: "Weather intelligence not attached.",
        missingData: [],
        unknownScheduleIndicators: [],
        journeys: first && last ? [{ direction: "outbound" as const, origin: first.origin, destination: last.destination, date: executionItinerary.segments[0]?.scheduledDeparture?.slice(0, 10), segments, timeline: [] }] : []
      }
    })

  const enrichedItineraries = itineraries.map((itinerary) => {
    const matched = executionItineraries.find((executionItinerary) => executionMatchesSearchItinerary(itinerary, executionItinerary))
    if (!matched) return itinerary
    const segments = itinerary.segments.map((segment, index) => applyExecutionSegment(segment, matched.segments[index]))
    const providerHubQuality = providerHubQualityForExecutionItinerary(matched, allExecutionCandidates, options)
    const updated = {
      ...itinerary,
      segments,
      ...(providerHubQuality ? {
        providerHubQuality,
        confidence: clampScore(itinerary.confidence + Math.floor(providerHubQuality.score / 10))
      } : {}),
      providerAttribution: matched.providerAttribution || [],
      missingData: [] as string[],
      unknownScheduleIndicators: uniqueStrings(segments.flatMap(segmentUnknownScheduleIndicators))
    }
    updated.missingData = missingDataForSearchItinerary(updated)
    return updated
  })

  const itinerarySignature = (itinerary: SearchResultItinerary) =>
    itinerary.segments.map((segment) => [
      segment.origin,
      segment.destination,
      segment.carrier || "",
      segment.schedule?.flightNumber || "",
      segment.schedule?.departureTime || "",
      segment.schedule?.arrivalTime || ""
    ].join("|")).join(">")

  const seen = new Set(enrichedItineraries.map(itinerarySignature))
  const unmatchedLiveItineraries = liveItineraries.filter((itinerary) => {
    const signature = itinerarySignature(itinerary)
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })

  return [...enrichedItineraries, ...unmatchedLiveItineraries]
}

function missingDataForItinerary(itinerary: BetaItinerary) {
  return uniqueStrings([
    ...itinerary.segments.flatMap((segment) => [
      segment.schedule.flightNumber.startsWith('Unknown') ? `${segment.origin}-${segment.destination} flight number` : '',
      segment.schedule.departureTime.startsWith('Unknown') ? `${segment.origin}-${segment.destination} departure time` : '',
      segment.schedule.arrivalTime.startsWith('Unknown') ? `${segment.origin}-${segment.destination} arrival time` : '',
      segment.schedule.seatCount.startsWith('Unknown') ? `${segment.origin}-${segment.destination} live loads` : '',
      segment.mode === 'flight' && !segment.carrier ? `${segment.origin}-${segment.destination} carrier` : ''
    ]),
    itinerary.weatherSummaryPlaceholder ? 'weather intelligence' : '',
    ...itinerary.riskSummary.dataWarnings
  ])
}

function reverseSegmentsForReturn(itinerary: BetaItinerary, request: NaturalSearchObject, mission: TripMission): BetaItinerarySegment[] {
  const requestedReturnOrigin = normalizeAirportCode(request.returnOrigin) || stringValue(request.returnOrigin)
  const requestedReturnDestination = normalizeAirportCode(request.returnDestination) || stringValue(request.returnDestination)
  const reversed = itinerary.segments.map((segment, index, segments) => {
    const source = segments[segments.length - index - 1]
    return {
      ...source,
      id: `${source.id}-return-${index + 1}`,
      origin: source.destination,
      destination: source.origin,
      notes: uniqueStrings([
        ...source.notes,
        'Return route framework mirrors the outbound endpoints; provider validation required.'
      ])
    }
  })

  if (requestedReturnOrigin && reversed[0]) reversed[0] = { ...reversed[0], origin: requestedReturnOrigin }
  if (requestedReturnDestination && reversed.at(-1)) {
    reversed[reversed.length - 1] = { ...reversed[reversed.length - 1], destination: requestedReturnDestination }
  } else if (mission.originAirports[0] && reversed.at(-1)) {
    reversed[reversed.length - 1] = { ...reversed[reversed.length - 1], destination: mission.originAirports[0] }
  }
  return reversed
}

function timelineForSegments(segments: BetaItinerarySegment[], offset = 0): TravelTimelineItem[] {
  return segments.map((segment, index) => ({
    step: offset + index + 1,
    title: `${segment.origin} to ${segment.destination}`,
    description: `${segment.mode}${segment.carrier ? ` on ${segment.carrier}` : ''}; exact schedule is unknown.`,
    scheduleStatus: segment.mode === 'flight'
      ? 'Flight number, departure time, arrival time, and load data unknown.'
      : 'Surface schedule and duration unknown.'
  }))
}

function searchResultItinerary(
  itinerary: BetaItinerary,
  tripType: SearchTripType,
  request: NaturalSearchObject,
  mission: TripMission
): SearchResultItinerary {
  const returnSegments = tripType === 'round_trip' || tripType === 'open_jaw'
    ? reverseSegmentsForReturn(itinerary, request, mission)
    : []
  const returnTimeline = timelineForSegments(returnSegments, itinerary.travelTimeline.length)
  const missingData = uniqueStrings([
    ...missingDataForItinerary(itinerary),
    returnSegments.length ? 'return operating schedules' : '',
    tripType === 'open_jaw' && (!request.returnOrigin || !request.returnDestination) ? 'open-jaw return endpoints' : ''
  ])
  const unknownScheduleIndicators = uniqueStrings([
    ...itinerary.segments.flatMap(segmentUnknownScheduleIndicators),
    ...returnSegments.flatMap(segmentUnknownScheduleIndicators)
  ])

  return {
    id: itinerary.id,
    recommendationLabel: itinerary.recommendationLabel,
    recommendationRank: itinerary.recommendationRank,
    gateway: itinerary.gateway,
    confidence: itinerary.confidence,
    summary: itinerary.shortSummary,
    detailedSummary: itinerary.detailedSummary,
    segments: itinerary.segments,
    timeline: itinerary.travelTimeline,
    fallbacks: itinerary.fallbackOptions,
    requiredZedAirlines: itinerary.requiredZedAirlines,
    eligibleZedAirlines: [],
    revenueAirlines: itinerary.revenueAirlines,
    providerAttribution: [],
    weatherPlaceholder: itinerary.weatherSummaryPlaceholder,
    missingData,
    unknownScheduleIndicators,
    journeys: [
      {
        direction: 'outbound',
        origin: itinerary.origin,
        destination: itinerary.destination,
        date: mission.departureDate,
        segments: itinerary.segments,
        timeline: itinerary.travelTimeline
      },
      ...(returnSegments.length ? [{
        direction: 'return' as const,
        origin: returnSegments[0].origin,
        destination: returnSegments.at(-1)?.destination || mission.originAirports[0] || 'Origin TBD',
        date: mission.returnDate,
        segments: returnSegments,
        timeline: returnTimeline
      }] : [])
    ]
  }
}

function confidenceLabel(score: number): SearchResult['confidence']['label'] {
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

function confidenceForResult(
  recommendationResult: RecommendationResult,
  itineraries: SearchResultItinerary[],
  warnings: string[],
  missingData: string[]
) {
  const recommendationAverage = recommendationResult.recommendations.length
    ? recommendationResult.recommendations.reduce((sum, recommendation) => sum + recommendation.confidence, 0) / recommendationResult.recommendations.length
    : 0
  const itineraryAverage = itineraries.length
    ? itineraries.reduce((sum, itinerary) => sum + itinerary.confidence, 0) / itineraries.length
    : 0
  const dataQualityBoost = recommendationResult.dataQuality === 'high' ? 5 : recommendationResult.dataQuality === 'medium' ? 0 : -8
  const warningPenalty = Math.min(12, warnings.length * 2)
  const missingPenalty = Math.min(15, Math.floor(missingData.length / 2))
  const score = clampScore((recommendationAverage + itineraryAverage) / (itineraries.length ? 2 : 1) + dataQualityBoost - warningPenalty - missingPenalty)
  return {
    score,
    label: confidenceLabel(score),
    reason: itineraries.length
      ? `Based on ${itineraries.length} assembled itinerary framework${itineraries.length === 1 ? '' : 's'}, ${recommendationResult.dataQuality} data quality, and ${missingData.length} missing data indicator${missingData.length === 1 ? '' : 's'}.`
      : 'No complete itinerary framework could be assembled from the available static data.'
  }
}

function providerSignalsFromExecution(executionResult?: SearchExecutionResult): RecommendationSignals {
  if (!executionResult) return {}
  const successfulRuns = executionResult.providerRuns.filter((run) => run.status === 'success')
  const scheduleRuns = successfulRuns.filter((run) => run.capabilities.schedules || run.capabilities.routeSearch)
  const loadRuns = successfulRuns.filter((run) => run.capabilities.loads && run.diagnostics?.recordsNormalized)
  const weights = executionResult.providerHealth
    .filter((health) => health.recordsNormalized > 0)
    .map((health) => health.confidenceWeight)
  const providerConfidence = weights.length
    ? Math.round(weights.reduce((sum, value) => sum + value, 0) / weights.length)
    : undefined
  return {
    operatingScheduleDataAvailable: scheduleRuns.some((run) => (run.diagnostics?.recordsNormalized || run.itineraryCount) > 0),
    liveLoadDataAvailable: loadRuns.length > 0,
    providerConfidence,
    providerConfidenceBasis: executionResult.providerHealth.map((health) =>
      `${health.providerId}:${health.status}:${health.recordsNormalized}`
    )
  }
}

function statusRank(status: SearchExecutionProviderRun['status']) {
  const ranks: Record<SearchExecutionProviderRun['status'], number> = {
    success: 0,
    degraded: 1,
    rate_limited: 2,
    quota_exhausted: 2,
    invalid_key: 2,
    network_failure: 2,
    provider_unavailable: 2,
    timeout: 2,
    unsupported_request: 3,
    failed: 4,
    skipped: 5
  }
  return ranks[status]
}

function sumDiagnosticField(
  runs: SearchExecutionProviderRun[],
  field: NonNullable<SearchExecutionProviderRun['diagnostics']> extends infer D ? keyof D : never
) {
  return runs.reduce((total, run) => {
    const value = run.diagnostics?.[field as keyof NonNullable<SearchExecutionProviderRun['diagnostics']>]
    return total + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  }, 0)
}

function mergeExecutionRuns(runs: SearchExecutionProviderRun[]) {
  const byProvider = new Map<string, SearchExecutionProviderRun[]>()
  runs.forEach((run) => {
    const values = byProvider.get(run.providerId) || []
    values.push(run)
    byProvider.set(run.providerId, values)
  })
  return [...byProvider.values()].map((values) => {
    const best = [...values].sort((a, b) => statusRank(a.status) - statusRank(b.status))[0]
    const diagnostics = values.some((run) => run.diagnostics)
      ? {
          ...(best.diagnostics || {}),
          responseLatencyMs: sumDiagnosticField(values, 'responseLatencyMs'),
          recordsReceived: sumDiagnosticField(values, 'recordsReceived'),
          recordsNormalized: sumDiagnosticField(values, 'recordsNormalized'),
          recordsMatched: sumDiagnosticField(values, 'recordsMatched'),
          recordsUnmatched: sumDiagnosticField(values, 'recordsUnmatched'),
          requestCount: sumDiagnosticField(values, 'requestCount'),
          cached: values.every((run) => run.diagnostics?.cached === true),
          retryUsed: values.some((run) => run.diagnostics?.retryUsed === true)
        }
      : undefined
    return {
      ...best,
      itineraryCount: values.reduce((total, run) => total + run.itineraryCount, 0),
      warnings: uniqueStrings(values.flatMap((run) => run.warnings)),
      ...(diagnostics ? { diagnostics } : {})
    }
  })
}

function mergeExecutionHealth(values: ProviderHealth[]) {
  const byProvider = new Map<string, ProviderHealth[]>()
  values.forEach((health) => {
    const current = byProvider.get(health.providerId) || []
    current.push(health)
    byProvider.set(health.providerId, current)
  })
  return [...byProvider.values()].map((items) => {
    const best = [...items].sort((a, b) => String(a.status).localeCompare(String(b.status)))[0]
    return {
      ...best,
      responseLatencyMs: items.reduce((total, item) => total + item.responseLatencyMs, 0),
      recordsReceived: items.reduce((total, item) => total + item.recordsReceived, 0),
      recordsNormalized: items.reduce((total, item) => total + item.recordsNormalized, 0),
      warnings: uniqueStrings(items.flatMap((item) => item.warnings))
    }
  })
}

function mergeExecutionResults(results: SearchExecutionResult[]) {
  const values = results.filter((result) => result.providerRuns.length || result.itineraries.length)
  if (!values.length) return undefined
  const first = values[0]
  const itineraries = mergeProviderItineraries(values.flatMap((result) => result.itineraries))
  return {
    ...first,
    request: {
      ...first.request,
      routeSegments: dedupeExecutionRouteSegments(values.flatMap((result) => result.request.routeSegments || []))
    },
    itineraries,
    providerRuns: mergeExecutionRuns(values.flatMap((result) => result.providerRuns)),
    providerHealth: mergeExecutionHealth(values.flatMap((result) => result.providerHealth)),
    warnings: uniqueStrings(values.flatMap((result) => result.warnings)),
    dataQuality: values.some((result) => result.dataQuality === 'high') || itineraries.some((itinerary) => itinerary.dataQuality === 'high')
      ? 'high'
      : values.some((result) => result.dataQuality === 'medium')
        ? 'medium'
        : 'low'
  } satisfies SearchExecutionResult
}

function recommendationSignals(options: SearchPipelineOptions): RecommendationSignals | undefined {
  return options.signals || (options.executionResult ? providerSignalsFromExecution(options.executionResult) : undefined)
}

function routeDedupeKey(itinerary: SearchResultItinerary) {
  return itinerary.journeys
    .flatMap((journey) => journey.segments.map((segment) => `${journey.direction}:${segment.origin}-${segment.destination}-${segment.mode}-${segment.carrier || 'unknown'}-${segment.schedule.flightNumber}-${segment.schedule.departureTime}`))
    .join('|')
}

function dedupeSearchItineraries(itineraries: SearchResultItinerary[]) {
  const bestByRoute = new Map<string, SearchResultItinerary>()
  for (const itinerary of itineraries) {
    const key = routeDedupeKey(itinerary)
    const existing = bestByRoute.get(key)
    if (!existing || compareSearchItineraries(itinerary, existing) < 0) {
      bestByRoute.set(key, itinerary)
    }
  }
  return [...bestByRoute.values()].sort(compareSearchItineraries)
}

function zedEligibilitySortRank(itinerary: SearchResultItinerary) {
  const status = itinerary.zedEligibility?.status
  if (status === 'eligible') return 0
  if (status === 'partial') return 1
  if (status === 'unknown') return 2
  if (status === 'not_eligible') return 3
  return 2
}

function compareSearchItineraries(a: SearchResultItinerary, b: SearchResultItinerary) {
  return zedEligibilitySortRank(a) - zedEligibilitySortRank(b) ||
    (b.providerHubQuality?.score || 0) - (a.providerHubQuality?.score || 0) ||
    a.recommendationRank - b.recommendationRank ||
    b.confidence - a.confidence ||
    a.gateway.localeCompare(b.gateway)
}

export function runSearchPipeline(request: NaturalSearchObject, options: SearchPipelineOptions = {}): SearchResult {
  const now = options.now || new Date()
  const adapters = options.adapters || {}
  const warnings: string[] = []
  const pipelineTrace: SearchPipelineTraceItem[] = []

  let mission = createDefaultTripMission()
  try {
    mission = normalizeSearchMission(request)
    if (!tripMissionIsComplete(mission)) warnings.push('Trip mission is incomplete; search continues with available origin and destination framework data.')
    pipelineTrace.push(trace('trip_mission', tripMissionIsComplete(mission) ? 'ok' : 'partial', 'Trip mission normalized.'))
  } catch (error) {
    warnings.push(stageWarning('trip_mission', error))
    pipelineTrace.push(trace('trip_mission', 'failed', 'Default trip mission used after normalization failure.'))
  }

  const tripType = inferTripType(request, mission)
  const travelerProfileProvided = Boolean(request.travelerProfile)
  const travelerProfile = normalizeTravelerProfile(request.travelerProfile || defaultTravelerProfile)
  if (!travelerProfileProvided) warnings.push('Traveler profile missing; default employee profile assumptions applied.')
  pipelineTrace.push(trace('traveler_profile', travelerProfileProvided ? 'ok' : 'partial', 'Traveler profile normalized.'))

  let gateways: GatewayCandidate[] = []
  try {
    gateways = (adapters.discoverGateways || defaultDiscoverGateways)(mission)
    if (!gateways.length) warnings.push('No gateway candidates were discovered for the normalized mission.')
    pipelineTrace.push(trace('gateway_discovery', gateways.length ? 'ok' : 'partial', `${gateways.length} gateway candidate(s) discovered.`))
  } catch (error) {
    warnings.push(stageWarning('gateway_discovery', error))
    pipelineTrace.push(trace('gateway_discovery', 'failed', 'Gateway discovery failed; search continues without gateway candidates.'))
  }

  let strategies: ItineraryPlan[] = []
  try {
    strategies = (adapters.generateStrategies || defaultGenerateStrategies)(mission, gateways)
    if (!strategies.length) warnings.push('No itinerary strategies were generated from the available gateway data.')
    pipelineTrace.push(trace('itinerary_strategy', strategies.length ? 'ok' : 'partial', `${strategies.length} strategy plan(s) generated.`))
  } catch (error) {
    warnings.push(stageWarning('itinerary_strategy', error))
    pipelineTrace.push(trace('itinerary_strategy', 'failed', 'Strategy generation failed; search continues without strategies.'))
  }

  let recommendationResult = emptyRecommendationResult(mission, now)
  try {
    recommendationResult = (adapters.generateRecommendations || defaultGenerateRecommendations)(
      mission,
      strategies,
      travelerProfile,
      { gateways, signals: recommendationSignals(options), now }
    )
    if (!recommendationResult.recommendations.length) warnings.push('No recommendations were produced from the available strategy data.')
    pipelineTrace.push(trace('recommendation_engine', recommendationResult.recommendations.length ? 'ok' : 'partial', `${recommendationResult.recommendations.length} recommendation(s) produced.`))
  } catch (error) {
    const warning = stageWarning('recommendation_engine', error)
    warnings.push(warning)
    recommendationResult = emptyRecommendationResult(mission, now, [warning])
    pipelineTrace.push(trace('recommendation_engine', 'failed', 'Recommendation engine failed; empty recommendation result returned.'))
  }

  let betaItineraries: BetaItinerary[] = []
  try {
    betaItineraries = (adapters.assembleItineraries || defaultAssembleItineraries)({
      recommendationResult,
      mission,
      travelerProfile,
      gateways,
      strategies,
      now
    })
    if (!betaItineraries.length) warnings.push('No beta itineraries were assembled from the available recommendations.')
    pipelineTrace.push(trace('itinerary_assembly', betaItineraries.length ? 'ok' : 'partial', `${betaItineraries.length} beta itinerary framework(s) assembled.`))
  } catch (error) {
    warnings.push(stageWarning('itinerary_assembly', error))
    pipelineTrace.push(trace('itinerary_assembly', 'failed', 'Itinerary assembly failed; search result returned without itineraries.'))
  }

  const itineraries = dedupeSearchItineraries(applyExecutionResultToItineraries(mission, travelerProfile, dedupeSearchItineraries(betaItineraries.map((itinerary) =>
    searchResultItinerary(itinerary, tripType, request, mission)
  )), options.executionResult, options).map((itinerary) => applyItineraryZedEligibility(itinerary, mission, travelerProfile)))
  const rankedRecommendations = recommendationResult.recommendations.map(recommendationSummary)
  const missingData = uniqueStrings([
    !mission.originAirports.length ? 'origin airports' : '',
    !(mission.destinationRegion || mission.preferredDestinations.length) ? 'destination' : '',
    !mission.departureDate ? 'departure date' : '',
    tripType !== 'one_way' && !mission.returnDate ? 'return date' : '',
    ...itineraries.flatMap((itinerary) => itinerary.missingData),
    recommendationResult.dataQuality !== 'high' ? `${recommendationResult.dataQuality} recommendation data quality` : ''
  ])
  const unknownScheduleIndicators = uniqueStrings([
    ...unknownScheduleTexts,
    ...itineraries.flatMap((itinerary) => itinerary.unknownScheduleIndicators)
  ])
  const allWarnings = uniqueStrings([
    ...warnings,
    ...(options.executionResult?.warnings || []),
    ...recommendationResult.warnings,
    ...itineraries.flatMap((itinerary) => itinerary.missingData.filter((item) => /unavailable|unknown|missing|not attached/i.test(item)))
  ])
  const confidence = confidenceForResult(recommendationResult, itineraries, allWarnings, missingData)
  const segments = itineraries.flatMap((itinerary) => itinerary.segments)
  const timeline = itineraries[0]?.timeline || []
  const fallbacks = itineraries[0]?.fallbacks || []
  const weatherPlaceholder = 'Weather not evaluated yet; attach weather intelligence before travel decisions.'
  const summary = itineraries.length
    ? `${itineraries.length} ranked itinerary framework${itineraries.length === 1 ? '' : 's'} assembled. Best option: ${itineraries[0].summary} Confidence ${confidence.score} (${confidence.label}).`
    : `No complete itinerary framework assembled. Confidence ${confidence.score} (${confidence.label}).`

  pipelineTrace.push(trace('final_result', itineraries.length ? 'ok' : 'partial', summary))
  if (options.executionResult) {
    const successCount = options.executionResult.providerRuns.filter((run) => run.status === 'success').length
    pipelineTrace.push(trace(
      'final_result',
      successCount ? 'ok' : options.executionResult.providerRuns.length ? 'partial' : 'partial',
      `Search execution providers completed: ${successCount}/${options.executionResult.providerRuns.length} successful.`
    ))
  }

  return {
    id: `search-${now.toISOString()}`,
    generatedAt: now.toISOString(),
    tripType,
    mission,
    travelerProfile,
    gateways,
    strategies,
    recommendationResult,
    recommendations: recommendationBuckets(rankedRecommendations),
    itineraries,
    confidence,
    warnings: allWarnings,
    missingData,
    unknownScheduleIndicators,
    weatherPlaceholder,
    segments,
    summary,
    timeline,
    fallbacks,
    providerRuns: options.executionResult?.providerRuns || [],
    providerHealth: options.executionResult?.providerHealth || [],
    pipelineTrace,
    assumptions: uniqueStrings([
      ...tripMissionAssumptions(mission),
      ...travelerProfileAssumptions(travelerProfile),
      ...gatewayAssumptions(mission, gateways),
      ...strategyAssumptions(mission, gateways),
      ...recommendationResultAssumptions(recommendationResult),
      ...itineraryAssemblyAssumptions(betaItineraries)
    ])
  }
}

export async function runSearchPipelineWithExecution(request: NaturalSearchObject, options: SearchPipelineOptions = {}): Promise<SearchResult> {
  const now = options.now || new Date()
  const mission = normalizeSearchMission(request)
  const tripType = inferTripType(request, mission)
  const travelerProfile = normalizeTravelerProfile(request.travelerProfile || defaultTravelerProfile)
  const maxProviderRoutePairs = Math.max(1, Math.min(options.maxProviderRoutePairs || defaultMaxProviderRoutePairs, defaultMaxProviderRoutePairs))
  const maxConnectionHubs = Math.max(0, Math.min(options.maxConnectionHubsSearched ?? defaultMaxConnectionHubsSearched, defaultMaxConnectionHubsSearched))
  const maxOriginFirstHubs = Math.max(0, Math.min(options.maxOriginFirstHubsSearched ?? defaultMaxOriginFirstHubsSearched, defaultMaxOriginFirstHubsSearched))
  const directThreshold = Math.max(0, options.connectionSearchMinimumDirectItineraries ?? defaultConnectionSearchMinimumDirectItineraries)
  const staticResult = runSearchPipeline(request, {
    ...options,
    now,
    executionResult: undefined,
    executionProviders: undefined
  })
  const executionEngineOptions = {
    ...(options.providerManager
      ? { providerManager: options.providerManager }
      : options.executionProviders
        ? { providers: options.executionProviders }
        : { providerManager: createDefaultProviderManager({
            now: () => now,
            timeoutMs: options.executionTimeoutMs,
            maxAirportPairs: maxProviderRoutePairs,
            maxResultsPerPair: Math.max(1, Math.min(options.maxSegmentCandidatesPerRoutePair || defaultMaxSegmentCandidatesPerRoutePair, defaultMaxSegmentCandidatesPerRoutePair))
          }) }),
    timeoutMs: options.executionTimeoutMs
  }
  const createExecutionEngine = () => new SearchExecutionEngine(executionEngineOptions)
  const directSegments = directExecutionRouteSegments(mission)
  const frameworkSegments = staticResult ? routeSegmentsForExecution(staticResult) : []
  const baseRouteSegments = dedupeExecutionRouteSegments(directSegments).slice(0, maxProviderRoutePairs)
  const executionRequest = {
    mission,
    tripType,
    travelerCount: mission.travelers,
    travelerProfile,
    routeSegments: baseRouteSegments
  }
  const executeSegmentBatches = async (segments: ExecutionRouteSegment[], batchSize = 4) => {
    if (!segments.length) return undefined
    const results: SearchExecutionResult[] = []
    for (let index = 0; index < segments.length; index += batchSize) {
      const routeSegments = segments.slice(index, index + batchSize)
      results.push(await createExecutionEngine().execute({
        ...executionRequest,
        routeSegments
      }))
    }
    return mergeExecutionResults(results)
  }
  const directExecutionResult = await createExecutionEngine().execute(executionRequest)
  const needsConnectionDiscovery = directScheduledItineraryCount(directExecutionResult, mission) < directThreshold
  const originDiscoverySegments = needsConnectionDiscovery
    ? originDepartureDiscoveryRouteSegments({
        mission,
        existingSegments: baseRouteSegments,
        maxProviderRoutePairs
      })
    : []
  const originDiscoveryResult = originDiscoverySegments.length
    ? await createExecutionEngine().execute({
        ...executionRequest,
        routeSegments: originDiscoverySegments
      })
    : undefined
  const originDiscoveryBaseResult = mergeExecutionResults([directExecutionResult, ...(originDiscoveryResult ? [originDiscoveryResult] : [])]) || directExecutionResult
  const firstHopHubs = scheduledDepartureHubsFromOrigin(originDiscoveryBaseResult, mission, maxOriginFirstHubs)
  const destinationHubs = staticResult.gateways
    .map((gateway) => normalizeAirportCode(gateway.airportCode))
    .filter((hub, index, values) => hub && values.indexOf(hub) === index)
    .slice(0, maxConnectionHubs)
  const staticExpansionSegments = needsConnectionDiscovery
    ? sameAirportConnectionRouteSegments({
        mission,
        gateways: staticResult.gateways,
        existingSegments: baseRouteSegments,
        maxConnectionHubs,
        maxProviderRoutePairs
      })
    : []
  const originFirstExpansionSegments = needsConnectionDiscovery
    ? originFirstConnectionRouteSegments({
        mission,
        firstHopHubs,
        destinationHubs,
        existingSegments: [...baseRouteSegments, ...originDiscoverySegments, ...staticExpansionSegments],
        maxProviderRoutePairs
      })
    : []
  const expansionSegments = dedupeExecutionRouteSegments([...staticExpansionSegments, ...originFirstExpansionSegments])
  const expansionResult = await executeSegmentBatches(expansionSegments)
  const expandedExecutionResult = mergeExecutionResults([
    directExecutionResult,
    ...(originDiscoveryResult ? [originDiscoveryResult] : []),
    ...(expansionResult ? [expansionResult] : [])
  ]) || directExecutionResult

  const graphDiscoveryNeeded = needsConnectionDiscovery &&
    composeOriginFirstExecutionItineraries(expandedExecutionResult, mission, options).length === 0
  const graphDepartureSegments = graphDiscoveryNeeded
    ? providerDiscoveredHubDepartureSegments({
        mission,
        firstHopHubs,
        existingSegments: [...baseRouteSegments, ...originDiscoverySegments, ...staticExpansionSegments, ...originFirstExpansionSegments],
        maxProviderRoutePairs
      })
    : []
  const graphDepartureResult = graphDepartureSegments.length
    ? await createExecutionEngine().execute({
        ...executionRequest,
        routeSegments: graphDepartureSegments
      })
    : undefined
  const graphBaseResult = mergeExecutionResults([
    expandedExecutionResult,
    ...(graphDepartureResult ? [graphDepartureResult] : [])
  ]) || expandedExecutionResult
  const graphDestinationSegments = graphDiscoveryNeeded
    ? providerDiscoveredDestinationSegments({
        mission,
        onwardHubs: providerDiscoveredOnwardHubs(graphBaseResult, mission, firstHopHubs, maxOriginFirstHubs),
        existingSegments: [
          ...baseRouteSegments,
          ...originDiscoverySegments,
          ...staticExpansionSegments,
          ...originFirstExpansionSegments,
          ...graphDepartureSegments
        ],
        maxProviderRoutePairs
      })
    : []
  const graphDestinationResult = await executeSegmentBatches(graphDestinationSegments)
  const executionResult = mergeExecutionResults([
    graphBaseResult,
    ...(graphDestinationResult ? [graphDestinationResult] : [])
  ]) || graphBaseResult

  return runSearchPipeline(request, {
    ...options,
    now,
    executionResult
  })
}

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
  type TravelerProfileScaffold
} from './travelerProfile'

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

function routeDedupeKey(itinerary: SearchResultItinerary) {
  return itinerary.journeys
    .flatMap((journey) => journey.segments.map((segment) => `${journey.direction}:${segment.origin}-${segment.destination}-${segment.mode}-${segment.carrier || 'unknown'}`))
    .join('|')
}

function dedupeSearchItineraries(itineraries: SearchResultItinerary[]) {
  const bestByRoute = new Map<string, SearchResultItinerary>()
  for (const itinerary of itineraries) {
    const key = routeDedupeKey(itinerary)
    const existing = bestByRoute.get(key)
    if (!existing || itinerary.recommendationRank < existing.recommendationRank || itinerary.confidence > existing.confidence) {
      bestByRoute.set(key, itinerary)
    }
  }
  return [...bestByRoute.values()].sort((a, b) =>
    a.recommendationRank - b.recommendationRank ||
    b.confidence - a.confidence ||
    a.gateway.localeCompare(b.gateway)
  )
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
      { gateways, signals: options.signals, now }
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

  const itineraries = dedupeSearchItineraries(betaItineraries.map((itinerary) =>
    searchResultItinerary(itinerary, tripType, request, mission)
  ))
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


import { type GatewayCandidate } from './gatewayDiscovery'
import {
  generateRecommendations,
  type RecommendationResult,
  type StrategyRisk,
  type TripRecommendation
} from './recommendationEngine'
import { type ItineraryPlan, type StrategyLeg } from './itineraryStrategy'
import { type TripMission, normalizeTripMission } from './tripMission'
import { defaultTravelerProfile, normalizeTravelerProfile, type TravelerProfileScaffold } from './travelerProfile'

export type ItineraryTransportMode = StrategyLeg['transportType']

export type ItinerarySegmentSchedule = {
  flightNumber: 'Unknown - not provided by route framework'
  departureTime: 'Unknown - provider schedule validation required'
  arrivalTime: 'Unknown - provider schedule validation required'
  seatCount: 'Unknown - live load data not attached'
}

export type BetaItinerarySegment = {
  id: string
  origin: string
  destination: string
  mode: ItineraryTransportMode
  carrier?: string
  schedule: ItinerarySegmentSchedule
  estimatedDuration: string
  notes: string[]
}

export type GroundTransfer = {
  from: string
  to: string
  mode: 'rail' | 'ferry' | 'car' | 'surface'
  reason: string
  schedule: 'Unknown - ground schedule provider not attached'
}

export type RiskSummary = {
  severity: 'low' | 'medium' | 'high' | 'critical'
  items: string[]
  dataWarnings: string[]
}

export type TravelTimelineItem = {
  step: number
  title: string
  description: string
  scheduleStatus: string
}

export type FallbackOption = {
  label: string
  summary: string
  trigger: string
}

export type BetaItinerary = {
  id: string
  origin: string
  gateway: string
  destination: string
  segments: BetaItinerarySegment[]
  transportMode: string
  transportModes: ItineraryTransportMode[]
  estimatedDuration: string
  connectionCount: number
  overnight: boolean
  groundTransfers: GroundTransfer[]
  requiredZedAirlines: string[]
  revenueAirlines: string[]
  riskSummary: RiskSummary
  weatherSummaryPlaceholder: string
  confidence: number
  recommendationRank: number
  recommendationLabel: TripRecommendation['label']
  shortSummary: string
  detailedSummary: string
  travelTimeline: TravelTimelineItem[]
  recommendedCheckpoints: string[]
  fallbackOptions: FallbackOption[]
  humanReadableSummary: string
}

export type ItineraryAssemblyInput = {
  recommendationResult?: RecommendationResult
  recommendations?: RecommendationResult
  mission: TripMission
  travelerProfile?: Partial<TravelerProfileScaffold>
  gateways?: GatewayCandidate[]
  strategies?: ItineraryPlan[]
  now?: Date
}

const unknownSchedule: ItinerarySegmentSchedule = {
  flightNumber: 'Unknown - not provided by route framework',
  departureTime: 'Unknown - provider schedule validation required',
  arrivalTime: 'Unknown - provider schedule validation required',
  seatCount: 'Unknown - live load data not attached'
}

const severityWeight: Record<RiskSummary['severity'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeCarrierCode(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9]{2,3}$/.test(value.trim()) ? value.trim().toUpperCase() : ''
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)]
}

function segmentId(recommendation: TripRecommendation, leg: StrategyLeg, index: number) {
  return `${recommendation.id}-segment-${index + 1}-${leg.origin}-${leg.destination}-${leg.transportType}`.toLowerCase()
}

function flightCarriers(legs: StrategyLeg[]) {
  return uniqueStrings(legs
    .filter((leg) => leg.transportType === 'flight')
    .map((leg) => normalizeCarrierCode(leg.carrier))
    .filter(Boolean))
}

function betaSegment(recommendation: TripRecommendation, leg: StrategyLeg, index: number): BetaItinerarySegment {
  const carrier = normalizeCarrierCode(leg.carrier)
  return {
    id: segmentId(recommendation, leg, index),
    origin: leg.origin,
    destination: leg.destination,
    mode: leg.transportType,
    ...(carrier ? { carrier } : {}),
    schedule: { ...unknownSchedule },
    estimatedDuration: 'Unknown - provider schedule validation required',
    notes: uniqueStrings([
      leg.notes || '',
      leg.transportType === 'flight' ? 'Flight number, departure time, arrival time, and live loads are not attached.' : '',
      leg.transportType !== 'flight' ? 'Surface schedule and booking availability are not attached.' : ''
    ].filter(Boolean))
  }
}

function transportModes(segments: BetaItinerarySegment[]) {
  return uniqueStrings(segments.map((segment) => segment.mode)) as ItineraryTransportMode[]
}

function transportModeSummary(modes: ItineraryTransportMode[]) {
  if (!modes.length) return 'unknown'
  if (modes.length === 1) return modes[0]
  return `mixed: ${modes.join(' + ')}`
}

function connectionCount(segments: BetaItinerarySegment[]) {
  return Math.max(0, segments.length - 1)
}

function groundTransfers(segments: BetaItinerarySegment[]): GroundTransfer[] {
  const transfers: GroundTransfer[] = []
  segments.forEach((segment, index) => {
    if (segment.mode !== 'flight') {
      transfers.push({
        from: segment.origin,
        to: segment.destination,
        mode: segment.mode === 'rail' || segment.mode === 'ferry' || segment.mode === 'car' ? segment.mode : 'surface',
        reason: `${segment.mode} segment included in the generated route framework.`,
        schedule: 'Unknown - ground schedule provider not attached'
      })
    }

    const next = segments[index + 1]
    if (next && segment.destination !== next.origin) {
      transfers.push({
        from: segment.destination,
        to: next.origin,
        mode: 'surface',
        reason: 'Surface transfer required because adjacent segment endpoints do not touch.',
        schedule: 'Unknown - ground schedule provider not attached'
      })
    }
  })
  return transfers
}

function overnightIndicator(segments: BetaItinerarySegment[], risks: StrategyRisk[]) {
  if (segments.length >= 4) return true
  if (segments.some((segment) => segment.notes.some((note) => /overnight/i.test(note)))) return true
  return risks.some((risk) => /overnight/i.test(`${risk.title} ${risk.description} ${risk.trigger || ''}`))
}

function strongestSeverity(risks: StrategyRisk[]): RiskSummary['severity'] {
  return risks.reduce<RiskSummary['severity']>((strongest, risk) =>
    severityWeight[risk.severity] > severityWeight[strongest] ? risk.severity : strongest
  , 'low')
}

function riskSummary(recommendation: TripRecommendation): RiskSummary {
  const items = uniqueStrings([
    ...recommendation.risks.map((risk) => `${risk.title}: ${risk.description}`),
    ...recommendation.explanation.weaknesses
  ])
  return {
    severity: strongestSeverity(recommendation.risks),
    items: items.length ? items : ['No high-specificity risks attached to this static framework.'],
    dataWarnings: uniqueStrings(recommendation.dataWarnings)
  }
}

function estimateDuration(segments: BetaItinerarySegment[], overnight: boolean) {
  const prefix = overnight ? 'Unknown - possible overnight; ' : 'Unknown - '
  return `${prefix}provider schedule validation required across ${segments.length} segment${segments.length === 1 ? '' : 's'}`
}

function confidenceFor(recommendation: TripRecommendation, segments: BetaItinerarySegment[]) {
  const scheduleUnknownPenalty = segments.some((segment) => segment.schedule.departureTime.startsWith('Unknown')) ? 5 : 0
  const carrierUnknownPenalty = segments.some((segment) => segment.mode === 'flight' && !segment.carrier) ? 6 : 0
  const surfacePenalty = segments.some((segment) => segment.mode !== 'flight') ? 2 : 0
  return clampScore(recommendation.confidence - scheduleUnknownPenalty - carrierUnknownPenalty - surfacePenalty)
}

function destinationFor(mission: TripMission, segments: BetaItinerarySegment[]) {
  const normalized = normalizeTripMission(mission)
  return segments.at(-1)?.destination ||
    normalized.preferredDestinations[0] ||
    normalized.destinationRegion ||
    'Destination TBD'
}

function originFor(mission: TripMission, segments: BetaItinerarySegment[]) {
  const normalized = normalizeTripMission(mission)
  return segments[0]?.origin ||
    normalized.preferredDepartureAirports[0] ||
    normalized.originAirports[0] ||
    'Origin TBD'
}

function revenueAirlinesFor(mission: TripMission, recommendation: TripRecommendation, requiredZedAirlines: string[]) {
  const normalized = normalizeTripMission(mission)
  if (!normalized.allowRevenue) return []
  const eligible = new Set(recommendation.eligibleZedAirlines)
  return requiredZedAirlines.filter((airline) => !eligible.has(airline))
}

function shortSummary(label: TripRecommendation['label'], origin: string, destination: string, gateway: string, modes: ItineraryTransportMode[]) {
  return `${label}: ${origin} to ${destination} via ${gateway} using ${transportModeSummary(modes)}.`
}

function detailedSummary(
  recommendation: TripRecommendation,
  segments: BetaItinerarySegment[],
  risk: RiskSummary,
  requiredZedAirlines: string[],
  revenueAirlines: string[]
) {
  const route = [segments[0]?.origin, ...segments.map((segment) => segment.destination)].filter(Boolean).join(' -> ')
  const zed = requiredZedAirlines.length ? `ZED verification needed for ${requiredZedAirlines.join(', ')}.` : 'No carrier-specific ZED requirement is confirmed from this framework.'
  const revenue = revenueAirlines.length ? `Revenue backup airlines to price manually: ${revenueAirlines.join(', ')}.` : 'No revenue airline backup is identified from known flight carriers.'
  return `${recommendation.label} ranks ${recommendation.rank} with ${recommendation.confidence}% recommendation confidence before assembly adjustments. Route framework: ${route}. ${zed} ${revenue} Highest risk level: ${risk.severity}. Schedule, loads, flight numbers, and weather require provider validation.`
}

function travelTimeline(segments: BetaItinerarySegment[]): TravelTimelineItem[] {
  return segments.map((segment, index) => ({
    step: index + 1,
    title: `${segment.origin} to ${segment.destination}`,
    description: `${segment.mode}${segment.carrier ? ` on ${segment.carrier}` : ''}; exact schedule is unknown.`,
    scheduleStatus: segment.mode === 'flight'
      ? 'Flight number, departure time, arrival time, and load data unknown.'
      : 'Surface schedule and duration unknown.'
  }))
}

function recommendedCheckpoints(mission: TripMission, profileInput: Partial<TravelerProfileScaffold>, requiredZedAirlines: string[]) {
  const normalized = normalizeTripMission(mission)
  const profile = normalizeTravelerProfile(profileInput)
  return uniqueStrings([
    normalized.departureDate ? `Verify operating schedules for ${normalized.departureDate}.` : 'Select a departure date before provider schedule validation.',
    'Confirm every segment endpoint matches the route framework before display.',
    requiredZedAirlines.length ? `Re-check ZED eligibility for ${requiredZedAirlines.join(', ')} for the ${profile.travelerType.toLowerCase()} profile.` : '',
    normalized.allowRevenue ? 'Price revenue backup manually; no fare or availability API is attached.' : '',
    'Check live standby/load signals in approved provider surfaces before travel.',
    'Refresh weather once a weather provider is attached.'
  ].filter(Boolean))
}

function fallbackOptions(recommendation: TripRecommendation, allRecommendations: TripRecommendation[]): FallbackOption[] {
  const alternates = allRecommendations
    .filter((alternate) => alternate.id !== recommendation.id)
    .slice(0, 2)
    .map((alternate) => ({
      label: alternate.label,
      summary: `${alternate.label} via ${alternate.plan.gateway}`,
      trigger: recommendation.explanation.switchConditions[0] || 'Switch if the primary route framework becomes invalid.'
    }))

  if (alternates.length) return alternates
  return recommendation.plan.backupTriggers.slice(0, 2).map((trigger, index) => ({
    label: `Fallback ${index + 1}`,
    summary: trigger,
    trigger
  }))
}

function routeDedupeKey(itinerary: BetaItinerary) {
  return [
    itinerary.origin,
    itinerary.gateway,
    itinerary.destination,
    itinerary.segments.map((segment) => `${segment.origin}-${segment.destination}-${segment.mode}-${segment.carrier || 'unknown'}`).join('|')
  ].join(':')
}

function collapseEquivalentRoutes(itineraries: BetaItinerary[]) {
  const bestByRoute = new Map<string, BetaItinerary>()
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

function assembleRecommendation(
  recommendation: TripRecommendation,
  mission: TripMission,
  profile: Partial<TravelerProfileScaffold>,
  allRecommendations: TripRecommendation[]
): BetaItinerary {
  const segments = recommendation.plan.legs.map((leg, index) => betaSegment(recommendation, leg, index))
  const modes = transportModes(segments)
  const risk = riskSummary(recommendation)
  const overnight = overnightIndicator(segments, recommendation.risks)
  const requiredZedAirlines = normalizeTripMission(mission).allowZed ? flightCarriers(recommendation.plan.legs) : []
  const revenueAirlines = revenueAirlinesFor(mission, recommendation, requiredZedAirlines)
  const origin = originFor(mission, segments)
  const destination = destinationFor(mission, segments)
  const summary = shortSummary(recommendation.label, origin, destination, recommendation.plan.gateway, modes)
  const detailed = detailedSummary(recommendation, segments, risk, requiredZedAirlines, revenueAirlines)

  return {
    id: `itinerary-${recommendation.id}`,
    origin,
    gateway: recommendation.plan.gateway,
    destination,
    segments,
    transportMode: transportModeSummary(modes),
    transportModes: modes,
    estimatedDuration: estimateDuration(segments, overnight),
    connectionCount: connectionCount(segments),
    overnight,
    groundTransfers: groundTransfers(segments),
    requiredZedAirlines,
    revenueAirlines,
    riskSummary: risk,
    weatherSummaryPlaceholder: 'Weather not evaluated yet; attach weather intelligence before travel decisions.',
    confidence: confidenceFor(recommendation, segments),
    recommendationRank: recommendation.rank,
    recommendationLabel: recommendation.label,
    shortSummary: summary,
    detailedSummary: detailed,
    travelTimeline: travelTimeline(segments),
    recommendedCheckpoints: recommendedCheckpoints(mission, profile, requiredZedAirlines),
    fallbackOptions: fallbackOptions(recommendation, allRecommendations),
    humanReadableSummary: `${summary} ${detailed}`
  }
}

export function assembleItineraries(input: ItineraryAssemblyInput): BetaItinerary[] {
  const profile = input.travelerProfile || defaultTravelerProfile
  const recommendationResult = input.recommendationResult || input.recommendations || generateRecommendations(
    input.mission,
    input.strategies || [],
    profile,
    { gateways: input.gateways || [], now: input.now }
  )

  const itineraries = recommendationResult.recommendations.map((recommendation) =>
    assembleRecommendation(recommendation, input.mission, profile, recommendationResult.recommendations)
  )

  return collapseEquivalentRoutes(itineraries)
}

export function itineraryAssemblyAssumptions(itineraries: BetaItinerary[]) {
  return [
    `Assembled itineraries: ${itineraries.length}`,
    'Flight numbers, departure times, arrival times, seat counts, fares, and live loads are not inferred.',
    'Weather summary is a placeholder until weather intelligence is attached.',
    'Equivalent routes are collapsed by route endpoints, transport modes, and known carriers.'
  ]
}

import { type GatewayCandidate, discoverGateways } from './gatewayDiscovery'
import { type TripMission, normalizeTripMission } from './tripMission'

export interface StrategyLeg {
  origin: string
  destination: string
  transportType: 'flight' | 'rail' | 'ferry' | 'car'
  carrier?: string
  notes?: string
}

export interface ItineraryPlan {
  id: string
  title: string
  gateway: string
  score: number
  risk: number
  confidence: number
  estimatedSuccess: number
  reasons: string[]
  backupTriggers: string[]
  legs: StrategyLeg[]
}

const SCORE_WEIGHTS = {
  missionSuccess: 0.4,
  gatewayScore: 0.25,
  zedCoverage: 0.2,
  travelSimplicity: 0.15
}

const PLAN_LABELS = ['A', 'B', 'C'] as const

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeAirportCode(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim()) ? value.trim().toUpperCase() : ''
}

function uniqueGateways(gateways: GatewayCandidate[]) {
  const seen = new Set<string>()
  return gateways.filter((gateway) => {
    const code = normalizeAirportCode(gateway.airportCode)
    if (!code || seen.has(code)) return false
    seen.add(code)
    return true
  })
}

function primaryOrigin(mission: TripMission) {
  const normalized = normalizeTripMission(mission)
  return normalized.preferredDepartureAirports[0] || normalized.originAirports[0] || 'Origin airport TBD'
}

function destinationLabel(mission: TripMission, gateway: GatewayCandidate) {
  const normalized = normalizeTripMission(mission)
  if (normalized.preferredDestinations.length) return normalized.preferredDestinations[0]
  if (mission.destinationRegion === 'Japan') return gateway.city === 'Tokyo' ? gateway.airportCode : 'Japan'
  return normalized.destinationRegion || mission.destinationRegion || 'Destination region TBD'
}

function surfaceTransportForMission(mission: TripMission): StrategyLeg['transportType'] {
  const normalized = normalizeTripMission(mission)
  if (normalized.allowRail) return 'rail'
  if (normalized.allowFerry) return 'ferry'
  return 'flight'
}

function buildLegs(mission: TripMission, gateway: GatewayCandidate, planIndex: number): StrategyLeg[] {
  const origin = primaryOrigin(mission)
  const destination = destinationLabel(mission, gateway)
  const legs: StrategyLeg[] = [
    {
      origin,
      destination: gateway.airportCode,
      transportType: 'flight',
      notes: 'Gateway positioning framework; provider validation required'
    }
  ]

  if (destination !== gateway.airportCode) {
    legs.push({
      origin: gateway.airportCode,
      destination,
      transportType: planIndex === 2 ? surfaceTransportForMission(mission) : 'flight',
      notes: 'Onward segment framework; provider validation required'
    })
  }

  return legs
}

function missionSuccessScore(mission: TripMission, gateway: GatewayCandidate) {
  const normalized = normalizeTripMission(mission)
  const completenessBoost = normalized.originAirports.length && (normalized.destinationRegion || normalized.preferredDestinations.length) ? 6 : 0
  const zedFit = normalized.allowZed ? gateway.zedCoverageScore : 78
  return clampScore(
    gateway.historicalReliabilityScore * 0.5 +
    gateway.onwardConnectivityScore * 0.25 +
    zedFit * 0.2 +
    completenessBoost
  )
}

function travelSimplicityScore(legs: StrategyLeg[]) {
  const segmentPenalty = Math.max(0, legs.length - 1) * 10
  const surfacePenalty = legs.some((leg) => leg.transportType !== 'flight') ? 4 : 0
  return clampScore(100 - segmentPenalty - surfacePenalty)
}

export function scoreStrategy(mission: TripMission, gateway: GatewayCandidate, legs: StrategyLeg[] = buildLegs(mission, gateway, 0)) {
  const missionSuccess = missionSuccessScore(mission, gateway)
  const simplicity = travelSimplicityScore(legs)
  return clampScore(
    missionSuccess * SCORE_WEIGHTS.missionSuccess +
    gateway.score * SCORE_WEIGHTS.gatewayScore +
    gateway.zedCoverageScore * SCORE_WEIGHTS.zedCoverage +
    simplicity * SCORE_WEIGHTS.travelSimplicity
  )
}

function reasonsForPlan(gateway: GatewayCandidate, score: number, legs: StrategyLeg[], planIndex: number) {
  const reasons: string[] = []
  if (planIndex === 0) reasons.push('Highest gateway score')
  if (legs.length <= 2) reasons.push('Shortest overall route')
  if (gateway.onwardConnectivityScore >= 90) reasons.push('Multiple onward options')
  if (gateway.zedCoverageScore >= 85) reasons.push('Good ZED coverage')
  if (travelSimplicityScore(legs) >= 90) reasons.push('Lowest travel complexity')
  if (score >= 88) reasons.push('Strong mission fit')
  return reasons.length ? reasons : ['Balanced backup strategy']
}

function backupTriggers(mission: TripMission) {
  const normalized = normalizeTripMission(mission)
  return [
    'If first flight closes',
    'If weather deteriorates',
    normalized.allowZed ? 'If no onward ZED' : undefined,
    'If gateway becomes unavailable'
  ].filter((trigger): trigger is string => Boolean(trigger))
}

function createPlan(mission: TripMission, gateway: GatewayCandidate, planIndex: number): ItineraryPlan {
  const label = PLAN_LABELS[planIndex] || 'C'
  const legs = buildLegs(mission, gateway, planIndex)
  const score = scoreStrategy(mission, gateway, legs)
  const confidence = clampScore((gateway.score + gateway.historicalReliabilityScore + travelSimplicityScore(legs)) / 3)
  const estimatedSuccess = missionSuccessScore(mission, gateway)
  return {
    id: `plan-${label.toLowerCase()}-${gateway.airportCode.toLowerCase()}`,
    title: `Plan ${label}: ${gateway.city} gateway`,
    gateway: gateway.airportCode,
    score,
    risk: clampScore(100 - score),
    confidence,
    estimatedSuccess,
    reasons: reasonsForPlan(gateway, score, legs, planIndex),
    backupTriggers: backupTriggers(mission),
    legs
  }
}

function planForIndex(mission: TripMission, gateways: GatewayCandidate[], planIndex: number) {
  const gateway = uniqueGateways(gateways)[planIndex]
  return gateway ? createPlan(mission, gateway, planIndex) : undefined
}

export function generatePlanA(mission: TripMission, gateways: GatewayCandidate[] = discoverGateways(mission)) {
  return planForIndex(mission, gateways, 0)
}

export function generatePlanB(mission: TripMission, gateways: GatewayCandidate[] = discoverGateways(mission)) {
  return planForIndex(mission, gateways, 1)
}

export function generatePlanC(mission: TripMission, gateways: GatewayCandidate[] = discoverGateways(mission)) {
  return planForIndex(mission, gateways, 2)
}

export function sortStrategies(plans: Array<ItineraryPlan | undefined>) {
  const uniquePlans = new Map<string, ItineraryPlan>()
  for (const plan of plans) {
    if (!plan) continue
    const key = `${plan.gateway}:${plan.legs.map((leg) => `${leg.origin}-${leg.destination}-${leg.transportType}`).join('|')}`
    const existing = uniquePlans.get(key)
    if (!existing || plan.score > existing.score) uniquePlans.set(key, plan)
  }
  return [...uniquePlans.values()].sort((a, b) =>
    b.score - a.score ||
    a.risk - b.risk ||
    b.confidence - a.confidence ||
    a.gateway.localeCompare(b.gateway)
  )
}

export function generateStrategies(mission: TripMission, gateways: GatewayCandidate[] = discoverGateways(mission)) {
  const normalized = normalizeTripMission(mission)
  if (!normalized.originAirports.length || !(normalized.destinationRegion || normalized.preferredDestinations.length || mission.destinationRegion)) return []
  return sortStrategies([
    generatePlanA(mission, gateways),
    generatePlanB(mission, gateways),
    generatePlanC(mission, gateways)
  ])
}

export function strategyAssumptions(mission: TripMission, gateways: GatewayCandidate[] = discoverGateways(mission)) {
  const normalized = normalizeTripMission(mission)
  return [
    `Origin airports: ${normalized.originAirports.join(', ') || 'not set'}`,
    `Destination: ${normalized.preferredDestinations[0] || normalized.destinationRegion || mission.destinationRegion || 'not set'}`,
    `Gateway candidates: ${uniqueGateways(gateways).length}`,
    'Plan count: up to 3 distinct gateway choices',
    'Scoring weights: mission success 40%, gateway score 25%, ZED coverage 20%, travel simplicity 15%',
    'Provider validation: not included yet'
  ]
}

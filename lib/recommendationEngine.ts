import { type GatewayCandidate } from './gatewayDiscovery'
import { type ItineraryPlan, generateStrategies } from './itineraryStrategy'
import { type TripMission, normalizeTripMission, tripMissionAssumptions } from './tripMission'
import {
  defaultTravelerProfile,
  findActiveZedAgreement,
  isEntireTravelingPartyEligible,
  normalizeTravelerProfile,
  zedAgreementVerificationIsFresh,
  type TravelerProfileScaffold,
  type ZedAgreementRecord
} from './travelerProfile'

export type RiskSeverity =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

export type RecommendationStatus =
  | 'recommended'
  | 'viable'
  | 'backup'
  | 'avoid'

export interface StrategyRisk {
  code: string
  title: string
  description: string
  severity: RiskSeverity
  scoreImpact: number
  trigger?: string
}

export interface RecommendationExplanation {
  summary: string
  strengths: string[]
  weaknesses: string[]
  switchConditions: string[]
}

export interface TripRecommendation {
  id: string
  rank: number
  label: 'Plan A' | 'Plan B' | 'Plan C'
  status: RecommendationStatus
  plan: ItineraryPlan
  finalScore: number
  confidence: number
  estimatedSuccess: number
  wholePartyZedEligible: boolean
  eligibleZedAirlines: string[]
  risks: StrategyRisk[]
  explanation: RecommendationExplanation
  dataWarnings: string[]
}

export interface RecommendationResult {
  missionSummary: string[]
  recommendations: TripRecommendation[]
  generatedAt: string
  dataQuality: 'high' | 'medium' | 'low'
  warnings: string[]
}

export interface RecommendationSignals {
  liveLoadDataAvailable?: boolean
  operatingScheduleDataAvailable?: boolean
  weatherDataAvailable?: boolean
}

export interface RecommendationOptions {
  gateways?: GatewayCandidate[]
  signals?: RecommendationSignals
  now?: Date
}

type ZedAssessment = {
  carrierCodes: string[]
  wholePartyZedEligible: boolean
  eligibleZedAirlines: string[]
  freshAgreementAirlines: string[]
  staleAgreementAirlines: string[]
  inactiveAgreementAirlines: string[]
  unverifiedAgreementAirlines: string[]
}

const labelByRank: TripRecommendation['label'][] = ['Plan A', 'Plan B', 'Plan C']

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeCarrierCode(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9]{2,3}$/.test(value.trim()) ? value.trim().toUpperCase() : ''
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)]
}

function planCarrierCodes(plan: ItineraryPlan) {
  return uniqueStrings(plan.legs
    .filter((leg) => leg.transportType === 'flight')
    .map((leg) => normalizeCarrierCode(leg.carrier))
    .filter(Boolean))
}

function agreementIsFresh(agreement: ZedAgreementRecord, now?: Date) {
  if (!now) return zedAgreementVerificationIsFresh(agreement)
  if (agreement.verificationStatus === 'expired' || agreement.verificationStatus === 'unverified') return false
  const verifiedAt = Date.parse(agreement.verifiedAt || '')
  if (!Number.isFinite(verifiedAt) || verifiedAt > now.getTime()) return false
  const expiresAt = Date.parse(agreement.expiresAt || '')
  if (Number.isFinite(expiresAt) && expiresAt < now.getTime()) return false
  return now.getTime() - verifiedAt <= 180 * 86400000
}

function assessZed(
  plan: ItineraryPlan,
  profileInput: Partial<TravelerProfileScaffold>,
  now?: Date
): ZedAssessment {
  const profile = normalizeTravelerProfile(profileInput)
  const carrierCodes = planCarrierCodes(plan)
  const eligibleZedAirlines: string[] = []
  const freshAgreementAirlines: string[] = []
  const staleAgreementAirlines: string[] = []
  const inactiveAgreementAirlines: string[] = []
  const unverifiedAgreementAirlines: string[] = []

  for (const carrierCode of carrierCodes) {
    const activeAgreement = findActiveZedAgreement(profile, carrierCode)
    const inactiveAgreement = profile.zedAgreements.find((agreement) => !agreement.active && agreement.airlineCode === carrierCode)
    if (inactiveAgreement) inactiveAgreementAirlines.push(carrierCode)
    if (!activeAgreement) continue

    if (isEntireTravelingPartyEligible(profile, carrierCode)) eligibleZedAirlines.push(carrierCode)
    if (activeAgreement.verificationStatus === 'unverified' || activeAgreement.verificationStatus === 'expired') unverifiedAgreementAirlines.push(carrierCode)
    if (agreementIsFresh(activeAgreement, now)) freshAgreementAirlines.push(carrierCode)
    else staleAgreementAirlines.push(carrierCode)
  }

  return {
    carrierCodes,
    wholePartyZedEligible: carrierCodes.length > 0 && carrierCodes.every((carrierCode) => isEntireTravelingPartyEligible(profile, carrierCode)),
    eligibleZedAirlines: uniqueStrings(eligibleZedAirlines),
    freshAgreementAirlines: uniqueStrings(freshAgreementAirlines),
    staleAgreementAirlines: uniqueStrings(staleAgreementAirlines),
    inactiveAgreementAirlines: uniqueStrings(inactiveAgreementAirlines),
    unverifiedAgreementAirlines: uniqueStrings(unverifiedAgreementAirlines)
  }
}

function gatewayForPlan(plan: ItineraryPlan, gateways: GatewayCandidate[] = []) {
  return gateways.find((gateway) => gateway.airportCode === plan.gateway)
}

function risk(
  code: string,
  title: string,
  description: string,
  severity: RiskSeverity,
  scoreImpact: number,
  trigger?: string
): StrategyRisk {
  return { code, title, description, severity, scoreImpact, ...(trigger ? { trigger } : {}) }
}

export function evaluateStrategyRisks(
  missionInput: TripMission,
  plan: ItineraryPlan,
  profileInput: Partial<TravelerProfileScaffold> = defaultTravelerProfile,
  options: RecommendationOptions = {}
) {
  const mission = normalizeTripMission(missionInput)
  const signals = options.signals || {}
  const zed = assessZed(plan, profileInput, options.now)
  const gateway = gatewayForPlan(plan, options.gateways)
  const risks: StrategyRisk[] = []

  if (mission.travelers >= 5) risks.push(risk('party-size-risk', 'Large traveling party', `${mission.travelers} travelers increases standby coordination risk.`, 'medium', -4))
  if (mission.allowZed && zed.carrierCodes.length && !zed.wholePartyZedEligible) risks.push(risk('no-whole-party-zed-agreement', 'Whole-party ZED not confirmed', 'At least one planned flight carrier does not have confirmed ZED eligibility for the entire traveling party.', 'high', -10, 'switch if whole-party ZED eligibility cannot be confirmed'))
  if (zed.staleAgreementAirlines.length) risks.push(risk('stale-zed-verification', 'ZED verification is stale', `Agreement verification is stale or expired for ${zed.staleAgreementAirlines.join(', ')}.`, 'medium', -5))
  if (zed.unverifiedAgreementAirlines.length) risks.push(risk('unverified-zed-agreement', 'ZED verification is unverified', `Agreement verification is unverified for ${zed.unverifiedAgreementAirlines.join(', ')}.`, 'medium', -5))
  if (zed.inactiveAgreementAirlines.length) risks.push(risk('inactive-zed-agreement', 'Inactive ZED agreement', `An inactive agreement exists for ${zed.inactiveAgreementAirlines.join(', ')} and is ignored.`, 'high', -8))
  if (plan.legs.length > 3) risks.push(risk('too-many-legs', 'Too many legs', `${plan.legs.length} legs increases connection and recovery complexity.`, plan.legs.length > 4 ? 'high' : 'medium', plan.legs.length > 4 ? -12 : -6))
  if (plan.legs.some((leg) => leg.transportType !== 'flight')) risks.push(risk('mixed-transportation-complexity', 'Mixed transportation complexity', 'The plan includes rail, ferry, or car movement in addition to flights.', 'medium', -4))
  if (gateway && gateway.score < 70) risks.push(risk('weak-gateway-score', 'Weak gateway score', `${plan.gateway} has a weaker static gateway score.`, 'medium', -5, 'switch if the gateway score falls materially'))
  if (plan.confidence < 65) risks.push(risk('low-itinerary-confidence', 'Low itinerary confidence', 'The strategy confidence score is low before live data is attached.', 'medium', -5))
  if (!mission.departureDate) risks.push(risk('missing-departure-date', 'Missing departure date', 'No departure date is attached to the mission.', 'medium', -3))
  if (!mission.destinationRegion) risks.push(risk('missing-destination-region', 'Missing destination region', 'No destination region is attached to the mission.', 'medium', -4))
  if (!mission.preferredDestinations.length) risks.push(risk('no-preferred-destination', 'No preferred destination', 'The mission has a region but no preferred destination for onward planning.', 'low', -2))
  if (!mission.allowRevenue) risks.push(risk('no-revenue-backup-allowed', 'No revenue backup allowed', 'Revenue backup is not enabled for this mission.', 'medium', -3))
  if ((options.gateways?.length || 0) <= 1) risks.push(risk('no-alternate-gateway', 'No alternate gateway', 'No alternate gateway candidate is available in the current strategy set.', 'medium', -4, 'switch if a higher-ranked alternate gains stronger live availability'))
  if (!signals.liveLoadDataAvailable) risks.push(risk('unknown-live-load-data', 'Live load data unavailable', 'No live standby/load signal is attached; treat this as uncertainty, not a fatal error.', 'low', 0))
  if (!signals.operatingScheduleDataAvailable) risks.push(risk('unknown-operating-schedule-data', 'Operating schedule data unavailable', 'No live operating schedule signal is attached to this static plan.', 'medium', 0))
  if (!signals.weatherDataAvailable) risks.push(risk('weather-data-unavailable', 'Weather data unavailable', 'No current weather signal is attached; weather remains an uncertainty.', 'low', 0))

  return risks
}

function recommendationStatus(finalScore: number): RecommendationStatus {
  if (finalScore >= 80) return 'recommended'
  if (finalScore >= 65) return 'viable'
  if (finalScore >= 45) return 'backup'
  return 'avoid'
}

export function scoreRecommendation(
  missionInput: TripMission,
  plan: ItineraryPlan,
  profileInput: Partial<TravelerProfileScaffold> = defaultTravelerProfile,
  options: RecommendationOptions = {}
) {
  const mission = normalizeTripMission(missionInput)
  const signals = options.signals || {}
  const zed = assessZed(plan, profileInput, options.now)
  const alternateGatewayAvailable = (options.gateways?.filter((gateway) => gateway.airportCode !== plan.gateway).length || 0) > 0
  const mixedTransport = plan.legs.some((leg) => leg.transportType !== 'flight')
  let finalScore = plan.score
  let confidence = plan.confidence
  let estimatedSuccess = plan.estimatedSuccess

  if (zed.wholePartyZedEligible) finalScore += 8
  if (zed.freshAgreementAirlines.length) finalScore += 4
  if (zed.staleAgreementAirlines.length || zed.unverifiedAgreementAirlines.length) finalScore -= 5
  if (mission.allowZed && !zed.eligibleZedAirlines.length) finalScore -= 10
  if (plan.legs.length > 3) finalScore -= 6
  if (plan.legs.length > 4) finalScore -= 6
  if (mixedTransport) finalScore -= 4
  if (mission.allowRevenue) finalScore += 3
  if (alternateGatewayAvailable) finalScore += 4
  if (!signals.liveLoadDataAvailable) confidence -= 8
  if (!signals.operatingScheduleDataAvailable) confidence -= 10
  if (!signals.weatherDataAvailable) confidence -= 3

  estimatedSuccess += zed.wholePartyZedEligible ? 3 : 0
  estimatedSuccess -= mixedTransport ? 2 : 0

  return {
    finalScore: clampScore(finalScore),
    confidence: clampScore(confidence),
    estimatedSuccess: clampScore(estimatedSuccess)
  }
}

function dataWarningsForPlan(plan: ItineraryPlan, signals: RecommendationSignals = {}) {
  const warnings: string[] = []
  if (!planCarrierCodes(plan).length) warnings.push('Flight carrier codes unavailable; ZED eligibility cannot be carrier-confirmed.')
  if (!signals.liveLoadDataAvailable) warnings.push('Live standby/load data is unavailable for this static recommendation.')
  if (!signals.operatingScheduleDataAvailable) warnings.push('Live operating schedule data is unavailable for this static recommendation.')
  if (!signals.weatherDataAvailable) warnings.push('Weather data is unavailable for this recommendation.')
  return warnings
}

function weaknessFromRisk(riskItem: StrategyRisk) {
  const map: Record<string, string> = {
    'unknown-live-load-data': 'live load data unavailable',
    'stale-zed-verification': 'agreement verification is stale',
    'unverified-zed-agreement': 'agreement verification is unverified',
    'inactive-zed-agreement': 'inactive agreement is ignored',
    'mixed-transportation-complexity': 'includes multiple transport modes',
    'unknown-operating-schedule-data': 'operating schedule data unavailable',
    'weather-data-unavailable': 'weather data unavailable',
    'no-whole-party-zed-agreement': 'whole-party ZED eligibility is not confirmed',
    'too-many-legs': 'too many legs',
    'no-revenue-backup-allowed': 'revenue backup is not allowed'
  }
  return map[riskItem.code] || riskItem.title.toLowerCase()
}

export function buildRecommendationExplanation(
  recommendation: Pick<TripRecommendation, 'rank' | 'label' | 'finalScore' | 'wholePartyZedEligible' | 'eligibleZedAirlines' | 'risks' | 'plan'>,
  missionInput: TripMission
): RecommendationExplanation {
  const mission = normalizeTripMission(missionInput)
  const strengths = [
    recommendation.rank === 1 ? 'strongest available gateway' : undefined,
    recommendation.wholePartyZedEligible ? 'entire party ZED eligible' : undefined,
    recommendation.plan.legs.length <= 2 ? 'fewer total legs' : undefined,
    mission.allowRevenue ? 'revenue backup permitted' : undefined,
    recommendation.plan.reasons.includes('Multiple onward options') ? 'multiple onward options' : undefined
  ].filter((item): item is string => Boolean(item))
  const weaknesses = uniqueStrings(recommendation.risks.map(weaknessFromRisk))
  const switchConditions = uniqueStrings([
    'switch if the gateway score falls materially',
    ...recommendation.plan.backupTriggers.map((trigger) => trigger.toLowerCase()),
    recommendation.wholePartyZedEligible ? undefined : 'switch if whole-party ZED eligibility cannot be confirmed',
    'switch if a higher-ranked alternate gains stronger live availability',
    'switch if the connection becomes invalid'
  ].filter((item): item is string => Boolean(item)))
  const summaryStrengths = [
    strengths.includes('strongest available gateway') ? 'the strongest gateway score' : undefined,
    recommendation.wholePartyZedEligible ? 'whole-party ZED eligibility' : undefined,
    recommendation.plan.legs.length <= 2 ? 'lower travel complexity' : undefined
  ].filter(Boolean).join(', ')

  return {
    summary: `${recommendation.label} ranks ${recommendation.rank} because it combines ${summaryStrengths || 'the available static strategy signals'}. Estimated success is a planning score, not a statistical guarantee.`,
    strengths: strengths.length ? strengths : ['usable static strategy framework'],
    weaknesses: weaknesses.length ? weaknesses : ['live provider signals are not attached'],
    switchConditions
  }
}

function dedupePlansByGateway(plans: ItineraryPlan[]) {
  const seen = new Set<string>()
  const unique: ItineraryPlan[] = []
  for (const plan of plans) {
    if (seen.has(plan.gateway)) continue
    seen.add(plan.gateway)
    unique.push(plan)
  }
  return unique.length ? unique : plans
}

export function recommendationDataQuality(
  missionInput: TripMission,
  recommendations: TripRecommendation[],
  options: RecommendationOptions = {}
): RecommendationResult['dataQuality'] {
  const mission = normalizeTripMission(missionInput)
  const signals = options.signals || {}
  const missionComplete = Boolean(mission.originAirports.length && mission.departureDate && mission.destinationRegion)
  const hasCarrierAndZedSignal = recommendations.length > 0 && recommendations.every((recommendation) =>
    !recommendation.dataWarnings.some((warning) => warning.includes('carrier codes unavailable')) &&
    (!mission.allowZed || recommendation.wholePartyZedEligible || recommendation.eligibleZedAirlines.length)
  )
  const liveSignalsPresent = Boolean(signals.liveLoadDataAvailable && signals.operatingScheduleDataAvailable && signals.weatherDataAvailable)

  if (missionComplete && recommendations.length && hasCarrierAndZedSignal && liveSignalsPresent) return 'high'
  if (recommendations.length && (hasCarrierAndZedSignal || signals.operatingScheduleDataAvailable || signals.liveLoadDataAvailable)) return 'medium'
  return 'low'
}

export function generateRecommendations(
  missionInput: TripMission,
  plans: ItineraryPlan[] = generateStrategies(missionInput),
  profileInput: Partial<TravelerProfileScaffold> = defaultTravelerProfile,
  options: RecommendationOptions = {}
): RecommendationResult {
  const now = options.now || new Date()
  const gateways = options.gateways || []
  const scopedPlans = dedupePlansByGateway(plans).slice(0, 3)
  const scored = scopedPlans.map((plan) => {
    const risks = evaluateStrategyRisks(missionInput, plan, profileInput, { ...options, gateways })
    const zed = assessZed(plan, profileInput, now)
    const scores = scoreRecommendation(missionInput, plan, profileInput, { ...options, gateways, now })
    return {
      plan,
      risks,
      zed,
      scores,
      dataWarnings: dataWarningsForPlan(plan, options.signals)
    }
  }).sort((a, b) =>
    b.scores.finalScore - a.scores.finalScore ||
    b.scores.confidence - a.scores.confidence ||
    a.plan.gateway.localeCompare(b.plan.gateway)
  )

  const recommendations = scored.map((item, index) => {
    const base = {
      id: `recommendation-${index + 1}-${item.plan.gateway.toLowerCase()}`,
      rank: index + 1,
      label: labelByRank[index] || 'Plan C',
      status: recommendationStatus(item.scores.finalScore),
      plan: item.plan,
      finalScore: item.scores.finalScore,
      confidence: item.scores.confidence,
      estimatedSuccess: item.scores.estimatedSuccess,
      wholePartyZedEligible: item.zed.wholePartyZedEligible,
      eligibleZedAirlines: item.zed.eligibleZedAirlines,
      risks: item.risks,
      dataWarnings: item.dataWarnings
    } satisfies Omit<TripRecommendation, 'explanation'>
    return {
      ...base,
      explanation: buildRecommendationExplanation(base, missionInput)
    }
  })

  const dataQuality = recommendationDataQuality(missionInput, recommendations, { ...options, gateways })
  const warnings = uniqueStrings([
    'Estimated success is a planning score, not a statistical guarantee.',
    ...recommendations.flatMap((recommendation) => recommendation.dataWarnings)
  ])

  return {
    missionSummary: tripMissionAssumptions(missionInput),
    recommendations,
    generatedAt: now.toISOString(),
    dataQuality,
    warnings
  }
}

export function recommendationResultAssumptions(result: RecommendationResult) {
  return [
    `Recommendations: ${result.recommendations.length}`,
    `Data quality: ${result.dataQuality}`,
    `Generated at: ${result.generatedAt}`,
    'No live seat counts, clearance probabilities, or real-time availability are inferred.',
    'Estimated success is a planning score, not a statistical guarantee.'
  ]
}

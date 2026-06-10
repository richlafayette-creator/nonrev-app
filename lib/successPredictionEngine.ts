import type { BackupAvailability } from './airportIntelligence'
import type { TravelerProfileScaffold } from './travelerProfile'

export type SuccessPredictionBadge = 'Very Strong' | 'Strong' | 'Planning Strong' | 'Moderate' | 'Needs Load' | 'High Risk'
export type SuccessPredictionRiskLevel = 'Low' | 'Medium-Low' | 'Medium' | 'High'
export type SuccessPredictionConfidenceLevel = 'Low' | 'Medium' | 'High'
export type ScheduleDensity = 'High' | 'Medium' | 'Low'
export type CarrierCoverage = 'Strong' | 'Moderate' | 'Limited'
export type RecoveryStrength = 'Strong' | 'Moderate' | 'Limited'
export type LoadDataStatus = 'verified' | 'trusted' | 'weak' | 'stale' | 'missing'

export type SuccessPredictionInput = {
  route: string
  baseSuccessProbability: number
  routeConfidenceScore: number
  connectionCount: number
  totalTravelTime: string
  backupAvailability: BackupAvailability | string
  carrierCoverage: CarrierCoverage
  scheduleDensity: ScheduleDensity
  recoveryStrength: RecoveryStrength
  routeRisk?: string
  travelerProfile: TravelerProfileScaffold
  historicalLoadSignal?: number
  loadData?: {
    status: LoadDataStatus
    seatsAvailable?: number
    standbyCount?: number
    source?: string
    detail?: string
  }
}

export type SuccessPrediction = {
  probability: number
  confidenceLevel: SuccessPredictionConfidenceLevel
  riskLevel: SuccessPredictionRiskLevel
  badge: SuccessPredictionBadge
  label: 'Likely Success' | 'Good Chance' | 'Planning Confidence' | 'Worth Watching' | 'Needs Load' | 'High Risk'
  scoreLabel: 'Success Probability' | 'Planning Confidence' | 'Needs Load'
  displayValue: string
  isLoadSupported: boolean
  needsLoad: boolean
  loadDataStatus: LoadDataStatus
  loadExplanation: string
  reasoning: string[]
}

function clamp(value: number, min = 1, max = 99) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function backupScore(value: string) {
  if (value === 'Excellent') return 8
  if (value === 'Good') return 5
  if (value === 'Fair') return 1
  return -5
}

function coverageScore(value: CarrierCoverage) {
  if (value === 'Strong') return 5
  if (value === 'Moderate') return 1
  return -5
}

function densityScore(value: ScheduleDensity) {
  if (value === 'High') return 6
  if (value === 'Medium') return 2
  return -4
}

function recoveryScore(value: RecoveryStrength) {
  if (value === 'Strong') return 7
  if (value === 'Moderate') return 2
  return -6
}

function routeRiskPenalty(value?: string) {
  if (!value) return 0
  if (value.includes('High')) return 8
  if (value.includes('Low')) return -3
  return 3
}

function travelDurationPenalty(value: string) {
  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*h/i)?.[1] || 0)
  if (!hours) return 0
  if (hours >= 14) return 5
  if (hours >= 9) return 3
  return 0
}

function profileAdjustment(profile: TravelerProfileScaffold, route: string) {
  const routeAirports: string[] = route.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  const priority = profile.passPriority.toUpperCase()
  const priorityBoost = priority.includes('SA1') || priority.includes('A1') ? 4 : priority.includes('SA2') || priority.includes('A2') ? 2 : 0
  const travelerPenalty = profile.travelerType === 'Buddy Pass' ? 7 : profile.travelerType === 'Companion' ? 4 : profile.travelerType === 'Retiree' ? 1 : 0
  const airportFit = [profile.homeAirport, ...profile.preferredAirports].some((airport) => routeAirports.includes(airport.toUpperCase())) ? 3 : 0
  return priorityBoost + airportFit - travelerPenalty
}

function badgeFor(probability: number, isLoadSupported = false): SuccessPredictionBadge {
  if (!isLoadSupported) {
    if (probability >= 60) return 'Planning Strong'
    if (probability >= 45) return 'Needs Load'
    return 'High Risk'
  }
  if (probability >= 86) return 'Very Strong'
  if (probability >= 72) return 'Strong'
  if (probability >= 55) return 'Moderate'
  return 'High Risk'
}

function labelFor(probability: number, isLoadSupported = false, needsLoad = false): SuccessPrediction['label'] {
  if (needsLoad) return 'Needs Load'
  if (!isLoadSupported) return 'Planning Confidence'
  if (probability >= 82) return 'Likely Success'
  if (probability >= 70) return 'Good Chance'
  if (probability >= 58) return 'Worth Watching'
  return 'High Risk'
}

function riskFor(probability: number, connectionCount: number, isLoadSupported = false): SuccessPredictionRiskLevel {
  if (!isLoadSupported && probability >= 60) return 'Medium'
  if (probability >= 84 && connectionCount <= 1) return 'Low'
  if (probability >= 72) return 'Medium-Low'
  if (probability >= 55) return 'Medium'
  return 'High'
}

function confidenceFor(input: SuccessPredictionInput): SuccessPredictionConfidenceLevel {
  const signals = [
    input.routeConfidenceScore >= 70,
    input.backupAvailability === 'Excellent' || input.backupAvailability === 'Good',
    input.carrierCoverage !== 'Limited',
    input.scheduleDensity !== 'Low',
    input.recoveryStrength !== 'Limited',
    Number.isFinite(input.historicalLoadSignal),
    input.loadData?.status === 'verified' || input.loadData?.status === 'trusted'
  ].filter(Boolean).length
  if (input.loadData?.status === 'weak' || input.loadData?.status === 'stale') return 'Low'
  if (signals >= 6) return 'High'
  if (signals >= 3) return 'Medium'
  return 'Low'
}

function loadProbability(input: SuccessPredictionInput) {
  const seats = input.loadData?.seatsAvailable
  const standby = input.loadData?.standbyCount
  if (typeof seats !== 'number' || typeof standby !== 'number') return null
  const margin = seats - standby
  if (standby <= 0) return seats >= 6 ? 88 : seats >= 3 ? 76 : 62
  if (margin >= 10 || seats >= standby * 2 + 3) return 90
  if (margin >= Math.max(4, Math.ceil(standby * 0.5))) return 76
  if (margin > 0) return 62
  if (margin === 0) return 48
  if (margin >= -5) return 36
  return 24
}

function loadExplanationFor(input: SuccessPredictionInput, probability: number, isLoadSupported: boolean, needsLoad: boolean) {
  const status = input.loadData?.status || 'missing'
  const seats = input.loadData?.seatsAvailable
  const standby = input.loadData?.standbyCount
  if (isLoadSupported && typeof seats === 'number' && typeof standby === 'number') {
    const margin = seats - standby
    return `Verified load signal: ${seats} available seat${seats === 1 ? '' : 's'} vs ${standby} standby/passenger demand gives a ${margin >= 0 ? '+' : ''}${margin} seat margin.`
  }
  if (status === 'weak' || status === 'stale' || needsLoad) return input.loadData?.detail || 'Load data is weak, stale, or missing structured available-seat and standby-demand counts; request a fresh load before treating this as seat availability.'
  return `This is route confidence, not verified seat availability. Displayed planning confidence is capped at ${probability}% until trusted load data is available.`
}

function reasoningFor(input: SuccessPredictionInput, probability: number, isLoadSupported: boolean, needsLoad: boolean): string[] {
  const reasons: string[] = []
  if (!isLoadSupported) reasons.push('This is route confidence, not verified seat availability')
  if (needsLoad) reasons.push('Needs fresh verified load data before showing success probability')
  if (input.backupAvailability === 'Excellent' || input.scheduleDensity === 'High') reasons.push('Multiple backup departures')
  if (input.recoveryStrength === 'Strong' || input.backupAvailability === 'Excellent' || input.backupAvailability === 'Good') reasons.push('Strong recovery options')
  if (input.connectionCount === 0) reasons.push('Nonstop route avoids connection risk')
  else if (input.connectionCount === 1 && probability >= 70) reasons.push('Low connection risk')
  if (input.carrierCoverage === 'Strong') reasons.push('Strong carrier coverage')
  if ([input.travelerProfile.homeAirport, ...input.travelerProfile.preferredAirports].some((airport) => input.route.includes(airport))) reasons.push('Matches traveler airport preferences')
  if (reasons.length < 3 && input.routeConfidenceScore >= 72) reasons.push('Consistent route confidence signal')
  if (reasons.length < 3 && input.scheduleDensity === 'Medium') reasons.push('Usable schedule density')
  if (reasons.length < 3 && input.connectionCount > 1) reasons.push('Connection count adds recoverable complexity')
  if (reasons.length < 3) reasons.push(isLoadSupported ? 'Load-supported seat margin included' : 'Use as planning guidance, not live seat availability')
  return reasons.slice(0, 3)
}

export function calculateSuccessPrediction(input: SuccessPredictionInput): SuccessPrediction {
  const routePlanningProbability = clamp(
    input.baseSuccessProbability * 0.58 +
      input.routeConfidenceScore * 0.22 +
      backupScore(input.backupAvailability) +
      coverageScore(input.carrierCoverage) +
      densityScore(input.scheduleDensity) +
      recoveryScore(input.recoveryStrength) +
      profileAdjustment(input.travelerProfile, input.route) +
      (input.historicalLoadSignal || 0) -
      input.connectionCount * 4 -
      routeRiskPenalty(input.routeRisk) -
      travelDurationPenalty(input.totalTravelTime)
  )
  const loadStatus = input.loadData?.status || 'missing'
  const isLoadSupported = loadStatus === 'verified' || loadStatus === 'trusted'
  const needsLoad = loadStatus === 'weak' || loadStatus === 'stale'
  const loadBasedProbability = isLoadSupported ? loadProbability(input) : null
  const probability = loadBasedProbability === null
    ? clamp(routePlanningProbability, 1, 65)
    : clamp(Math.min(loadBasedProbability + (routePlanningProbability >= 76 ? 3 : 0), 94))
  const scoreLabel = isLoadSupported ? 'Success Probability' : needsLoad ? 'Needs Load' : 'Planning Confidence'

  return {
    probability,
    confidenceLevel: confidenceFor(input),
    riskLevel: riskFor(probability, input.connectionCount, isLoadSupported),
    badge: badgeFor(probability, isLoadSupported),
    label: labelFor(probability, isLoadSupported, needsLoad),
    scoreLabel,
    displayValue: needsLoad ? 'Needs Load' : `${probability}%`,
    isLoadSupported,
    needsLoad: needsLoad || !isLoadSupported,
    loadDataStatus: loadStatus,
    loadExplanation: loadExplanationFor(input, probability, isLoadSupported, needsLoad),
    reasoning: reasoningFor(input, probability, isLoadSupported, needsLoad)
  }
}

export function successPredictionBadgeColor(badge: SuccessPredictionBadge) {
  if (badge === 'Very Strong' || badge === 'Strong') return '#22c55e'
  if (badge === 'Planning Strong') return '#38bdf8'
  if (badge === 'Moderate' || badge === 'Needs Load') return '#facc15'
  return '#fb7185'
}

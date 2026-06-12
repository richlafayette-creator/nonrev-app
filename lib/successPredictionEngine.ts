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
  confidenceScore: number
  confidenceLevel: SuccessPredictionConfidenceLevel
  confidenceBadge: '🟢 High Confidence' | '🟡 Medium Confidence' | '🔴 Low Confidence'
  confidenceExplanation: string
  confidenceReasoning: string[]
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

function confidenceEvidence(input: SuccessPredictionInput) {
  const status = input.loadData?.status || 'missing'
  const seats = input.loadData?.seatsAvailable
  const standby = input.loadData?.standbyCount
  const hasStructuredLoad = typeof seats === 'number' && typeof standby === 'number'
  const hasLiveLoad = status === 'verified' || status === 'trusted'
  const reasons: string[] = []
  let score = 34
  let guardrailCap = 99

  if (status === 'verified') {
    score += 38
    reasons.push('Fresh verified load data is present')
  } else if (status === 'trusted') {
    score += 30
    reasons.push('Trusted load data is present')
  } else if (status === 'weak') {
    score -= 16
    guardrailCap = Math.min(guardrailCap, 60)
    reasons.push('Load observation is weak or incomplete')
  } else if (status === 'stale') {
    score -= 22
    guardrailCap = Math.min(guardrailCap, 60)
    reasons.push('Load observation is stale')
  } else {
    score -= 30
    guardrailCap = Math.min(guardrailCap, 60)
    reasons.push('No load data is available')
  }

  if (!hasLiveLoad) guardrailCap = Math.min(guardrailCap, 60)

  if (hasStructuredLoad) {
    const margin = seats - standby
    const pressureRatio = seats <= 0 ? Number.POSITIVE_INFINITY : standby / seats
    if (standby > seats) guardrailCap = Math.min(guardrailCap, 35)
    else if (standby >= seats) guardrailCap = Math.min(guardrailCap, 50)

    if (margin >= 10 || pressureRatio <= 0.45) {
      score += 18
      reasons.push('Seats exceed standbys')
    } else if (margin >= 4 || pressureRatio <= 0.7) {
      score += 10
      reasons.push('Seats exceed standbys')
    } else if (margin > 0) {
      score -= 8
      reasons.push('Standbys are close to open seats')
    } else if (margin === 0) {
      score -= 22
      reasons.push('Standbys equal open seats')
    } else {
      score -= 32
      reasons.push('Standbys exceed open seats')
    }
  } else {
    score -= 12
    guardrailCap = Math.min(guardrailCap, 60)
    reasons.push('Missing structured open-seat and standby counts')
  }

  if (Number.isFinite(input.historicalLoadSignal)) {
    const historicalSignal = input.historicalLoadSignal || 0
    if (historicalSignal >= 6) {
      score += 8
      reasons.push('Historical success patterns are favorable')
    } else if (historicalSignal >= 0) {
      score += 4
      reasons.push('Historical success patterns provide support')
    } else {
      score -= 7
      reasons.push('Historical success patterns are unfavorable')
    }
  } else {
    score -= 5
    reasons.push('No historical load signal is available')
  }

  if (input.recoveryStrength === 'Strong' || input.backupAvailability === 'Excellent') {
    score += 7
    reasons.push('Strong recovery options')
  } else if (input.recoveryStrength === 'Limited' || input.backupAvailability === 'Poor') {
    score -= 7
    reasons.push('Limited recovery options')
  }

  if (input.carrierCoverage === 'Strong') {
    score += 5
    reasons.push('Carrier reliability signal is strong')
  } else if (input.carrierCoverage === 'Limited') {
    score -= 8
    reasons.push('Carrier reliability signal is limited')
  } else {
    score += 1
    reasons.push('Carrier reliability signal is moderate')
  }

  if (input.connectionCount === 0) {
    score += 6
    reasons.push('Nonstop routing')
  } else if (input.connectionCount === 1) {
    score -= 3
    reasons.push('One connection adds routing complexity')
  } else {
    score -= 9
    reasons.push('Multiple connections add routing complexity')
  }

  if (input.scheduleDensity === 'High') {
    score += hasLiveLoad ? 2 : 1
    reasons.push('Schedule density gives minor supporting context')
  } else if (input.scheduleDensity === 'Low') {
    score -= 3
    reasons.push('Schedule-only context is sparse')
  }

  if (input.routeConfidenceScore >= 76) score += 3
  else if (input.routeConfidenceScore < 55) score -= 6

  return { score: clamp(Math.min(score, guardrailCap), 1, 99), reasons: [...new Set(reasons)].slice(0, 6) }
}

function confidenceLevelFor(score: number): SuccessPredictionConfidenceLevel {
  if (score >= 76) return 'High'
  if (score >= 48) return 'Medium'
  return 'Low'
}

function confidenceBadgeFor(level: SuccessPredictionConfidenceLevel): SuccessPrediction['confidenceBadge'] {
  if (level === 'High') return '🟢 High Confidence'
  if (level === 'Medium') return '🟡 Medium Confidence'
  return '🔴 Low Confidence'
}

function confidenceExplanationFor(level: SuccessPredictionConfidenceLevel, score: number, reasons: string[]) {
  return `Confidence is ${level} (${score}/100) because ${reasons.join('; ')}.`
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
  const confidence = confidenceEvidence(input)
  const confidenceLevel = confidenceLevelFor(confidence.score)
  const rawProbability = loadBasedProbability === null
    ? clamp(routePlanningProbability, 1, 65)
    : clamp(Math.min(loadBasedProbability + (routePlanningProbability >= 76 ? 3 : 0), 94))
  const confidenceCap = confidenceLevel === 'High' ? 94 : confidenceLevel === 'Medium' ? 74 : 54
  const probability = clamp(Math.min(rawProbability, confidenceCap))
  const trustNeedsLoad = !isLoadSupported || confidenceLevel === 'Low'
  const scoreLabel = isLoadSupported && confidenceLevel !== 'Low' ? 'Success Probability' : needsLoad || trustNeedsLoad ? 'Needs Load' : 'Planning Confidence'

  return {
    probability,
    confidenceScore: confidence.score,
    confidenceLevel,
    confidenceBadge: confidenceBadgeFor(confidenceLevel),
    confidenceExplanation: confidenceExplanationFor(confidenceLevel, confidence.score, confidence.reasons),
    confidenceReasoning: confidence.reasons,
    riskLevel: riskFor(probability, input.connectionCount, isLoadSupported && confidenceLevel !== 'Low'),
    badge: badgeFor(probability, isLoadSupported && confidenceLevel !== 'Low'),
    label: labelFor(probability, isLoadSupported && confidenceLevel !== 'Low', trustNeedsLoad),
    scoreLabel,
    displayValue: trustNeedsLoad ? 'Needs Load' : `${probability}%`,
    isLoadSupported: isLoadSupported && confidenceLevel !== 'Low',
    needsLoad: trustNeedsLoad,
    loadDataStatus: loadStatus,
    loadExplanation: loadExplanationFor(input, probability, isLoadSupported && confidenceLevel !== 'Low', trustNeedsLoad),
    reasoning: reasoningFor(input, probability, isLoadSupported && confidenceLevel !== 'Low', trustNeedsLoad)
  }
}

export function successPredictionBadgeColor(badge: SuccessPredictionBadge) {
  if (badge === 'Very Strong' || badge === 'Strong') return '#22c55e'
  if (badge === 'Planning Strong') return '#38bdf8'
  if (badge === 'Moderate' || badge === 'Needs Load') return '#facc15'
  return '#fb7185'
}

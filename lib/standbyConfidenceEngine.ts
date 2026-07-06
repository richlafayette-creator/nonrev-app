export type StandbyConfidenceStatus = 'disabled' | 'needs-load' | 'advisory'
export type StandbyConfidenceLevel = 'low' | 'medium' | 'high' | 'unknown'
export type StandbyConfidenceLoadStatus = 'verified' | 'trusted' | 'weak' | 'stale' | 'missing'

export type StandbyConfidenceInput = {
  route: string
  routeConfidenceScore: number
  loadDataStatus?: StandbyConfidenceLoadStatus
  seatsAvailable?: number
  standbyCount?: number
  communityReportCount?: number
  recoveryStrength?: 'Strong' | 'Moderate' | 'Limited'
  historicalReliabilityScore?: number
}

export type StandbyConfidenceResult = {
  status: StandbyConfidenceStatus
  score: number | null
  level: StandbyConfidenceLevel
  label: 'Disabled' | 'Needs verified load' | 'Advisory planning confidence'
  displayValue: 'Disabled' | 'Needs Load' | `${number}/100 advisory`
  featureFlagEnvVar: 'NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED'
  advisoryOnly: true
  confirmedClearance: false
  standbyAvailabilityConfirmed: false
  appliesToBookingDecision: false
  reasons: string[]
  limitations: string[]
}

export const standbyConfidenceEngineFeatureFlag = 'NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED' as const

const limitations = [
  'Standby confidence is advisory planning guidance only and never confirms standby clearance.',
  'A favorable score does not confirm seat inventory, pass-rider priority, employee travel eligibility, or boarding outcome.',
  'Weak, stale, missing, or unstructured load data must show Needs Load instead of a confidence score.'
]

function enabled(env: Record<string, string | undefined>) {
  const value = String(env[standbyConfidenceEngineFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function clamp(value: number, min = 1, max = 88) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function hasStructuredLoad(input: StandbyConfidenceInput) {
  return typeof input.seatsAvailable === 'number' && typeof input.standbyCount === 'number'
}

function scoreLevel(score: number): StandbyConfidenceLevel {
  if (score >= 76) return 'high'
  if (score >= 52) return 'medium'
  return 'low'
}

function recoveryAdjustment(value?: StandbyConfidenceInput['recoveryStrength']) {
  if (value === 'Strong') return 6
  if (value === 'Moderate') return 1
  if (value === 'Limited') return -8
  return 0
}

function advisoryScore(input: StandbyConfidenceInput) {
  const seats = Number(input.seatsAvailable)
  const standbys = Number(input.standbyCount)
  const margin = seats - standbys
  const pressureRatio = seats <= 0 ? 2 : standbys / seats
  const routeComponent = Math.max(0, Math.min(100, input.routeConfidenceScore || 0)) * 0.18
  const historicalComponent = Number.isFinite(input.historicalReliabilityScore) ? Math.max(0, Math.min(100, input.historicalReliabilityScore || 0)) * 0.08 : 4
  const communityComponent = Math.min(Math.max(0, input.communityReportCount || 0), 6) * 2
  const loadComponent = margin >= 10 || pressureRatio <= 0.45
    ? 54
    : margin >= 4 || pressureRatio <= 0.75
      ? 42
      : margin > 0
        ? 30
        : margin === 0
          ? 20
          : Math.max(6, 20 + margin * 2)
  const trustAdjustment = input.loadDataStatus === 'verified' ? 5 : input.loadDataStatus === 'trusted' ? 0 : -20
  const raw = loadComponent + routeComponent + historicalComponent + communityComponent + recoveryAdjustment(input.recoveryStrength) + trustAdjustment
  const cap = input.loadDataStatus === 'verified' ? 88 : 78
  return clamp(raw, 1, cap)
}

export function calculateStandbyConfidence(input: StandbyConfidenceInput, env: Record<string, string | undefined> = process.env): StandbyConfidenceResult {
  if (!enabled(env)) {
    return {
      status: 'disabled',
      score: null,
      level: 'unknown',
      label: 'Disabled',
      displayValue: 'Disabled',
      featureFlagEnvVar: standbyConfidenceEngineFeatureFlag,
      advisoryOnly: true,
      confirmedClearance: false,
      standbyAvailabilityConfirmed: false,
      appliesToBookingDecision: false,
      reasons: ['Standby confidence engine feature flag is disabled.'],
      limitations
    }
  }

  const loadStatus = input.loadDataStatus || 'missing'
  const loadUsable = (loadStatus === 'verified' || loadStatus === 'trusted') && hasStructuredLoad(input)
  if (!loadUsable) {
    return {
      status: 'needs-load',
      score: null,
      level: 'unknown',
      label: 'Needs verified load',
      displayValue: 'Needs Load',
      featureFlagEnvVar: standbyConfidenceEngineFeatureFlag,
      advisoryOnly: true,
      confirmedClearance: false,
      standbyAvailabilityConfirmed: false,
      appliesToBookingDecision: false,
      reasons: [`Load data is ${loadStatus}; standby confidence requires trusted structured seat and standby counts.`],
      limitations
    }
  }

  const score = advisoryScore(input)
  const level = scoreLevel(score)
  const margin = Number(input.seatsAvailable) - Number(input.standbyCount)
  const reasons = [
    `Structured load margin is ${margin >= 0 ? '+' : ''}${margin}.`,
    `Route confidence contributes ${Math.round(Math.max(0, Math.min(100, input.routeConfidenceScore || 0)) * 0.18)} advisory points.`,
    input.recoveryStrength ? `${input.recoveryStrength} recovery options are included as planning context.` : 'Recovery strength is not available.'
  ]

  return {
    status: 'advisory',
    score,
    level,
    label: 'Advisory planning confidence',
    displayValue: `${score}/100 advisory`,
    featureFlagEnvVar: standbyConfidenceEngineFeatureFlag,
    advisoryOnly: true,
    confirmedClearance: false,
    standbyAvailabilityConfirmed: false,
    appliesToBookingDecision: false,
    reasons,
    limitations
  }
}

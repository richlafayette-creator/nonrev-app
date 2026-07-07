export type StandbyConfidenceStatus = 'disabled' | 'needs-load' | 'advisory'
export type StandbyConfidenceLevel = 'low' | 'medium' | 'high' | 'unknown'
export type StandbyConfidenceLoadStatus = 'verified' | 'trusted' | 'weak' | 'stale' | 'missing'
export type StandbyConfidenceSignalSource = 'route' | 'load' | 'weather' | 'historical-reliability' | 'airport-intelligence' | 'commercial-availability'
export type StandbyConfidenceSignalStatus = 'present' | 'missing' | 'neutral' | 'unavailable' | 'disabled' | 'partial'

export type StandbyConfidenceSignalDiagnostic = {
  source: StandbyConfidenceSignalSource
  status: StandbyConfidenceSignalStatus
  providerName: string | null
  lastUpdated: string | null
  contribution: 'none' | 'existing-route-confidence-input' | 'existing-load-input' | 'existing-historical-reliability-input'
  scoreImpact: number
  message: string
  metadata: Record<string, string | number | boolean | null>
}

export type StandbyConfidenceDiagnostics = {
  generatedAt: string
  route: string
  advisoryOnly: true
  missingProvidersNeutral: true
  noScraping: true
  noFabricatedAvailability: true
  scoreWeightingChanged: false
  itineraryGenerationChanged: false
  signals: StandbyConfidenceSignalDiagnostic[]
}

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

type StandbyWeatherSignal = {
  source?: string
  observedAt?: string | null
  level?: string
  routeRisk?: {
    level?: string
    confidence?: string
  }
}

type StandbyHistoricalReliabilitySignal = {
  confidenceScore?: number
  lastUpdated?: string | null
  providerName?: string
  providerStatus?: {
    status?: string
    providers?: Array<{ providerName?: string; status?: string }>
  }
  dataFreshness?: {
    latestUpdated?: string | null
  }
}

type StandbyAirportIntelligenceSignal = {
  providerName?: string
  confidence?: number
  lastUpdated?: string | null
}

type StandbyCommercialAvailabilitySignal = {
  providerName?: string
  safeLabel?: string
  proxyOnly?: boolean
  entry?: {
    providerName?: string
  } | null
  result?: {
    lastUpdated?: string | null
  } | null
}

export type StandbyConfidenceAggregationInput = StandbyConfidenceInput & {
  weather?: StandbyWeatherSignal | null
  historicalReliability?: StandbyHistoricalReliabilitySignal | null
  airportIntelligence?: StandbyAirportIntelligenceSignal | StandbyAirportIntelligenceSignal[] | null
  commercialAvailability?: StandbyCommercialAvailabilitySignal | null
  now?: Date
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
  diagnostics: StandbyConfidenceDiagnostics
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

function clampSignalScore(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(100, Math.round(value)))
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

function signalDiagnostic(input: StandbyConfidenceSignalDiagnostic): StandbyConfidenceSignalDiagnostic {
  return input
}

function basicDiagnostics(input: StandbyConfidenceInput, now: Date = new Date()): StandbyConfidenceDiagnostics {
  const routeConfidenceScore = Math.max(0, Math.min(100, input.routeConfidenceScore || 0))
  const loadStatus = input.loadDataStatus || 'missing'
  const structuredLoadPresent = hasStructuredLoad(input)
  return {
    generatedAt: now.toISOString(),
    route: input.route,
    advisoryOnly: true,
    missingProvidersNeutral: true,
    noScraping: true,
    noFabricatedAvailability: true,
    scoreWeightingChanged: false,
    itineraryGenerationChanged: false,
    signals: [
      signalDiagnostic({
        source: 'route',
        status: 'present',
        providerName: null,
        lastUpdated: null,
        contribution: 'existing-route-confidence-input',
        scoreImpact: Math.round(routeConfidenceScore * 0.18),
        message: 'Existing route confidence input is carried into standby confidence using the existing weight.',
        metadata: { routeConfidenceScore }
      }),
      signalDiagnostic({
        source: 'load',
        status: (loadStatus === 'verified' || loadStatus === 'trusted') && structuredLoadPresent ? 'present' : 'neutral',
        providerName: null,
        lastUpdated: null,
        contribution: 'existing-load-input',
        scoreImpact: 0,
        message: structuredLoadPresent
          ? `Structured load input is ${loadStatus}; advisory score may be shown only when trusted or verified.`
          : `Structured load input is missing or incomplete; standby confidence remains neutral until trusted load counts exist.`,
        metadata: {
          loadDataStatus: loadStatus,
          structuredLoadPresent,
          seatsAvailable: typeof input.seatsAvailable === 'number' ? input.seatsAvailable : null,
          standbyCount: typeof input.standbyCount === 'number' ? input.standbyCount : null
        }
      })
    ]
  }
}

function weatherProviderName(weather: StandbyConfidenceAggregationInput['weather']) {
  if (!weather) return null
  if ('source' in weather) return String(weather.source || 'Unknown')
  return null
}

function weatherLastUpdated(weather: StandbyConfidenceAggregationInput['weather']) {
  if (!weather) return null
  if ('observedAt' in weather) return weather.observedAt || null
  return null
}

function historicalReliabilityScoreFromSignal(signal: StandbyConfidenceAggregationInput['historicalReliability']) {
  if (!signal) return undefined
  return clampSignalScore(signal.confidenceScore)
}

function historicalReliabilityStatus(signal: StandbyConfidenceAggregationInput['historicalReliability']): StandbyConfidenceSignalStatus {
  if (!signal) return 'missing'
  if (signal.providerStatus) {
    if (signal.providerStatus.status === 'feature-disabled') return 'disabled'
    if (signal.providerStatus.status === 'unavailable') return 'unavailable'
    if (signal.providerStatus.status === 'partial') return 'partial'
  }
  const score = historicalReliabilityScoreFromSignal(signal)
  return typeof score === 'number' && score > 0 ? 'present' : 'neutral'
}

function historicalReliabilityProviderName(signal: StandbyConfidenceAggregationInput['historicalReliability']) {
  if (!signal) return null
  if (signal.providerName) return signal.providerName
  const provider = (signal.providerStatus?.providers || []).find((item) => item.status === 'available' || item.status === 'partial')
  return provider?.providerName || null
}

function historicalReliabilityLastUpdated(signal: StandbyConfidenceAggregationInput['historicalReliability']) {
  if (!signal) return null
  if (signal.lastUpdated) return signal.lastUpdated
  return signal.dataFreshness?.latestUpdated || null
}

function airportIntelligenceDiagnostic(signal: StandbyConfidenceAggregationInput['airportIntelligence']): StandbyConfidenceSignalDiagnostic {
  const signals = Array.isArray(signal) ? signal : signal ? [signal] : []
  const knownSignals = signals.filter((item) => item.providerName !== 'NullAirportIntelligenceProvider' && Number(item.confidence || 0) > 0)
  const latestUpdated = knownSignals
    .map((item) => Date.parse(String(item.lastUpdated || '')))
    .filter((value) => Number.isFinite(value))
  return signalDiagnostic({
    source: 'airport-intelligence',
    status: knownSignals.length ? 'present' : signals.length ? 'neutral' : 'missing',
    providerName: knownSignals[0]?.providerName || signals[0]?.providerName || null,
    lastUpdated: latestUpdated.length ? new Date(Math.max(...latestUpdated)).toISOString() : null,
    contribution: 'none',
    scoreImpact: 0,
    message: knownSignals.length
      ? 'Airport intelligence was observed as diagnostics-only context; it does not change standby confidence scoring in this slice.'
      : 'Airport intelligence is missing or neutral; missing providers remain neutral.',
    metadata: {
      signalCount: signals.length,
      knownSignalCount: knownSignals.length,
      averageConfidence: knownSignals.length ? Math.round(knownSignals.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / knownSignals.length) : 0
    }
  })
}

function commercialAvailabilityDiagnostic(signal: StandbyConfidenceAggregationInput['commercialAvailability']): StandbyConfidenceSignalDiagnostic {
  const providerName = signal?.providerName || signal?.entry?.providerName || null
  const safeLabel = signal?.safeLabel || 'unknown'
  const status = !signal
    ? 'missing'
    : safeLabel === 'unknown'
      ? 'neutral'
      : 'present'
  return signalDiagnostic({
    source: 'commercial-availability',
    status,
    providerName,
    lastUpdated: signal && 'result' in signal ? signal.result?.lastUpdated || null : null,
    contribution: 'none',
    scoreImpact: 0,
    message: safeLabel === 'unknown'
      ? 'Commercial availability proxy is unknown or missing; it remains neutral and never confirms standby availability.'
      : `Commercial availability proxy label is ${safeLabel}; it is diagnostics-only and never confirms standby availability.`,
    metadata: {
      safeLabel,
      proxyOnly: signal?.proxyOnly === false ? false : true,
      scrapingAllowed: false
    }
  })
}

function providerDiagnostics(input: StandbyConfidenceAggregationInput): StandbyConfidenceSignalDiagnostic[] {
  const historicalScore = historicalReliabilityScoreFromSignal(input.historicalReliability)
  const historicalStatus = historicalReliabilityStatus(input.historicalReliability)
  const historicalContribution = typeof historicalScore === 'number' && historicalStatus !== 'disabled' && historicalStatus !== 'unavailable'
    ? Math.round(historicalScore * 0.08)
    : 0
  return [
    signalDiagnostic({
      source: 'weather',
      status: input.weather ? 'present' : 'missing',
      providerName: weatherProviderName(input.weather),
      lastUpdated: weatherLastUpdated(input.weather),
      contribution: 'none',
      scoreImpact: 0,
      message: input.weather
        ? 'Weather signal was observed as diagnostics-only context; it does not change standby confidence scoring in this slice.'
        : 'Weather provider signal is missing; unknown weather remains neutral.',
      metadata: {
        level: input.weather?.routeRisk?.level || input.weather?.level || 'unknown',
        confidence: input.weather?.routeRisk?.confidence || 'unknown'
      }
    }),
    signalDiagnostic({
      source: 'historical-reliability',
      status: historicalStatus,
      providerName: historicalReliabilityProviderName(input.historicalReliability),
      lastUpdated: historicalReliabilityLastUpdated(input.historicalReliability),
      contribution: typeof historicalScore === 'number' && historicalStatus !== 'disabled' && historicalStatus !== 'unavailable' ? 'existing-historical-reliability-input' : 'none',
      scoreImpact: historicalContribution,
      message: typeof historicalScore === 'number' && historicalStatus !== 'disabled' && historicalStatus !== 'unavailable'
        ? 'Historical reliability confidence is mapped into the existing historical reliability input without changing score weights.'
        : 'Historical reliability is missing or unavailable; the existing neutral historical baseline is used.',
      metadata: {
        confidenceScore: historicalScore ?? null
      }
    }),
    airportIntelligenceDiagnostic(input.airportIntelligence),
    commercialAvailabilityDiagnostic(input.commercialAvailability)
  ]
}

export function aggregateStandbyConfidence(input: StandbyConfidenceAggregationInput, env: Record<string, string | undefined> = process.env): StandbyConfidenceResult {
  const historicalScore = historicalReliabilityScoreFromSignal(input.historicalReliability)
  const calculationInput: StandbyConfidenceInput = {
    ...input,
    historicalReliabilityScore: typeof input.historicalReliabilityScore === 'number'
      ? input.historicalReliabilityScore
      : historicalScore
  }
  const result = calculateStandbyConfidence(calculationInput, env)
  const diagnostics = basicDiagnostics(calculationInput, input.now)
  return {
    ...result,
    diagnostics: {
      ...diagnostics,
      signals: [
        ...diagnostics.signals,
        ...providerDiagnostics(input)
      ]
    }
  }
}

export function calculateStandbyConfidence(input: StandbyConfidenceInput, env: Record<string, string | undefined> = process.env): StandbyConfidenceResult {
  const diagnostics = basicDiagnostics(input)
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
      limitations,
      diagnostics
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
      limitations,
      diagnostics
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
    limitations,
    diagnostics
  }
}

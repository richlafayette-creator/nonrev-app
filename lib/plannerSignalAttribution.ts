import type { ItineraryResult } from './itinerarySearch'

export const plannerSignalAttributionFeatureFlag = 'NONREV_PLANNER_SIGNAL_ATTRIBUTION_ENABLED' as const

export type PlannerSignalAttributionSource =
  | 'weather'
  | 'historical-reliability'
  | 'airport-intelligence'
  | 'commercial-availability'
  | 'recovery-engine-v2'
  | 'standby-confidence'

export type PlannerSignalAttributionStatus = 'present' | 'partial' | 'missing' | 'neutral' | 'failed' | 'unknown' | 'disabled'

export type PlannerSignalContribution =
  | 'recommendation-context'
  | 'diagnostics-only'
  | 'neutral-fallback'
  | 'provider-failure-neutral-fallback'

export type PlannerSignalProviderFailure = {
  source?: string
  providerName?: string | null
  status?: string
  state?: string
  detail?: string
  message?: string
  metadata?: Record<string, unknown>
}

export type PlannerSignalAttribution = {
  source: PlannerSignalAttributionSource
  status: PlannerSignalAttributionStatus
  providerName: string | null
  lastUpdated: string | null
  contributed: boolean
  contribution: PlannerSignalContribution
  summary: string
  evidence: string[]
  rankingImpact: 0
  scoringImpact: 0
  confidenceScoringImpact: 0
  itineraryGenerationImpact: 0
  plannerBehaviorImpact: 0
  metadata: Record<string, string | number | boolean | null>
}

export type PlannerSignalItineraryAttribution = {
  itineraryId: string | null
  route: string
  recommendation: string | null
  signals: PlannerSignalAttribution[]
  presentSignalCount: number
  partialSignalCount: number
  missingSignalCount: number
  failedSignalCount: number
  attributionSummary: string
  guardrails: {
    diagnosticsOnly: true
    missingProvidersNeutral: true
    unknownProvidersDoNotThrow: true
    noItineraryGenerationChange: true
    noRankingChange: true
    noScoringChange: true
    noConfidenceScoringChange: true
    noPlannerBehaviorChange: true
    noUiChange: true
    noApiContractChange: true
    noAdvisoryWordingChange: true
  }
}

export type PlannerSignalAttributionDiagnostics = {
  enabled: true
  featureFlagEnvVar: typeof plannerSignalAttributionFeatureFlag
  generatedAt: string
  diagnosticsOnly: true
  advisoryOnly: true
  noApiContractChange: true
  noUiChange: true
  noItineraryGenerationChange: true
  noRankingChange: true
  noScoringChange: true
  noConfidenceScoringChange: true
  noPlannerBehaviorChange: true
  noAdvisoryWordingChange: true
  missingProvidersNeutral: true
  unknownProvidersDoNotThrow: true
  itineraries: PlannerSignalItineraryAttribution[]
  providerFailures: Array<{
    source: string
    providerName: string | null
    status: string
    summary: string
    neutralFallbackReason: string
  }>
  limitations: string[]
}

export type PlannerSignalAttributionItineraryInput = ItineraryResult & {
  airportIntelligence?: unknown
  commercialAvailability?: unknown
  recoveryV2?: unknown
  recoveryV2Diagnostics?: unknown
  standbyConfidence?: unknown
  standbyConfidenceDiagnostics?: unknown
}

export type PlannerSignalAttributionInput = {
  itineraries: PlannerSignalAttributionItineraryInput[]
  providerFailures?: PlannerSignalProviderFailure[]
  now?: Date
  env?: Record<string, string | undefined>
}

const sourceLabels: Record<PlannerSignalAttributionSource, string> = {
  weather: 'Weather',
  'historical-reliability': 'Historical Reliability',
  'airport-intelligence': 'Airport Intelligence',
  'commercial-availability': 'Commercial Availability',
  'recovery-engine-v2': 'Recovery Engine v2',
  'standby-confidence': 'Standby Confidence'
}

const limitations = [
  'Planner signal attribution is diagnostics-only and does not change itinerary generation, ranking, scoring, confidence scoring, planner behavior, UI, API contracts, or advisory wording.',
  'Attribution explains which internal signals were available for recommendation context; it does not confirm standby clearance, seat inventory, booking, boarding, hotel, ride, or reaccommodation availability.',
  'Missing, failed, disabled, and unknown providers remain neutral.',
  'Unknown provider shapes are recorded as unknown or neutral diagnostics without throwing.'
]

function enabled(env: Record<string, string | undefined>) {
  const value = String(env[plannerSignalAttributionFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function sanitizeText(value: string, env: Record<string, string | undefined>) {
  let sanitized = value
  for (const secret of Object.values(env)) {
    if (secret?.trim()) sanitized = sanitized.split(secret).join('[redacted]')
  }
  return sanitized
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, '$1[redacted]')
    .replace(/([?&](?:api_?key|token|access_token)=)[^\s&]+/gi, '$1[redacted]')
    .replace(/\b(?:sk|pk|key|token)_[a-z0-9_\-]{8,}\b/gi, '[redacted]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g, '[redacted]')
    .replace(/\b[A-Za-z]:?\/?(?:root|home|Users|workspace|app|lib|src)\/[\w./-]+\b/g, '[internal]')
    .replace(/\b(?:lib|app|src)\/[\w./-]+\.(?:ts|tsx|js|jsx)(?::\d+(?::\d+)?)?/g, '[internal]')
    .replace(/\bat\s+[\w.$<>]+\s+\([^)]*\)/g, 'at [internal]')
    .replace(/\b(?:function|method|class)\s+[A-Za-z0-9_$<>.]+/g, '[internal]')
}

function sanitizeValue(value: unknown, env: Record<string, string | undefined>): string | number | boolean | null {
  if (typeof value === 'string') return sanitizeText(value, env)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value
  return null
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined, env: Record<string, string | undefined>) {
  if (!metadata) return {}
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [sanitizeText(key, env), sanitizeValue(value, env)]))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === 'string' ? value : null
}

function num(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function providerName(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function lastUpdated(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function statusFromProviderStatus(value: unknown): PlannerSignalAttributionStatus | null {
  const normalized = String(value || '').toLowerCase()
  if (!normalized) return null
  if (['present', 'success', 'available', 'fresh', 'enabled', 'advisory'].includes(normalized)) return 'present'
  if (['partial', 'stale', 'limited'].includes(normalized)) return 'partial'
  if (['missing', 'not-found', 'not_found'].includes(normalized)) return 'missing'
  if (['disabled', 'skipped'].includes(normalized)) return 'disabled'
  if (['failed', 'failure', 'error', 'timeout', 'unreachable', 'unavailable'].includes(normalized)) return 'failed'
  if (['neutral', 'unknown'].includes(normalized)) return 'neutral'
  return 'unknown'
}

function attribution(input: {
  source: PlannerSignalAttributionSource
  status: PlannerSignalAttributionStatus
  providerName?: string | null
  lastUpdated?: string | null
  contribution?: PlannerSignalContribution
  summary: string
  evidence?: string[]
  metadata?: Record<string, unknown>
}, env: Record<string, string | undefined>): PlannerSignalAttribution {
  const contributed = input.status === 'present' || input.status === 'partial'
  return {
    source: input.source,
    status: input.status,
    providerName: input.providerName ? sanitizeText(input.providerName, env) : null,
    lastUpdated: input.lastUpdated ? sanitizeText(input.lastUpdated, env) : null,
    contributed,
    contribution: input.contribution || (contributed ? 'recommendation-context' : 'neutral-fallback'),
    summary: sanitizeText(input.summary, env),
    evidence: (input.evidence || []).map((item) => sanitizeText(item, env)),
    rankingImpact: 0,
    scoringImpact: 0,
    confidenceScoringImpact: 0,
    itineraryGenerationImpact: 0,
    plannerBehaviorImpact: 0,
    metadata: sanitizeMetadata(input.metadata, env)
  }
}

function missing(source: PlannerSignalAttributionSource, env: Record<string, string | undefined>) {
  return attribution({
    source,
    status: 'missing',
    summary: `${sourceLabels[source]} signal was not supplied; neutral fallback applied.`,
    evidence: ['Missing provider signals remain neutral.']
  }, env)
}

function weatherSignal(itinerary: PlannerSignalAttributionItineraryInput, env: Record<string, string | undefined>) {
  const weather = asRecord(itinerary.weatherIntelligence)
  if (!weather) return missing('weather', env)
  const routeRisk = asRecord(weather.routeRisk)
  const status = statusFromProviderStatus(weather.status) || statusFromProviderStatus(weather.cacheStatus) || (routeRisk ? 'present' : 'unknown')
  return attribution({
    source: 'weather',
    status,
    providerName: providerName(weather.source, weather.providerName),
    lastUpdated: lastUpdated(weather.observedAt, weather.lastUpdated),
    summary: status === 'failed'
      ? 'Weather signal failed and remained neutral.'
      : `Weather signal ${status} for advisory planner context.`,
    evidence: [
      routeRisk?.label ? `Route risk ${routeRisk.label}` : 'Weather route risk unavailable.',
      routeRisk?.level ? `Risk level ${routeRisk.level}` : 'Weather risk level unknown.'
    ],
    metadata: { route: weather.route, cacheStatus: weather.cacheStatus, riskLevel: routeRisk?.level }
  }, env)
}

function historicalSignal(itinerary: PlannerSignalAttributionItineraryInput, env: Record<string, string | undefined>) {
  const historical = asRecord(itinerary.historicalReliability)
  if (!historical) return missing('historical-reliability', env)
  const providerStatus = asRecord(historical.providerStatus)
  const freshness = asRecord(historical.dataFreshness)
  const status = statusFromProviderStatus(providerStatus?.status) || statusFromProviderStatus(historical.status) || 'present'
  return attribution({
    source: 'historical-reliability',
    status,
    providerName: providerName(historical.providerName, providerStatus?.providerName),
    lastUpdated: lastUpdated(historical.lastUpdated, freshness?.latestUpdated),
    summary: `Historical reliability signal ${status} for advisory planner context.`,
    evidence: [
      num(historical.confidenceScore) !== null ? `Confidence ${historical.confidenceScore}/100` : 'Historical confidence unavailable.',
      num(historical.onTimePercentage) !== null ? `On-time ${historical.onTimePercentage}%` : 'On-time history unavailable.'
    ],
    metadata: { confidenceScore: historical.confidenceScore, providerStatus: providerStatus?.status, sampleSize: historical.sampleSize }
  }, env)
}

function airportSignal(itinerary: PlannerSignalAttributionItineraryInput, env: Record<string, string | undefined>) {
  const raw = itinerary.airportIntelligence
  const items = Array.isArray(raw) ? raw.map(asRecord).filter(Boolean) as Record<string, unknown>[] : asRecord(raw) ? [asRecord(raw) as Record<string, unknown>] : []
  if (!items.length) return missing('airport-intelligence', env)
  const statuses = items.map((item) => statusFromProviderStatus(item.status) || statusFromProviderStatus(item.providerStatus) || 'present')
  const status = statuses.includes('failed') ? 'failed' : statuses.includes('partial') ? 'partial' : statuses.every((item) => item === 'unknown') ? 'unknown' : 'present'
  return attribution({
    source: 'airport-intelligence',
    status,
    providerName: providerName(...items.map((item) => item.providerName)),
    lastUpdated: lastUpdated(...items.map((item) => item.lastUpdated)),
    summary: `Airport intelligence signal ${status} for advisory planner context.`,
    evidence: items.slice(0, 3).map((item) => `Airport ${text(item.airportCode) || 'unknown'} intelligence ${statusFromProviderStatus(item.status) || 'present'}.`),
    metadata: { airportCount: items.length }
  }, env)
}

function commercialSignal(itinerary: PlannerSignalAttributionItineraryInput, env: Record<string, string | undefined>) {
  const direct = asRecord(itinerary.commercialAvailability) || asRecord(itinerary.sellableSeatSignal)
  if (!direct) return missing('commercial-availability', env)
  const nestedEntry = asRecord(direct.entry)
  const nestedResult = asRecord(direct.result)
  const safeLabel = text(direct.safeLabel) || text(direct.sellableStatus) || 'unknown'
  const status = statusFromProviderStatus(direct.status) || (safeLabel === 'unknown' ? 'neutral' : 'present')
  return attribution({
    source: 'commercial-availability',
    status,
    providerName: providerName(direct.providerName, direct.source, nestedEntry?.providerName),
    lastUpdated: lastUpdated(direct.lastUpdated, direct.observedAt, nestedResult?.lastUpdated),
    summary: `Commercial availability proxy signal ${status}; proxy-only and not standby availability.`,
    evidence: [`Safe label ${safeLabel}.`, 'Commercial availability is attribution context only.'],
    metadata: { safeLabel, proxyOnly: direct.proxyOnly, sellableStatus: direct.sellableStatus }
  }, env)
}

function recoveryV2Signal(itinerary: PlannerSignalAttributionItineraryInput, env: Record<string, string | undefined>) {
  const raw = asRecord(itinerary.recoveryV2) || asRecord(itinerary.recoveryV2Diagnostics)
  if (!raw) return missing('recovery-engine-v2', env)
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : Array.isArray(raw.candidateReasoning) ? raw.candidateReasoning : []
  const diagnostics = asRecord(raw.diagnostics)
  const stage = asRecord(raw.recoveryStageMetadata)
  const status = candidates.length > 0 ? 'present' : statusFromProviderStatus(stage?.stage) || statusFromProviderStatus(diagnostics?.status) || 'neutral'
  return attribution({
    source: 'recovery-engine-v2',
    status,
    providerName: providerName(raw.providerName),
    lastUpdated: lastUpdated(diagnostics?.generatedAt, stage?.generatedAt),
    contribution: status === 'present' ? 'diagnostics-only' : 'neutral-fallback',
    summary: `Recovery Engine v2 signal ${status}; candidate attribution is diagnostics-only.`,
    evidence: [`${candidates.length} Recovery Engine v2 candidate${candidates.length === 1 ? '' : 's'} observed.`],
    metadata: { candidateCount: candidates.length, stage: stage?.stage }
  }, env)
}

function standbySignal(itinerary: PlannerSignalAttributionItineraryInput, env: Record<string, string | undefined>) {
  const raw = asRecord(itinerary.standbyConfidence) || asRecord(itinerary.standbyConfidenceDiagnostics)
  if (!raw) return missing('standby-confidence', env)
  const diagnostics = asRecord(raw.diagnostics) || raw
  const signals = Array.isArray(diagnostics.signals) ? diagnostics.signals.map(asRecord).filter(Boolean) as Record<string, unknown>[] : []
  const status = statusFromProviderStatus(raw.status) || (signals.some((signal) => signal.status === 'present' || signal.status === 'partial') ? 'present' : 'neutral')
  return attribution({
    source: 'standby-confidence',
    status,
    providerName: providerName(raw.providerName),
    lastUpdated: lastUpdated(diagnostics.generatedAt, raw.lastUpdated),
    summary: `Standby confidence signal ${status}; never confirms clearance or availability.`,
    evidence: [
      text(raw.displayValue) ? `Display value ${raw.displayValue}.` : 'Standby confidence display value unavailable.',
      `${signals.length} standby confidence signal diagnostic${signals.length === 1 ? '' : 's'} observed.`
    ],
    metadata: { level: raw.level, signalCount: signals.length, confirmedClearance: raw.confirmedClearance === true, standbyAvailabilityConfirmed: raw.standbyAvailabilityConfirmed === true }
  }, env)
}

function providerFailureSummaries(failures: PlannerSignalProviderFailure[], env: Record<string, string | undefined>) {
  return failures.map((failure) => ({
    source: sanitizeText(failure.source || 'unknown-provider', env),
    providerName: failure.providerName ? sanitizeText(failure.providerName, env) : null,
    status: sanitizeText(failure.status || failure.state || 'failed', env),
    summary: sanitizeText(failure.detail || failure.message || 'Provider failure recorded for diagnostics only.', env),
    neutralFallbackReason: 'Provider failure remained neutral and did not change planner behavior, itinerary generation, ranking, scoring, confidence scoring, UI, API contracts, or advisory wording.'
  }))
}

function signalsFor(itinerary: PlannerSignalAttributionItineraryInput, env: Record<string, string | undefined>) {
  return [
    weatherSignal(itinerary, env),
    historicalSignal(itinerary, env),
    airportSignal(itinerary, env),
    commercialSignal(itinerary, env),
    recoveryV2Signal(itinerary, env),
    standbySignal(itinerary, env)
  ]
}

function itineraryAttribution(itinerary: PlannerSignalAttributionItineraryInput, env: Record<string, string | undefined>): PlannerSignalItineraryAttribution {
  const signals = signalsFor(itinerary, env)
  const presentSignalCount = signals.filter((signal) => signal.status === 'present').length
  const partialSignalCount = signals.filter((signal) => signal.status === 'partial').length
  const missingSignalCount = signals.filter((signal) => signal.status === 'missing' || signal.status === 'neutral' || signal.status === 'disabled').length
  const failedSignalCount = signals.filter((signal) => signal.status === 'failed').length
  const contributed = signals.filter((signal) => signal.contributed).map((signal) => sourceLabels[signal.source])
  return {
    itineraryId: itinerary.id || null,
    route: sanitizeText(itinerary.route || 'unknown route', env),
    recommendation: itinerary.recommendation ? sanitizeText(String(itinerary.recommendation), env) : null,
    signals,
    presentSignalCount,
    partialSignalCount,
    missingSignalCount,
    failedSignalCount,
    attributionSummary: contributed.length
      ? sanitizeText(`Recommendation context included ${contributed.join(', ')}. Missing, failed, and unknown signals stayed neutral.`, env)
      : 'No planner attribution signals were present; neutral fallback applied for all providers.',
    guardrails: {
      diagnosticsOnly: true,
      missingProvidersNeutral: true,
      unknownProvidersDoNotThrow: true,
      noItineraryGenerationChange: true,
      noRankingChange: true,
      noScoringChange: true,
      noConfidenceScoringChange: true,
      noPlannerBehaviorChange: true,
      noUiChange: true,
      noApiContractChange: true,
      noAdvisoryWordingChange: true
    }
  }
}

export function buildPlannerSignalAttributionDiagnostics(input: PlannerSignalAttributionInput): PlannerSignalAttributionDiagnostics | undefined {
  const env = input.env || process.env
  if (!enabled(env)) return undefined
  const now = input.now || new Date()
  return {
    enabled: true,
    featureFlagEnvVar: plannerSignalAttributionFeatureFlag,
    generatedAt: now.toISOString(),
    diagnosticsOnly: true,
    advisoryOnly: true,
    noApiContractChange: true,
    noUiChange: true,
    noItineraryGenerationChange: true,
    noRankingChange: true,
    noScoringChange: true,
    noConfidenceScoringChange: true,
    noPlannerBehaviorChange: true,
    noAdvisoryWordingChange: true,
    missingProvidersNeutral: true,
    unknownProvidersDoNotThrow: true,
    itineraries: input.itineraries.map((itinerary) => itineraryAttribution(itinerary, env)),
    providerFailures: providerFailureSummaries(input.providerFailures || [], env),
    limitations: limitations.map((item) => sanitizeText(item, env))
  }
}

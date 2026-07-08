import type { ItineraryResult } from './itinerarySearch'
// @ts-ignore Node's experimental TypeScript test runner requires explicit .ts runtime imports; Next/tsc noEmit accept this suppressed import.
import { buildRecoveryV2Candidates, type RecoveryV2CandidatePipelineResult } from './recoveryV2CandidatePipeline.ts'
// @ts-ignore Node's experimental TypeScript test runner requires explicit .ts runtime imports; Next/tsc noEmit accept this suppressed import.
import { recoveryV2FeatureFlag } from './recoveryV2Readiness.ts'

export type RecoveryV2ProviderFailureInput = {
  provider?: string
  label?: string
  state?: string
  detail?: string
}

export type RecoveryV2DiagnosticCandidateReasoning = {
  candidateId: string
  type: string
  label: string
  source: string
  summary: string
  reasoning: string[]
  advisoryConfidence: 'advisory-context-only'
  rankingImpact: 0
  scoringImpact: 0
}

export type RecoveryV2RejectedCandidateSummary = {
  source: string
  status: string
  reason: string
  summary: string
}

export type RecoveryV2RecoveryConfidence = {
  level: 'none' | 'limited' | 'moderate' | 'strong'
  score: number
  advisoryOnly: true
  basis: string[]
  scoringImpact: 0
}

export type RecoveryV2StageMetadata = {
  stage: 'candidate-generation' | 'provider-failure-neutral-fallback' | 'no-candidates-neutral-fallback'
  featureFlagEnvVar: typeof recoveryV2FeatureFlag
  diagnosticsOnly: true
  itineraryGenerationChanged: false
  rankingChanged: false
  scoringChanged: false
  plannerBehaviorChanged: false
  uiChanged: false
  noFabricatedFlights: true
  providerSignalsEvaluated: number
  candidateCount: number
  rejectedCandidateCount: number
  providerFailureCount: number
  missingProviderCount: number
  generatedAt: string
}

export type RecoveryV2ItineraryDiagnostic = {
  itineraryId: string | null
  route: string
  recoveryConfidence: RecoveryV2RecoveryConfidence
  candidateReasoning: RecoveryV2DiagnosticCandidateReasoning[]
  rejectedCandidateSummaries: RecoveryV2RejectedCandidateSummary[]
  fallbackReason: string
  recoveryStageMetadata: RecoveryV2StageMetadata
}

export type RecoveryV2ServerDiagnostics = {
  enabled: true
  featureFlagEnvVar: typeof recoveryV2FeatureFlag
  advisoryOnly: true
  diagnosticsOnly: true
  noItineraryGenerationChange: true
  noRankingChange: true
  noScoringChange: true
  noPlannerBehaviorChange: true
  noUiChange: true
  noFabricatedFlights: true
  itineraries: RecoveryV2ItineraryDiagnostic[]
  providerFailures: RecoveryV2RejectedCandidateSummary[]
  limitations: string[]
}

export type RecoveryV2DiagnosticsIntegrationInput = {
  itineraries: ItineraryResult[]
  providerFailures?: RecoveryV2ProviderFailureInput[]
  safeErrors?: string[]
  now?: Date
  env?: Record<string, string | undefined>
}

const limitations = [
  'Recovery Engine v2 diagnostics are advisory planning context only.',
  'Diagnostics do not change itinerary generation, ranking, scoring, planner behavior, UI, provider behavior, or advisory wording.',
  'Recovery diagnostics never confirm flights, reaccommodation, hotel rooms, ground transport, seat inventory, standby clearance, or boarding outcome.',
  'Missing or failed provider signals remain neutral.'
]

function enabled(env: Record<string, string | undefined>) {
  const value = String(env[recoveryV2FeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function sanitizeText(value: string, env: Record<string, string | undefined> = process.env) {
  let sanitized = value
  for (const secret of Object.values(env)) {
    if (secret?.trim()) sanitized = sanitized.split(secret).join('[redacted]')
  }
  return sanitized
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, '$1[redacted]')
    .replace(/([?&](?:api_?key|token|access_token)=)[^\s&]+/gi, '$1[redacted]')
    .replace(/\b(?:sk|pk|key|token)_[a-z0-9_\-]{8,}\b/gi, '[redacted]')
}

function sanitizeList(values: string[], env: Record<string, string | undefined>) {
  return values.map((value) => sanitizeText(value, env))
}

function commercialAvailabilityFromItinerary(itinerary: ItineraryResult) {
  const signal = itinerary.sellableSeatSignal
  if (!signal) return null
  const safeLabel = signal.sellableStatus === 'available'
    ? 'favorable'
    : signal.sellableStatus === 'limited'
      ? 'limited'
      : signal.sellableStatus === 'unavailable'
        ? 'unavailable'
        : 'unknown'
  return {
    carrier: signal.carrier,
    flightNumber: signal.flightNumber,
    origin: signal.origin,
    destination: signal.destination,
    departureDate: signal.departureDate,
    cabinAvailability: [],
    fareClassAvailability: [],
    observedPrice: signal.observedPrice ?? null,
    priceTrend: signal.priceMovement,
    sellableStatus: signal.sellableStatus,
    safeLabel,
    confidence: signal.confidence,
    providerName: signal.source,
    lastUpdated: signal.observedAt,
    limitations: signal.limitations
  }
}

function confidenceFromPipeline(pipeline: RecoveryV2CandidatePipelineResult): RecoveryV2RecoveryConfidence {
  const candidateCount = pipeline.candidates.length
  const presentSignals = pipeline.diagnostics.signals.filter((signal) => signal.status === 'present' || signal.status === 'partial').length
  const sourceCount = new Set(pipeline.candidates.map((candidate) => candidate.source)).size
  const score = Math.min(100, candidateCount * 12 + presentSignals * 8 + sourceCount * 10)
  const level: RecoveryV2RecoveryConfidence['level'] = score >= 70 ? 'strong' : score >= 40 ? 'moderate' : score > 0 ? 'limited' : 'none'
  return {
    level,
    score,
    advisoryOnly: true,
    basis: [
      `${candidateCount} advisory recovery candidate${candidateCount === 1 ? '' : 's'} generated`,
      `${presentSignals} provider signal${presentSignals === 1 ? '' : 's'} present or partial`,
      `${sourceCount} candidate source${sourceCount === 1 ? '' : 's'} represented`
    ],
    scoringImpact: 0
  }
}

function candidateReasoning(pipeline: RecoveryV2CandidatePipelineResult, env: Record<string, string | undefined>): RecoveryV2DiagnosticCandidateReasoning[] {
  return pipeline.candidates.map((candidate) => ({
    candidateId: candidate.id,
    type: candidate.type,
    label: sanitizeText(candidate.label, env),
    source: candidate.source,
    summary: sanitizeText(candidate.summary, env),
    reasoning: sanitizeList([...candidate.provenance, ...candidate.diagnostics], env),
    advisoryConfidence: 'advisory-context-only',
    rankingImpact: 0,
    scoringImpact: 0
  }))
}

function rejectedSummaries(pipeline: RecoveryV2CandidatePipelineResult, env: Record<string, string | undefined>): RecoveryV2RejectedCandidateSummary[] {
  return pipeline.diagnostics.signals
    .filter((signal) => signal.candidateCount === 0)
    .map((signal) => ({
      source: signal.source,
      status: signal.status,
      reason: signal.status === 'missing'
        ? 'Provider signal missing; neutral fallback applied.'
        : signal.status === 'neutral'
          ? 'Provider signal was neutral; no recovery candidate generated.'
          : signal.contribution === 'diagnostics-only'
            ? 'Signal recorded as diagnostics-only; no recovery candidate generated.'
            : 'Signal did not produce a recovery candidate.',
      summary: sanitizeText(signal.message, env)
    }))
}

function providerFailureSummaries(providerFailures: RecoveryV2ProviderFailureInput[], safeErrors: string[], env: Record<string, string | undefined>): RecoveryV2RejectedCandidateSummary[] {
  const failures = providerFailures
    .filter((failure) => failure.state === 'error' || failure.state === 'warning' || failure.state === 'skipped')
    .map((failure) => ({
      source: sanitizeText(failure.provider || failure.label || 'provider', env),
      status: sanitizeText(failure.state || 'unavailable', env),
      reason: 'Provider did not supply usable recovery candidate input; neutral fallback applied.',
      summary: sanitizeText(failure.detail || failure.label || 'Provider unavailable for diagnostics.', env)
    }))
  const safeErrorFailures = safeErrors.map((error) => ({
    source: 'safe-error',
    status: 'warning',
    reason: 'Safe server warning recorded; no recovery candidate generated from this warning.',
    summary: sanitizeText(error, env)
  }))
  return [...failures, ...safeErrorFailures]
}

function fallbackReason(pipeline: RecoveryV2CandidatePipelineResult, providerFailureCount: number) {
  if (pipeline.candidates.length === 0 && providerFailureCount > 0) return 'No Recovery Engine v2 candidates were generated because provider failures or skipped sources remained neutral.'
  if (pipeline.candidates.length === 0) return 'No Recovery Engine v2 candidates were generated; missing and neutral provider signals remained neutral.'
  return `${pipeline.candidates.length} advisory Recovery Engine v2 candidate${pipeline.candidates.length === 1 ? '' : 's'} generated for diagnostics only.`
}

function stageFor(candidateCount: number, providerFailureCount: number): RecoveryV2StageMetadata['stage'] {
  if (providerFailureCount > 0) return 'provider-failure-neutral-fallback'
  if (candidateCount === 0) return 'no-candidates-neutral-fallback'
  return 'candidate-generation'
}

function itineraryDiagnostic(pipeline: RecoveryV2CandidatePipelineResult, providerFailureCount: number, now: Date, env: Record<string, string | undefined>): RecoveryV2ItineraryDiagnostic {
  const rejected = rejectedSummaries(pipeline, env)
  return {
    itineraryId: pipeline.itineraryId,
    route: sanitizeText(pipeline.route, env),
    recoveryConfidence: confidenceFromPipeline(pipeline),
    candidateReasoning: candidateReasoning(pipeline, env),
    rejectedCandidateSummaries: rejected,
    fallbackReason: sanitizeText(fallbackReason(pipeline, providerFailureCount), env),
    recoveryStageMetadata: {
      stage: stageFor(pipeline.candidates.length, providerFailureCount),
      featureFlagEnvVar: recoveryV2FeatureFlag,
      diagnosticsOnly: true,
      itineraryGenerationChanged: false,
      rankingChanged: false,
      scoringChanged: false,
      plannerBehaviorChanged: false,
      uiChanged: false,
      noFabricatedFlights: true,
      providerSignalsEvaluated: pipeline.diagnostics.signals.length,
      candidateCount: pipeline.candidates.length,
      rejectedCandidateCount: rejected.length,
      providerFailureCount,
      missingProviderCount: pipeline.diagnostics.signals.filter((signal) => signal.status === 'missing').length,
      generatedAt: now.toISOString()
    }
  }
}

export function buildRecoveryV2ServerDiagnostics(input: RecoveryV2DiagnosticsIntegrationInput): RecoveryV2ServerDiagnostics | undefined {
  const env = input.env || process.env
  if (!enabled(env)) return undefined

  const now = input.now || new Date()
  const providerFailures = providerFailureSummaries(input.providerFailures || [], input.safeErrors || [], env)
  const providerFailureCount = providerFailures.length
  const pipelines = input.itineraries.map((itinerary) => buildRecoveryV2Candidates({
    itinerary,
    recovery: itinerary.recovery,
    weatherIntelligence: itinerary.weatherIntelligence,
    historicalReliability: itinerary.historicalReliability,
    commercialAvailability: commercialAvailabilityFromItinerary(itinerary),
    now,
    env
  }))

  return {
    enabled: true,
    featureFlagEnvVar: recoveryV2FeatureFlag,
    advisoryOnly: true,
    diagnosticsOnly: true,
    noItineraryGenerationChange: true,
    noRankingChange: true,
    noScoringChange: true,
    noPlannerBehaviorChange: true,
    noUiChange: true,
    noFabricatedFlights: true,
    itineraries: pipelines.map((pipeline) => itineraryDiagnostic(pipeline, providerFailureCount, now, env)),
    providerFailures,
    limitations: sanitizeList(limitations, env)
  }
}

import type { AirportIntelligenceProviderResult } from './airportIntelligenceProvider'
import type { HistoricalReliability } from './historicalReliability'
import type { RecoveryAnalysis, RecoveryOption } from './recoveryEngine'
import type { CommercialAvailabilityCacheReadResult, CommercialAvailabilityFetchResult, SellableSeatAvailabilityProviderResult } from './sellableSeatAvailabilityProvider'
import type { StandbyConfidenceDiagnostics, StandbyConfidenceResult, StandbyConfidenceSignalDiagnostic } from './standbyConfidenceEngine'
import type { WeatherIntelligence } from './weatherIntelligence'

export type RecoveryV2CandidateType =
  | 'later-flight-monitoring'
  | 'alternate-airport'
  | 'overnight-hotel'
  | 'ground-transport'
  | 'weather-disruption-monitoring'
  | 'standby-confidence-monitoring'

export type RecoveryV2SignalSource =
  | 'existing-recovery-engine'
  | 'weather'
  | 'historical-reliability'
  | 'airport-intelligence'
  | 'commercial-availability'
  | 'standby-confidence'

export type RecoveryV2SignalStatus = 'present' | 'missing' | 'neutral' | 'disabled' | 'unavailable' | 'partial'

export type RecoveryV2Candidate = {
  id: string
  type: RecoveryV2CandidateType
  label: string
  summary: string
  source: RecoveryV2SignalSource
  status: 'candidate' | 'neutral'
  advisoryOnly: true
  confirmedAvailability: false
  bookingEnabled: false
  fabricatedFlight: false
  rankingImpact: 0
  scoringImpact: 0
  providerName: string | null
  provenance: string[]
  diagnostics: string[]
}

export type RecoveryV2SignalDiagnostic = {
  source: RecoveryV2SignalSource
  status: RecoveryV2SignalStatus
  providerName: string | null
  contribution: 'candidate-generation' | 'diagnostics-only' | 'neutral'
  candidateCount: number
  rankingImpact: 0
  scoringImpact: 0
  message: string
  metadata: Record<string, string | number | boolean | null>
}

export type RecoveryV2CandidatePipelineDiagnostics = {
  generatedAt: string
  advisoryOnly: true
  candidateGenerationOnly: true
  missingProvidersNeutral: true
  noRankingChange: true
  noScoringChange: true
  noItineraryGenerationChange: true
  noScraping: true
  noFabricatedFlights: true
  signals: RecoveryV2SignalDiagnostic[]
  limitations: string[]
}

export type RecoveryV2CandidatePipelineInput = {
  itinerary: {
    id?: string
    route: string
    score?: number
    topRouteRank?: number
    topRouteScore?: number
    legs?: Array<{ origin?: string; destination?: string; flightNumber?: string; departureTime?: string; arrivalTime?: string }>
  }
  recovery?: RecoveryAnalysis | null
  weatherIntelligence?: WeatherIntelligence | null
  historicalReliability?: HistoricalReliability | null
  airportIntelligence?: AirportIntelligenceProviderResult | AirportIntelligenceProviderResult[] | null
  commercialAvailability?: SellableSeatAvailabilityProviderResult | CommercialAvailabilityFetchResult | CommercialAvailabilityCacheReadResult | null
  standbyConfidence?: Pick<StandbyConfidenceResult, 'status' | 'level' | 'label' | 'displayValue' | 'advisoryOnly' | 'confirmedClearance' | 'standbyAvailabilityConfirmed' | 'diagnostics'> | StandbyConfidenceDiagnostics | null
  now?: Date
  env?: Record<string, string | undefined>
}

export type RecoveryV2CandidatePipelineResult = {
  itineraryId: string | null
  route: string
  advisoryOnly: true
  candidates: RecoveryV2Candidate[]
  diagnostics: RecoveryV2CandidatePipelineDiagnostics
  originalRanking: {
    score: number | null
    topRouteRank: number | null
    topRouteScore: number | null
  }
  unchangedRanking: {
    score: number | null
    topRouteRank: number | null
    topRouteScore: number | null
  }
}

const limitations = [
  'Recovery Engine v2 candidates are advisory planning context only and do not change itinerary generation, ranking, or scoring.',
  'Recovery candidates never confirm flights, reaccommodation, hotel rooms, ground transport, seat inventory, standby clearance, or boarding outcome.',
  'Missing, disabled, unavailable, stale, or unknown provider signals remain neutral.',
  'No scraping, booking, provider mutation, or external provider call is performed by candidate generation.'
]

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidate'
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

function sanitizeMetadata(metadata: Record<string, string | number | boolean | null>, env: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, typeof value === 'string' ? sanitizeText(value, env) : value]))
}

function candidate(input: Omit<RecoveryV2Candidate, 'advisoryOnly' | 'confirmedAvailability' | 'bookingEnabled' | 'fabricatedFlight' | 'rankingImpact' | 'scoringImpact'>, env: Record<string, string | undefined>): RecoveryV2Candidate {
  return {
    ...input,
    summary: sanitizeText(input.summary, env),
    providerName: input.providerName ? sanitizeText(input.providerName, env) : null,
    provenance: input.provenance.map((item) => sanitizeText(item, env)),
    diagnostics: input.diagnostics.map((item) => sanitizeText(item, env)),
    advisoryOnly: true,
    confirmedAvailability: false,
    bookingEnabled: false,
    fabricatedFlight: false,
    rankingImpact: 0,
    scoringImpact: 0
  }
}

function signalDiagnostic(input: Omit<RecoveryV2SignalDiagnostic, 'rankingImpact' | 'scoringImpact'>, env: Record<string, string | undefined>): RecoveryV2SignalDiagnostic {
  return {
    ...input,
    providerName: input.providerName ? sanitizeText(input.providerName, env) : null,
    rankingImpact: 0,
    scoringImpact: 0,
    message: sanitizeText(input.message, env),
    metadata: sanitizeMetadata(input.metadata, env)
  }
}

function candidateTypeFor(option: RecoveryOption): RecoveryV2CandidateType {
  if (option.type === 'later-flight' || option.type === 'next-day-flight') return 'later-flight-monitoring'
  if (option.type === 'alternate-airport') return 'alternate-airport'
  if (option.type === 'overnight-hotel') return 'overnight-hotel'
  return 'ground-transport'
}

function candidatesFromRecovery(recovery: RecoveryAnalysis | null | undefined, env: Record<string, string | undefined>) {
  if (!recovery) return []
  return recovery.backupOptions.map((option, index) => candidate({
    id: `recovery-v2-${candidateTypeFor(option)}-${index + 1}`,
    type: candidateTypeFor(option),
    label: option.label,
    summary: option.summary,
    source: 'existing-recovery-engine',
    status: 'candidate',
    providerName: null,
    provenance: ['Existing Recovery Engine placeholder analysis', `Recovery strength ${recovery.strength}`, `Option type ${option.type}`],
    diagnostics: ['Generated from existing Recovery Engine output only; no itinerary, score, or rank mutation is applied.']
  }, env))
}

function airportCandidates(signal: RecoveryV2CandidatePipelineInput['airportIntelligence'], env: Record<string, string | undefined>) {
  const signals = Array.isArray(signal) ? signal : signal ? [signal] : []
  return signals.flatMap((item) => item.alternateAirportOptions.slice(0, 3).map((alternate) => candidate({
    id: `recovery-v2-airport-${slug(item.airportCode)}-${slug(alternate.airportCode)}`,
    type: 'alternate-airport',
    label: `Alternate airport context: ${alternate.airportCode}`,
    summary: `${alternate.airportCode} is advisory alternate-airport context for ${item.airportCode}; verify actual flights and ground feasibility before travel.`,
    source: 'airport-intelligence',
    status: 'candidate',
    providerName: item.providerName || null,
    provenance: [`Airport intelligence provider ${item.providerName || 'unknown'}`, `Source airport ${item.airportCode}`, `Alternate confidence ${alternate.confidence}/100`],
    diagnostics: ['Airport intelligence is used for candidate context only and does not confirm airport viability, flights, or standby availability.']
  }, env)))
}

function weatherCandidates(weather: WeatherIntelligence | null | undefined, env: Record<string, string | undefined>) {
  if (!weather || weather.routeRisk.level === 'unknown' || weather.routeRisk.level === 'clear') return []
  const impactedAirports = weather.routeRisk.highRiskConnectionAirports.length ? weather.routeRisk.highRiskConnectionAirports.join(', ') : weather.route
  return [candidate({
    id: `recovery-v2-weather-${slug(weather.route)}`,
    type: 'weather-disruption-monitoring',
    label: `Weather recovery watch: ${weather.routeRisk.label}`,
    summary: `Advisory ${weather.routeRisk.label.toLowerCase()} weather risk for ${impactedAirports}; keep backup options ready without changing itinerary rank.`,
    source: 'weather',
    status: 'candidate',
    providerName: weather.source,
    provenance: [`Weather source ${weather.source}`, `Cache status ${weather.cacheStatus || 'unknown'}`, `Observed ${weather.observedAt}`],
    diagnostics: ['Weather is advisory-only candidate context and does not confirm delays, cancellations, waivers, or recovery outcomes.']
  }, env)]
}

function standbyDiagnosticsFrom(input: RecoveryV2CandidatePipelineInput['standbyConfidence']): StandbyConfidenceDiagnostics | null {
  if (!input) return null
  if ('signals' in input) return input
  return input.diagnostics
}

function standbyCandidates(standbyConfidence: RecoveryV2CandidatePipelineInput['standbyConfidence'], env: Record<string, string | undefined>) {
  const diagnostics = standbyDiagnosticsFrom(standbyConfidence)
  if (!diagnostics) return []
  const activeSignals = diagnostics.signals.filter((signal) => signal.status === 'present' || signal.status === 'partial')
  if (!activeSignals.length) return []
  return [candidate({
    id: `recovery-v2-standby-${slug(diagnostics.route)}`,
    type: 'standby-confidence-monitoring',
    label: 'Standby confidence advisory context',
    summary: 'Standby confidence diagnostics are available as advisory recovery context only; they never confirm clearance or seat availability.',
    source: 'standby-confidence',
    status: 'candidate',
    providerName: null,
    provenance: activeSignals.map((signal) => `${signal.source}: ${signal.status}`),
    diagnostics: diagnostics.signals.map((signal) => signal.message)
  }, env)]
}

function commercialSafeLabel(signal: RecoveryV2CandidatePipelineInput['commercialAvailability']) {
  if (!signal) return 'unknown'
  if ('safeLabel' in signal) return signal.safeLabel || 'unknown'
  return 'unknown'
}

function commercialProvider(signal: RecoveryV2CandidatePipelineInput['commercialAvailability']) {
  if (!signal) return null
  if ('providerName' in signal) return signal.providerName
  if ('entry' in signal) return signal.entry?.providerName || null
  return null
}

function commercialCandidate(signal: RecoveryV2CandidatePipelineInput['commercialAvailability'], env: Record<string, string | undefined>) {
  const safeLabel = commercialSafeLabel(signal)
  if (!signal || safeLabel === 'unknown') return []
  return [candidate({
    id: `recovery-v2-commercial-${slug(String(safeLabel))}`,
    type: 'later-flight-monitoring',
    label: `Commercial proxy context: ${safeLabel}`,
    summary: `Commercial availability proxy is ${safeLabel}; use only as advisory context for monitoring later options, not as standby availability.`,
    source: 'commercial-availability',
    status: 'candidate',
    providerName: commercialProvider(signal),
    provenance: [`Commercial safe label ${safeLabel}`, 'Proxy-only provider interface'],
    diagnostics: ['Commercial availability is proxy-only, scoring-neutral here, and never confirms non-rev or standby seat availability.']
  }, env)]
}

function recoverySignal(recovery: RecoveryAnalysis | null | undefined, candidateCount: number, env: Record<string, string | undefined>) {
  return signalDiagnostic({
    source: 'existing-recovery-engine',
    status: recovery ? 'present' : 'missing',
    providerName: null,
    contribution: recovery ? 'candidate-generation' : 'neutral',
    candidateCount,
    message: recovery ? 'Existing Recovery Engine output produced advisory recovery candidates without changing score or rank.' : 'Existing Recovery Engine output missing; recovery candidate source remains neutral.',
    metadata: {
      strength: recovery?.strength || 'unknown',
      score: recovery?.score ?? null,
      backupOptions: recovery?.backupOptions.length ?? 0
    }
  }, env)
}

function weatherSignal(weather: WeatherIntelligence | null | undefined, candidateCount: number, env: Record<string, string | undefined>) {
  return signalDiagnostic({
    source: 'weather',
    status: weather ? 'present' : 'missing',
    providerName: weather?.source || null,
    contribution: candidateCount ? 'candidate-generation' : weather ? 'diagnostics-only' : 'neutral',
    candidateCount,
    message: weather ? 'Weather signal evaluated for advisory recovery candidates only.' : 'Weather signal missing; unknown weather remains neutral.',
    metadata: {
      level: weather?.routeRisk.level || 'unknown',
      confidence: weather?.routeRisk.confidence || 'unknown',
      cacheStatus: weather?.cacheStatus || 'unknown'
    }
  }, env)
}

function historicalSignal(reliability: HistoricalReliability | null | undefined, env: Record<string, string | undefined>) {
  return signalDiagnostic({
    source: 'historical-reliability',
    status: reliability && reliability.signal.level !== 'unknown' ? 'present' : reliability ? 'neutral' : 'missing',
    providerName: reliability?.dataSources.join(', ') || null,
    contribution: 'diagnostics-only',
    candidateCount: 0,
    message: reliability ? 'Historical reliability is recorded as diagnostics-only context; candidate generation does not change scoring.' : 'Historical reliability missing; it remains neutral.',
    metadata: {
      level: reliability?.signal.level || 'unknown',
      confidence: reliability?.confidence || 'unknown',
      reliabilityScore: reliability?.reliabilityScore ?? null
    }
  }, env)
}

function airportSignal(signal: RecoveryV2CandidatePipelineInput['airportIntelligence'], candidateCount: number, env: Record<string, string | undefined>) {
  const signals = Array.isArray(signal) ? signal : signal ? [signal] : []
  const known = signals.filter((item) => item.providerName !== 'NullAirportIntelligenceProvider' && item.confidence > 0)
  return signalDiagnostic({
    source: 'airport-intelligence',
    status: known.length ? 'present' : signals.length ? 'neutral' : 'missing',
    providerName: known[0]?.providerName || signals[0]?.providerName || null,
    contribution: candidateCount ? 'candidate-generation' : known.length ? 'diagnostics-only' : 'neutral',
    candidateCount,
    message: known.length ? 'Airport intelligence evaluated for advisory alternate-airport candidates only.' : 'Airport intelligence missing or neutral; missing provider signals remain neutral.',
    metadata: {
      signalCount: signals.length,
      alternateAirportOptions: signals.reduce((sum, item) => sum + item.alternateAirportOptions.length, 0),
      averageConfidence: known.length ? Math.round(known.reduce((sum, item) => sum + item.confidence, 0) / known.length) : 0
    }
  }, env)
}

function commercialSignal(signal: RecoveryV2CandidatePipelineInput['commercialAvailability'], candidateCount: number, env: Record<string, string | undefined>) {
  const safeLabel = commercialSafeLabel(signal)
  return signalDiagnostic({
    source: 'commercial-availability',
    status: signal ? safeLabel === 'unknown' ? 'neutral' : 'present' : 'missing',
    providerName: commercialProvider(signal),
    contribution: candidateCount ? 'candidate-generation' : 'neutral',
    candidateCount,
    message: signal ? 'Commercial availability proxy evaluated for advisory recovery monitoring only.' : 'Commercial availability missing; it remains neutral.',
    metadata: {
      safeLabel,
      proxyOnly: true
    }
  }, env)
}

function standbySignal(standbyConfidence: RecoveryV2CandidatePipelineInput['standbyConfidence'], candidateCount: number, env: Record<string, string | undefined>) {
  const diagnostics = standbyDiagnosticsFrom(standbyConfidence)
  const signals: StandbyConfidenceSignalDiagnostic[] = diagnostics?.signals || []
  const presentSignals = signals.filter((signal) => signal.status === 'present' || signal.status === 'partial')
  return signalDiagnostic({
    source: 'standby-confidence',
    status: diagnostics ? presentSignals.length ? 'present' : 'neutral' : 'missing',
    providerName: null,
    contribution: candidateCount ? 'candidate-generation' : diagnostics ? 'diagnostics-only' : 'neutral',
    candidateCount,
    message: diagnostics ? 'Standby confidence diagnostics consumed as advisory recovery context only.' : 'Standby confidence diagnostics missing; recovery pipeline remains neutral.',
    metadata: {
      route: diagnostics?.route || 'unknown',
      advisoryOnly: true,
      signalCount: signals.length,
      activeSignalCount: presentSignals.length
    }
  }, env)
}

export function buildRecoveryV2Candidates(input: RecoveryV2CandidatePipelineInput): RecoveryV2CandidatePipelineResult {
  const env = input.env || process.env
  const recoveryCandidates = candidatesFromRecovery(input.recovery, env)
  const airport = airportCandidates(input.airportIntelligence, env)
  const weather = weatherCandidates(input.weatherIntelligence, env)
  const commercial = commercialCandidate(input.commercialAvailability, env)
  const standby = standbyCandidates(input.standbyConfidence, env)
  const candidates = [
    ...recoveryCandidates,
    ...airport,
    ...weather,
    ...commercial,
    ...standby
  ]
  const originalRanking = {
    score: typeof input.itinerary.score === 'number' ? input.itinerary.score : null,
    topRouteRank: typeof input.itinerary.topRouteRank === 'number' ? input.itinerary.topRouteRank : null,
    topRouteScore: typeof input.itinerary.topRouteScore === 'number' ? input.itinerary.topRouteScore : null
  }

  return {
    itineraryId: input.itinerary.id || null,
    route: input.itinerary.route,
    advisoryOnly: true,
    candidates,
    originalRanking,
    unchangedRanking: { ...originalRanking },
    diagnostics: {
      generatedAt: (input.now || new Date()).toISOString(),
      advisoryOnly: true,
      candidateGenerationOnly: true,
      missingProvidersNeutral: true,
      noRankingChange: true,
      noScoringChange: true,
      noItineraryGenerationChange: true,
      noScraping: true,
      noFabricatedFlights: true,
      signals: [
        recoverySignal(input.recovery, recoveryCandidates.length, env),
        weatherSignal(input.weatherIntelligence, weather.length, env),
        historicalSignal(input.historicalReliability, env),
        airportSignal(input.airportIntelligence, airport.length, env),
        commercialSignal(input.commercialAvailability, commercial.length, env),
        standbySignal(input.standbyConfidence, standby.length, env)
      ],
      limitations
    }
  }
}

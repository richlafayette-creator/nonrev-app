export type RecoveryV2ReadinessStatus = 'feature-disabled' | 'configured' | 'credential-missing' | 'manual-source-ready' | 'not-implemented'
export type RecoveryV2SourceName = 'Live schedule recovery' | 'Hotel recovery' | 'Ground transport recovery' | 'Alternate airport intelligence' | 'Weather/disruption recovery'

export type RecoveryV2SourceReadiness = {
  source: RecoveryV2SourceName
  status: RecoveryV2ReadinessStatus
  featureFlagEnvVar: 'NONREV_RECOVERY_ENGINE_V2_ENABLED'
  credentialEnvVar?: string
  advisoryOnly: true
  liveBookingEnabled: false
  canProvide: string[]
  cannotProvide: string[]
  nextAction: string
}

export type RecoveryV2Readiness = {
  featureFlagEnvVar: 'NONREV_RECOVERY_ENGINE_V2_ENABLED'
  enabled: boolean
  advisoryOnly: true
  liveBookingEnabled: false
  currentRecoveryScoringUnchanged: true
  sources: RecoveryV2SourceReadiness[]
  enabledSources: RecoveryV2SourceName[]
  diagnostics: string[]
  limitations: string[]
}

type RecoveryV2Capability = Omit<RecoveryV2SourceReadiness, 'status' | 'featureFlagEnvVar' | 'advisoryOnly' | 'liveBookingEnabled'> & {
  manualSource?: boolean
}

export const recoveryV2FeatureFlag = 'NONREV_RECOVERY_ENGINE_V2_ENABLED' as const

const recoveryV2Capabilities: RecoveryV2Capability[] = [
  {
    source: 'Live schedule recovery',
    credentialEnvVar: 'FLIGHTAWARE_API_KEY',
    canProvide: ['Same-day schedule context for possible later-flight recovery if endpoint scope, rate limits, and cache rules are approved.'],
    cannotProvide: ['Confirmed reaccommodation, protected seats, standby clearance, or airline operational commitments.'],
    nextAction: 'Keep behind server-side caching and provider-failure guardrails before using as recovery input.'
  },
  {
    source: 'Hotel recovery',
    credentialEnvVar: 'HOTEL_PROVIDER_API_KEY',
    canProvide: ['Hotel search context for overnight-risk planning if credentials, budget, and booking boundaries are approved.'],
    cannotProvide: ['Guaranteed room availability, booking on behalf of the traveler, airline hotel vouchers, or disruption compensation.'],
    nextAction: 'Define read-only search scope, cost caps, and explicit user confirmation before any booking-capable integration.'
  },
  {
    source: 'Ground transport recovery',
    credentialEnvVar: 'GROUND_TRANSPORT_PROVIDER_API_KEY',
    canProvide: ['Ground transport duration/cost context for airport alternates if credentials and provider terms are approved.'],
    cannotProvide: ['Guaranteed vehicle availability, booked rides, airline-provided transport, or border/visa feasibility.'],
    nextAction: 'Start with read-only estimates and never trigger booking flows without explicit user action.'
  },
  {
    source: 'Alternate airport intelligence',
    manualSource: true,
    canProvide: ['Reviewed alternate-airport mappings, rough ground-time placeholders, and recovery planning context.'],
    cannotProvide: ['Live road conditions, guaranteed airport viability, confirmed seats, or standby clearance.'],
    nextAction: 'Expand reviewed alternate mappings and keep unknown airports conservative.'
  },
  {
    source: 'Weather/disruption recovery',
    manualSource: true,
    canProvide: ['Advisory weather/disruption context from existing weather readiness and cached signals when available.'],
    cannotProvide: ['Confirmed delays, cancellations, airline waivers, reaccommodation, or standby clearance.'],
    nextAction: 'Use only advisory cached weather/disruption signals and keep unknown weather neutral.'
  }
]

const limitations = [
  'Recovery Engine v2 readiness is advisory planning context only and does not change current recovery scoring.',
  'Recovery guidance never confirms reaccommodation, hotel rooms, ground transport, seat inventory, or standby clearance.',
  'No booking, scraping, airline website access, or external provider call is enabled by this readiness contract.'
]

function enabled(env: Record<string, string | undefined>) {
  const value = String(env[recoveryV2FeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function sourceStatus(source: RecoveryV2Capability, env: Record<string, string | undefined>): RecoveryV2ReadinessStatus {
  if (!enabled(env)) return 'feature-disabled'
  if (source.manualSource) return 'manual-source-ready'
  if (source.credentialEnvVar) return hasCredential(env, source.credentialEnvVar) ? 'configured' : 'credential-missing'
  return 'not-implemented'
}

export function getRecoveryV2Readiness(env: Record<string, string | undefined> = process.env): RecoveryV2Readiness {
  const isEnabled = enabled(env)
  const sources = recoveryV2Capabilities.map((source) => ({
    source: source.source,
    status: sourceStatus(source, env),
    featureFlagEnvVar: recoveryV2FeatureFlag,
    credentialEnvVar: source.credentialEnvVar,
    advisoryOnly: true as const,
    liveBookingEnabled: false as const,
    canProvide: source.canProvide,
    cannotProvide: source.cannotProvide,
    nextAction: source.nextAction
  }))
  const enabledSources = sources
    .filter((source) => source.status === 'configured' || source.status === 'manual-source-ready')
    .map((source) => source.source)

  return {
    featureFlagEnvVar: recoveryV2FeatureFlag,
    enabled: isEnabled,
    advisoryOnly: true,
    liveBookingEnabled: false,
    currentRecoveryScoringUnchanged: true,
    sources,
    enabledSources,
    diagnostics: [
      isEnabled ? 'Recovery Engine v2 readiness is enabled for reviewed advisory inputs only.' : 'Recovery Engine v2 readiness is disabled; current placeholder recovery behavior remains unchanged.',
      'Readiness does not enable booking, scraping, provider calls, or confirmed recovery outcomes.'
    ],
    limitations
  }
}

export type HistoricalReliabilityProviderStatus =
  | 'feature-disabled'
  | 'credential-configured'
  | 'credential-missing'
  | 'public-source-ready'
  | 'internal-source-ready'
  | 'not-implemented'

export type HistoricalReliabilityProviderName =
  | 'FAA BTS'
  | 'FlightAware historical'
  | 'Cirium'
  | 'AviationStack'
  | 'Internal analytics'

export type HistoricalReliabilityProviderReadiness = {
  provider: HistoricalReliabilityProviderName
  status: HistoricalReliabilityProviderStatus
  featureFlagEnvVar: 'NONREV_HISTORICAL_RELIABILITY_PROVIDER_ENABLED'
  credentialEnvVar?: string
  liveCallsEnabled: false
  advisoryOnly: true
  canProvide: string[]
  cannotProvide: string[]
  nextAction: string
}

type ProviderCapability = Omit<HistoricalReliabilityProviderReadiness, 'status' | 'featureFlagEnvVar' | 'liveCallsEnabled' | 'advisoryOnly'> & {
  publicSource?: boolean
  internalSource?: boolean
}

export const historicalReliabilityProviderFeatureFlag = 'NONREV_HISTORICAL_RELIABILITY_PROVIDER_ENABLED' as const

const historicalReliabilityProviderCapabilities: ProviderCapability[] = [
  {
    provider: 'FAA BTS',
    publicSource: true,
    canProvide: ['Historical airline/route operational performance context after a server-side adapter and cache are approved.'],
    cannotProvide: ['Future flight operation certainty, same-day disruption certainty, seat inventory, or confirmed standby availability.'],
    nextAction: 'Add a cached server-side BTS adapter with conservative route/carrier aggregation and no client-side calls.'
  },
  {
    provider: 'FlightAware historical',
    credentialEnvVar: 'FLIGHTAWARE_API_KEY',
    canProvide: ['Historical flight operation context if the approved plan exposes historical endpoints and request limits are validated.'],
    cannotProvide: ['Load factors, non-rev list position, guaranteed boarding, or confirmed standby availability.'],
    nextAction: 'Verify endpoint availability, plan limits, timeout policy, and cache schema before enabling any calls.'
  },
  {
    provider: 'Cirium',
    credentialEnvVar: 'CIRIUM_API_KEY',
    canProvide: ['Commercial historical performance data if credentials, budget, and licensing are explicitly approved.'],
    cannotProvide: ['Non-rev priority order, standby list outcomes, or airline employee travel eligibility.'],
    nextAction: 'Keep disabled until credentials, licensing, budget, and data-retention rules are approved.'
  },
  {
    provider: 'AviationStack',
    credentialEnvVar: 'AVIATIONSTACK_API_KEY',
    canProvide: ['Basic historical schedule/status context if plan capabilities and freshness limits are validated.'],
    cannotProvide: ['Confirmed seat availability, standby clearance probability, or complete airline operational recovery commitments.'],
    nextAction: 'Validate historical endpoint coverage and rate limits before adding a server-side adapter.'
  },
  {
    provider: 'Internal analytics',
    internalSource: true,
    canProvide: ['Aggregated prior Nonrevy search/outcome signals once privacy-safe retention and sample-size rules are approved.'],
    cannotProvide: ['Personally identifying travel history, guaranteed future outcomes, or confirmed standby availability.'],
    nextAction: 'Define privacy-safe aggregation, minimum sample sizes, and opt-out behavior before using internal outcomes.'
  }
]

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[historicalReliabilityProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function readinessStatus(source: ProviderCapability, env: Record<string, string | undefined>): HistoricalReliabilityProviderStatus {
  if (!featureEnabled(env)) return 'feature-disabled'
  if (source.publicSource) return 'public-source-ready'
  if (source.internalSource) return 'internal-source-ready'
  if (source.credentialEnvVar) return hasCredential(env, source.credentialEnvVar) ? 'credential-configured' : 'credential-missing'
  return 'not-implemented'
}

export function getHistoricalReliabilityProviderReadiness(env: Record<string, string | undefined> = process.env): HistoricalReliabilityProviderReadiness[] {
  return historicalReliabilityProviderCapabilities.map((source) => ({
    provider: source.provider,
    status: readinessStatus(source, env),
    featureFlagEnvVar: historicalReliabilityProviderFeatureFlag,
    credentialEnvVar: source.credentialEnvVar,
    liveCallsEnabled: false,
    advisoryOnly: true,
    canProvide: source.canProvide,
    cannotProvide: source.cannotProvide,
    nextAction: source.nextAction
  }))
}

export function enabledHistoricalReliabilityProviderNames(env: Record<string, string | undefined> = process.env): HistoricalReliabilityProviderName[] {
  return getHistoricalReliabilityProviderReadiness(env)
    .filter((source) => source.status === 'public-source-ready' || source.status === 'internal-source-ready' || source.status === 'credential-configured')
    .map((source) => source.provider)
}

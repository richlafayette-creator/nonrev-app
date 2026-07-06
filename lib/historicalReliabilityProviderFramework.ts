export type HistoricalReliabilityProviderStatus = 'feature-disabled' | 'configured' | 'credential-missing' | 'not-implemented'

export type HistoricalReliabilityQuery = {
  origin: string
  destination: string
  carrier?: string
  flightNumber?: string
  departureDate?: string
}

export type HistoricalReliabilityProviderResult = {
  onTimePercentage: number | null
  cancellationPercentage: number | null
  averageDepartureDelay: number | null
  averageArrivalDelay: number | null
  confidenceScore: number
  lastUpdated: string | null
  providerName: string
}

export interface HistoricalReliabilityProvider {
  readonly providerName: string
  readonly featureFlagEnvVar: typeof historicalReliabilityProviderFrameworkFeatureFlag
  readonly status: HistoricalReliabilityProviderStatus
  readonly liveCallsEnabled: false
  readonly advisoryOnly: true
  getReliability(query: HistoricalReliabilityQuery): Promise<HistoricalReliabilityProviderResult>
}

export type HistoricalReliabilityProviderConfig = {
  providerName: string
  credentialEnvVar?: string
  enabled: boolean
  status: HistoricalReliabilityProviderStatus
  liveCallsEnabled: false
  advisoryOnly: true
  notes: string[]
}

export const historicalReliabilityProviderFrameworkFeatureFlag = 'NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED' as const

export const nullHistoricalReliabilityResult: HistoricalReliabilityProviderResult = {
  onTimePercentage: null,
  cancellationPercentage: null,
  averageDepartureDelay: null,
  averageArrivalDelay: null,
  confidenceScore: 0,
  lastUpdated: null,
  providerName: 'NullHistoricalReliabilityProvider'
}

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[historicalReliabilityProviderFrameworkFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function futureProviderStatus(input: { env: Record<string, string | undefined>; credentialEnvVar?: string; implemented: boolean }): HistoricalReliabilityProviderStatus {
  if (!featureEnabled(input.env)) return 'feature-disabled'
  if (!input.implemented) return 'not-implemented'
  if (input.credentialEnvVar && !hasCredential(input.env, input.credentialEnvVar)) return 'credential-missing'
  return 'configured'
}

export class NullHistoricalReliabilityProvider implements HistoricalReliabilityProvider {
  readonly providerName = 'NullHistoricalReliabilityProvider'
  readonly featureFlagEnvVar = historicalReliabilityProviderFrameworkFeatureFlag
  readonly status: HistoricalReliabilityProviderStatus = 'feature-disabled'
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const

  async getReliability(_query: HistoricalReliabilityQuery): Promise<HistoricalReliabilityProviderResult> {
    return { ...nullHistoricalReliabilityResult }
  }
}

const futureProviderDefinitions: Array<{
  providerName: string
  credentialEnvVar?: string
  notes: string[]
}> = [
  {
    providerName: 'BTSHistoricalReliabilityProvider',
    notes: [
      'Future FAA BTS adapter placeholder only; no BTS import or network call is implemented.',
      'Historical reliability must remain advisory and must not claim standby availability or current live operations.'
    ]
  },
  {
    providerName: 'FlightAwareHistoricalReliabilityProvider',
    credentialEnvVar: 'FLIGHTAWARE_API_KEY',
    notes: [
      'Future FlightAware historical adapter placeholder only; no AeroAPI call is implemented.',
      'Requires endpoint, rate-limit, cache, and licensing review before implementation.'
    ]
  },
  {
    providerName: 'InternalHistoricalReliabilityProvider',
    notes: [
      'Future privacy-safe internal aggregate placeholder only; no user outcome aggregation is implemented.',
      'Requires retention, sample-size, privacy, and opt-out rules before implementation.'
    ]
  }
]

export function historicalReliabilityProviderConfiguration(env: Record<string, string | undefined> = process.env): HistoricalReliabilityProviderConfig[] {
  return futureProviderDefinitions.map((definition) => ({
    providerName: definition.providerName,
    credentialEnvVar: definition.credentialEnvVar,
    enabled: featureEnabled(env),
    status: futureProviderStatus({ env, credentialEnvVar: definition.credentialEnvVar, implemented: false }),
    liveCallsEnabled: false,
    advisoryOnly: true,
    notes: [...definition.notes]
  }))
}

export class HistoricalReliabilityProviderRegistry {
  private readonly providers = new Map<string, HistoricalReliabilityProvider>()
  private readonly fallbackProvider = new NullHistoricalReliabilityProvider()

  register(provider: HistoricalReliabilityProvider) {
    this.providers.set(provider.providerName, provider)
  }

  get(providerName?: string) {
    if (!providerName) return this.fallbackProvider
    return this.providers.get(providerName) || this.fallbackProvider
  }

  listProviderNames() {
    return [...this.providers.keys()]
  }
}

export function createHistoricalReliabilityProviderRegistry() {
  return new HistoricalReliabilityProviderRegistry()
}

export function createHistoricalReliabilityProvider(input: {
  providerName?: string
  env?: Record<string, string | undefined>
  registry?: HistoricalReliabilityProviderRegistry
} = {}): HistoricalReliabilityProvider {
  if (!featureEnabled(input.env || process.env)) return new NullHistoricalReliabilityProvider()
  return (input.registry || createHistoricalReliabilityProviderRegistry()).get(input.providerName)
}

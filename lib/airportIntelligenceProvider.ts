export type AirportIntelligenceProviderStatus =
  | 'static-scaffold-ready'
  | 'feature-disabled'
  | 'credential-configured'
  | 'credential-missing'
  | 'public-source-ready'
  | 'not-implemented'

export type AirportIntelligenceProviderName =
  | 'Local static airport scaffold'
  | 'OurAirports'
  | 'FAA airport facilities'
  | 'FlightAware airport endpoints'
  | 'Mapbox airport context'

export type AirportIntelligenceProviderReadiness = {
  provider: AirportIntelligenceProviderName
  status: AirportIntelligenceProviderStatus
  featureFlagEnvVar?: 'NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED'
  credentialEnvVar?: string
  liveCallsEnabled: false
  advisoryOnly: true
  canProvide: string[]
  cannotProvide: string[]
  nextAction: string
}

type ProviderCapability = Omit<AirportIntelligenceProviderReadiness, 'status' | 'liveCallsEnabled' | 'advisoryOnly'> & {
  staticScaffold?: boolean
  publicSource?: boolean
}

export type AirportCongestionLevel = 'unknown' | 'low' | 'moderate' | 'high' | 'severe'
export type AirportIntelligenceRiskLevel = 'unknown' | 'low' | 'moderate' | 'high' | 'severe'

export type AirportIntelligenceQuery = {
  airportCode: string
  arrivalTerminal?: string
  departureTerminal?: string
  carrier?: string
  connectionMinutes?: number
  internationalArrival?: boolean
  requestedAt?: string
}

export type AlternateAirportOption = {
  airportCode: string
  reason: string
  recoveryScore: number | null
  minimumConnectionMinutes: number | null
  confidence: number
}

export type AirportIntelligenceProviderResult = {
  airportCode: string
  congestionLevel: AirportCongestionLevel
  connectionRisk: AirportIntelligenceRiskLevel
  minimumConnectionMinutes: number | null
  customsImmigrationRisk: AirportIntelligenceRiskLevel
  terminalTransferRisk: AirportIntelligenceRiskLevel
  alternateAirportOptions: AlternateAirportOption[]
  recoveryScore: number | null
  confidence: number
  providerName: string
  lastUpdated: string | null
}

export interface AirportIntelligenceProvider {
  readonly providerName: string
  readonly featureFlagEnvVar: typeof airportIntelligenceProviderFeatureFlag
  readonly status: AirportIntelligenceProviderStatus
  readonly liveCallsEnabled: false
  readonly advisoryOnly: true
  getAirportIntelligence(query: AirportIntelligenceQuery): Promise<AirportIntelligenceProviderResult>
}

export type AirportIntelligenceProviderConfig = {
  providerName: string
  credentialEnvVar?: string
  enabled: boolean
  status: Extract<AirportIntelligenceProviderStatus, 'feature-disabled' | 'credential-missing' | 'not-implemented'>
  liveCallsEnabled: false
  advisoryOnly: true
  notes: string[]
}

export const airportIntelligenceProviderFeatureFlag = 'NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED' as const

export const nullAirportIntelligenceResult: Omit<AirportIntelligenceProviderResult, 'airportCode'> = {
  congestionLevel: 'unknown',
  connectionRisk: 'unknown',
  minimumConnectionMinutes: null,
  customsImmigrationRisk: 'unknown',
  terminalTransferRisk: 'unknown',
  alternateAirportOptions: [],
  recoveryScore: null,
  confidence: 0,
  providerName: 'NullAirportIntelligenceProvider',
  lastUpdated: null
}

const airportIntelligenceProviderCapabilities: ProviderCapability[] = [
  {
    provider: 'Local static airport scaffold',
    staticScaffold: true,
    canProvide: ['Reviewed local airport profiles for selected hubs, connection difficulty, walking category, hub strength, and backup-depth labels.'],
    cannotProvide: ['Live gate assignments, live terminal changes, security wait times, seat inventory, or confirmed standby availability.'],
    nextAction: 'Continue expanding reviewed static profiles while keeping unknown airports conservative.'
  },
  {
    provider: 'OurAirports',
    featureFlagEnvVar: airportIntelligenceProviderFeatureFlag,
    publicSource: true,
    canProvide: ['Public airport metadata such as airport type, coordinates, municipality, and IATA/ICAO mapping after a cached server-side adapter is approved.'],
    cannotProvide: ['Terminal walking times, live airport operations, airline recovery commitments, or standby clearance outcomes.'],
    nextAction: 'Add a cached import step with attribution and schema validation before using it in scoring.'
  },
  {
    provider: 'FAA airport facilities',
    featureFlagEnvVar: airportIntelligenceProviderFeatureFlag,
    publicSource: true,
    canProvide: ['US airport facility metadata after a cached server-side import is approved.'],
    cannotProvide: ['Current gate assignments, inter-terminal connection timing, load factors, or non-rev seat availability.'],
    nextAction: 'Create a server-side cached import with stale-safe fallback to the local scaffold.'
  },
  {
    provider: 'FlightAware airport endpoints',
    featureFlagEnvVar: airportIntelligenceProviderFeatureFlag,
    credentialEnvVar: 'FLIGHTAWARE_API_KEY',
    canProvide: ['Airport-adjacent operational context if the approved plan exposes safe airport endpoints and request limits are validated.'],
    cannotProvide: ['Standby list position, employee travel priority, guaranteed boarding, or confirmed seat inventory.'],
    nextAction: 'Verify endpoint coverage, plan limits, timeout policy, and caching before adding any calls.'
  },
  {
    provider: 'Mapbox airport context',
    featureFlagEnvVar: airportIntelligenceProviderFeatureFlag,
    credentialEnvVar: 'NEXT_PUBLIC_MAPBOX_TOKEN',
    canProvide: ['Map rendering context around airports when configured; useful for visual orientation only.'],
    cannotProvide: ['Terminal/gate truth, route viability, airline inventory, or confirmed standby availability.'],
    nextAction: 'Keep map context separate from operational scoring unless reviewed airport-specific data is added.'
  }
]

const futureProviderDefinitions: Array<{
  providerName: string
  credentialEnvVar?: string
  notes: string[]
}> = [
  {
    providerName: 'OurAirportsAirportIntelligenceProvider',
    notes: [
      'Future public airport metadata adapter placeholder only; no import, cache read, or network call is implemented.',
      'Metadata must remain advisory and must not determine itinerary ranking or claim live airport operating conditions.'
    ]
  },
  {
    providerName: 'FaaAirportFacilitiesIntelligenceProvider',
    notes: [
      'Future FAA airport facilities adapter placeholder only; no FAA dataset fetch or live endpoint is implemented.',
      'Facility metadata must be cached server-side and reviewed before any planner use is considered.'
    ]
  },
  {
    providerName: 'FlightAwareAirportIntelligenceProvider',
    credentialEnvVar: 'FLIGHTAWARE_API_KEY',
    notes: [
      'Future FlightAware airport endpoint placeholder only; no AeroAPI call is implemented.',
      'Requires endpoint coverage, rate-limit, timeout, caching, and licensing review before implementation.'
    ]
  },
  {
    providerName: 'MapboxAirportContextProvider',
    credentialEnvVar: 'NEXT_PUBLIC_MAPBOX_TOKEN',
    notes: [
      'Future map-context placeholder only; no map data is used as terminal, gate, customs, recovery, or connection truth.',
      'Map rendering context must stay separate from scoring unless reviewed airport intelligence is added later.'
    ]
  }
]

function normalizeAirportCode(airportCode: string) {
  return airportCode.trim().toUpperCase()
}

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[airportIntelligenceProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function readinessStatus(source: ProviderCapability, env: Record<string, string | undefined>): AirportIntelligenceProviderStatus {
  if (source.staticScaffold) return 'static-scaffold-ready'
  if (!featureEnabled(env)) return 'feature-disabled'
  if (source.publicSource) return 'public-source-ready'
  if (source.credentialEnvVar) return hasCredential(env, source.credentialEnvVar) ? 'credential-configured' : 'credential-missing'
  return 'not-implemented'
}

function frameworkConfigStatus(definition: { credentialEnvVar?: string }, env: Record<string, string | undefined>): AirportIntelligenceProviderConfig['status'] {
  if (!featureEnabled(env)) return 'feature-disabled'
  if (definition.credentialEnvVar && !hasCredential(env, definition.credentialEnvVar)) return 'credential-missing'
  return 'not-implemented'
}

export class NullAirportIntelligenceProvider implements AirportIntelligenceProvider {
  readonly providerName = 'NullAirportIntelligenceProvider'
  readonly featureFlagEnvVar = airportIntelligenceProviderFeatureFlag
  readonly status: AirportIntelligenceProviderStatus = 'feature-disabled'
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const

  async getAirportIntelligence(query: AirportIntelligenceQuery): Promise<AirportIntelligenceProviderResult> {
    return {
      airportCode: normalizeAirportCode(query.airportCode),
      ...nullAirportIntelligenceResult,
      alternateAirportOptions: [...nullAirportIntelligenceResult.alternateAirportOptions]
    }
  }
}

export class AirportIntelligenceProviderRegistry {
  private readonly providers = new Map<string, AirportIntelligenceProvider>()
  private readonly fallbackProvider = new NullAirportIntelligenceProvider()

  register(provider: AirportIntelligenceProvider) {
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

export function createAirportIntelligenceProviderRegistry() {
  return new AirportIntelligenceProviderRegistry()
}

export function createAirportIntelligenceProvider(input: {
  providerName?: string
  env?: Record<string, string | undefined>
  registry?: AirportIntelligenceProviderRegistry
} = {}): AirportIntelligenceProvider {
  if (!featureEnabled(input.env || process.env)) return new NullAirportIntelligenceProvider()
  return (input.registry || createAirportIntelligenceProviderRegistry()).get(input.providerName)
}

export function airportIntelligenceProviderConfiguration(env: Record<string, string | undefined> = process.env): AirportIntelligenceProviderConfig[] {
  return futureProviderDefinitions.map((definition) => ({
    providerName: definition.providerName,
    credentialEnvVar: definition.credentialEnvVar,
    enabled: featureEnabled(env),
    status: frameworkConfigStatus(definition, env),
    liveCallsEnabled: false,
    advisoryOnly: true,
    notes: [...definition.notes]
  }))
}

export function getAirportIntelligenceProviderReadiness(env: Record<string, string | undefined> = process.env): AirportIntelligenceProviderReadiness[] {
  return airportIntelligenceProviderCapabilities.map((source) => ({
    provider: source.provider,
    status: readinessStatus(source, env),
    featureFlagEnvVar: source.featureFlagEnvVar,
    credentialEnvVar: source.credentialEnvVar,
    liveCallsEnabled: false,
    advisoryOnly: true,
    canProvide: source.canProvide,
    cannotProvide: source.cannotProvide,
    nextAction: source.nextAction
  }))
}

export function enabledDynamicAirportIntelligenceProviderNames(env: Record<string, string | undefined> = process.env): AirportIntelligenceProviderName[] {
  return getAirportIntelligenceProviderReadiness(env)
    .filter((source) => source.provider !== 'Local static airport scaffold')
    .filter((source) => source.status === 'public-source-ready' || source.status === 'credential-configured')
    .map((source) => source.provider)
}

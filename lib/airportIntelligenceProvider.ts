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

export const airportIntelligenceProviderFeatureFlag = 'NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED' as const

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

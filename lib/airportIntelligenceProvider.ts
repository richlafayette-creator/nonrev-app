export type AirportIntelligenceProviderStatus =
  | 'static-scaffold-ready'
  | 'feature-disabled'
  | 'credential-configured'
  | 'credential-missing'
  | 'public-source-ready'
  | 'not-implemented'

export type AirportIntelligenceProviderHealth = 'ready' | 'disabled' | 'unavailable' | 'not-implemented'
export type AirportIntelligenceCacheStatus = 'fresh' | 'stale' | 'expired' | 'missing' | 'disabled'
export type AirportIntelligenceCacheReasonCode =
  | 'feature-disabled'
  | 'cache-fresh'
  | 'cache-missing'
  | 'cache-stale-age-exceeded'
  | 'cache-expired-age-exceeded'
  | 'cache-invalid-timestamp'
export type AirportIntelligenceDiagnosticSeverity = 'info' | 'warning' | 'error'

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

export type AirportIntelligenceProviderDiagnostic = {
  code: string
  severity: AirportIntelligenceDiagnosticSeverity
  provider: AirportIntelligenceProviderName
  message: string
}

export type AirportIntelligenceCacheObservation = {
  provider: AirportIntelligenceProviderName
  fetchedAt?: string | null
}

export type AirportIntelligenceCacheAgeMetadata = {
  status: AirportIntelligenceCacheStatus
  reasonCode: AirportIntelligenceCacheReasonCode
  fetchedAt: string | null
  observedAt: string
  ageMinutes: number | null
  freshForMinutes: number
  expireAfterMinutes: number
  staleAt: string | null
  expiresAt: string | null
}

export type AirportIntelligenceProviderHealthSummary = {
  provider: AirportIntelligenceProviderName
  status: AirportIntelligenceProviderStatus
  health: AirportIntelligenceProviderHealth
  summary: string
  unavailableReason: string | null
  disabledSummary: string | null
  liveCallsEnabled: false
  advisoryOnly: true
  cache: AirportIntelligenceCacheAgeMetadata
  diagnostics: AirportIntelligenceProviderDiagnostic[]
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

const defaultAirportIntelligenceCacheFreshForMinutes = 60 * 24 * 7
const defaultAirportIntelligenceCacheExpireAfterMinutes = 60 * 24 * 30

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

function isoFromDate(value: Date) {
  return value.toISOString()
}

function validInstant(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function minutesFromEnv(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return clampInteger(parsed, min, max)
}

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[airportIntelligenceProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function cachePolicy(env: Record<string, string | undefined>) {
  const freshForMinutes = minutesFromEnv(env.NONREV_AIRPORT_INTELLIGENCE_CACHE_FRESH_MINUTES, defaultAirportIntelligenceCacheFreshForMinutes, 60, 60 * 24 * 60)
  const expireAfterMinutes = Math.max(
    freshForMinutes,
    minutesFromEnv(env.NONREV_AIRPORT_INTELLIGENCE_CACHE_EXPIRE_MINUTES, defaultAirportIntelligenceCacheExpireAfterMinutes, 60, 60 * 24 * 365)
  )
  return { freshForMinutes, expireAfterMinutes }
}

function redactAirportIntelligenceDiagnosticMessage(message: string, env: Record<string, string | undefined>) {
  let redacted = message
  for (const capability of airportIntelligenceProviderCapabilities) {
    const value = capability.credentialEnvVar ? env[capability.credentialEnvVar] : undefined
    if (value?.trim()) redacted = redacted.split(value).join('[redacted]')
  }
  return redacted
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, '$1[redacted]')
    .replace(/([?&](?:api_?key|token|access_token)=)[^\s&]+/gi, '$1[redacted]')
    .replace(/\b(?:sk|pk|key|token)_[a-z0-9_\-]{8,}\b/gi, '[redacted]')
}

function sanitizedDiagnostic(input: AirportIntelligenceProviderDiagnostic, env: Record<string, string | undefined>): AirportIntelligenceProviderDiagnostic {
  return {
    ...input,
    message: redactAirportIntelligenceDiagnosticMessage(input.message, env)
  }
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

function providerHealth(status: AirportIntelligenceProviderStatus): AirportIntelligenceProviderHealth {
  if (status === 'static-scaffold-ready' || status === 'public-source-ready' || status === 'credential-configured') return 'ready'
  if (status === 'feature-disabled') return 'disabled'
  if (status === 'credential-missing') return 'unavailable'
  return 'not-implemented'
}

function unavailableReason(status: AirportIntelligenceProviderStatus) {
  if (status === 'feature-disabled') return 'feature flag disabled'
  if (status === 'credential-missing') return 'credential missing'
  if (status === 'not-implemented') return 'provider not implemented'
  return null
}

function providerSummary(provider: AirportIntelligenceProviderName, status: AirportIntelligenceProviderStatus) {
  if (provider === 'Local static airport scaffold') return 'Local airport intelligence scaffold is available as advisory static metadata only.'
  if (status === 'feature-disabled') return `${provider} is disabled by feature flag; no cache or provider data is used.`
  if (status === 'credential-missing') return `${provider} is unavailable because required credentials are missing; fallback remains neutral.`
  if (status === 'public-source-ready' || status === 'credential-configured') return `${provider} is configured/readiness-only; live calls remain disabled and any future data must be cached.`
  return `${provider} is a future placeholder and is not implemented.`
}

function cacheAgeMetadata(input: {
  status: AirportIntelligenceProviderStatus
  observation?: AirportIntelligenceCacheObservation
  observedAt: Date
  env: Record<string, string | undefined>
}): AirportIntelligenceCacheAgeMetadata {
  const policy = cachePolicy(input.env)
  const observedAt = isoFromDate(input.observedAt)
  if (input.status === 'feature-disabled') {
    return {
      status: 'disabled',
      reasonCode: 'feature-disabled',
      fetchedAt: null,
      observedAt,
      ageMinutes: null,
      freshForMinutes: policy.freshForMinutes,
      expireAfterMinutes: policy.expireAfterMinutes,
      staleAt: null,
      expiresAt: null
    }
  }

  const fetchedAtMs = validInstant(input.observation?.fetchedAt)
  if (!input.observation?.fetchedAt) {
    return {
      status: 'missing',
      reasonCode: 'cache-missing',
      fetchedAt: null,
      observedAt,
      ageMinutes: null,
      freshForMinutes: policy.freshForMinutes,
      expireAfterMinutes: policy.expireAfterMinutes,
      staleAt: null,
      expiresAt: null
    }
  }
  if (fetchedAtMs === null) {
    return {
      status: 'expired',
      reasonCode: 'cache-invalid-timestamp',
      fetchedAt: input.observation.fetchedAt,
      observedAt,
      ageMinutes: null,
      freshForMinutes: policy.freshForMinutes,
      expireAfterMinutes: policy.expireAfterMinutes,
      staleAt: null,
      expiresAt: null
    }
  }

  const ageMinutes = Math.max(0, Math.floor((input.observedAt.getTime() - fetchedAtMs) / 60_000))
  const staleAt = new Date(fetchedAtMs + policy.freshForMinutes * 60_000)
  const expiresAt = new Date(fetchedAtMs + policy.expireAfterMinutes * 60_000)
  const status: AirportIntelligenceCacheStatus = ageMinutes <= policy.freshForMinutes
    ? 'fresh'
    : ageMinutes <= policy.expireAfterMinutes
      ? 'stale'
      : 'expired'
  const reasonCode: AirportIntelligenceCacheReasonCode = status === 'fresh'
    ? 'cache-fresh'
    : status === 'stale'
      ? 'cache-stale-age-exceeded'
      : 'cache-expired-age-exceeded'

  return {
    status,
    reasonCode,
    fetchedAt: isoFromDate(new Date(fetchedAtMs)),
    observedAt,
    ageMinutes,
    freshForMinutes: policy.freshForMinutes,
    expireAfterMinutes: policy.expireAfterMinutes,
    staleAt: isoFromDate(staleAt),
    expiresAt: isoFromDate(expiresAt)
  }
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

export function redactAirportIntelligenceDiagnostics(
  diagnostics: AirportIntelligenceProviderDiagnostic[],
  env: Record<string, string | undefined> = process.env
): AirportIntelligenceProviderDiagnostic[] {
  return diagnostics.map((item) => sanitizedDiagnostic(item, env))
}

export function getAirportIntelligenceProviderHealthSummaries(input: {
  env?: Record<string, string | undefined>
  now?: Date
  cacheObservations?: AirportIntelligenceCacheObservation[]
  diagnostics?: AirportIntelligenceProviderDiagnostic[]
} = {}): AirportIntelligenceProviderHealthSummary[] {
  const env = input.env || process.env
  const observedAt = input.now || new Date()
  const observations = new Map((input.cacheObservations || []).map((entry) => [entry.provider, entry]))
  const diagnosticsByProvider = new Map<AirportIntelligenceProviderName, AirportIntelligenceProviderDiagnostic[]>()
  for (const diagnostic of redactAirportIntelligenceDiagnostics(input.diagnostics || [], env)) {
    const existing = diagnosticsByProvider.get(diagnostic.provider) || []
    existing.push(diagnostic)
    diagnosticsByProvider.set(diagnostic.provider, existing)
  }

  return getAirportIntelligenceProviderReadiness(env).map((source) => {
    const health = providerHealth(source.status)
    const reason = unavailableReason(source.status)
    const cache = cacheAgeMetadata({
      status: source.status,
      observation: observations.get(source.provider),
      observedAt,
      env
    })
    const derivedDiagnostics: AirportIntelligenceProviderDiagnostic[] = [
      sanitizedDiagnostic({
        provider: source.provider,
        severity: health === 'ready' ? 'info' : 'warning',
        code: `provider_${health}`,
        message: providerSummary(source.provider, source.status)
      }, env),
      sanitizedDiagnostic({
        provider: source.provider,
        severity: cache.status === 'fresh' || cache.status === 'disabled' ? 'info' : 'warning',
        code: cache.reasonCode,
        message: cache.status === 'fresh'
          ? `${source.provider} cache is fresh (${cache.ageMinutes} minutes old).`
          : cache.status === 'disabled'
            ? `${source.provider} cache is disabled because the airport intelligence feature flag is disabled.`
            : `${source.provider} cache status is ${cache.status}; reason=${cache.reasonCode}.`
      }, env)
    ]

    return {
      provider: source.provider,
      status: source.status,
      health,
      summary: providerSummary(source.provider, source.status),
      unavailableReason: reason,
      disabledSummary: source.status === 'feature-disabled' ? `${source.provider} is disabled by ${airportIntelligenceProviderFeatureFlag}.` : null,
      liveCallsEnabled: false,
      advisoryOnly: true,
      cache,
      diagnostics: [...derivedDiagnostics, ...(diagnosticsByProvider.get(source.provider) || [])]
    }
  })
}

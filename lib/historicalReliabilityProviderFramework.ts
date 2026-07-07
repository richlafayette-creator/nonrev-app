export type HistoricalReliabilityProviderStatus = 'feature-disabled' | 'configured' | 'credential-missing' | 'not-implemented' | 'provider-unavailable'
export type HistoricalReliabilityCacheFreshnessStatus = 'fresh' | 'stale' | 'expired' | 'missing' | 'disabled'
export type HistoricalReliabilityDiagnosticSeverity = 'info' | 'warning' | 'error'

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

export type HistoricalReliabilityProviderDiagnostic = {
  code: string
  severity: HistoricalReliabilityDiagnosticSeverity
  message: string
  providerName?: string
}

export type HistoricalReliabilityCachePolicy = {
  freshForMinutes: number
  diagnosticStaleForMinutes: number
}

export type HistoricalReliabilityCacheEntry = {
  key: string
  providerName: string
  advisoryOnly: true
  result: HistoricalReliabilityProviderResult
  fetchedAt: string
  expiresAt: string
  dataFreshness: {
    fetchedAt: string
    expiresAt: string
    staleAfter: string
  }
  diagnostics: HistoricalReliabilityProviderDiagnostic[]
}

export interface HistoricalReliabilityCacheStore {
  get(key: string): HistoricalReliabilityCacheEntry | undefined
  set(entry: HistoricalReliabilityCacheEntry): void
  delete(key: string): void
  clear(): void
}

export type HistoricalReliabilityCacheReadResult = {
  status: HistoricalReliabilityCacheFreshnessStatus
  key: string
  featureFlag: 'enabled' | 'disabled'
  entry: HistoricalReliabilityCacheEntry | null
  result: HistoricalReliabilityProviderResult | null
  advisoryOnly: true
  appliesToScoring: false
  unknownNeutral: true
  diagnostics: HistoricalReliabilityProviderDiagnostic[]
}

export type HistoricalReliabilityProviderAdapterFetchResult = {
  status: 'disabled' | 'cache-hit' | 'fetched' | 'provider-unavailable' | 'timeout' | 'failed'
  key: string
  cache: HistoricalReliabilityCacheReadResult
  result: HistoricalReliabilityProviderResult | null
  providerName: string
  providerCallsAttempted: boolean
  cacheUpdated: boolean
  advisoryOnly: true
  appliesToScoring: false
  unknownNeutral: true
  dataFreshness: HistoricalReliabilityCacheEntry['dataFreshness'] | null
  diagnostics: HistoricalReliabilityProviderDiagnostic[]
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
export const historicalReliabilityProviderAdapterFeatureFlag = 'NONREV_HISTORICAL_RELIABILITY_PROVIDER_ADAPTER_ENABLED' as const

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

function adapterEnabled(env: Record<string, string | undefined>) {
  const value = String(env[historicalReliabilityProviderAdapterFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function normalizeCode(value: string | undefined) {
  return String(value || '').trim().toUpperCase()
}

function normalizeDate(value: string | undefined) {
  return String(value || '').trim()
}

function isoFromDate(value: Date) {
  return value.toISOString()
}

function validInstant(value: string) {
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

function diagnostic(input: HistoricalReliabilityProviderDiagnostic): HistoricalReliabilityProviderDiagnostic {
  return input
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

export class HistoricalReliabilityProviderAdapter implements HistoricalReliabilityProvider {
  readonly providerName = 'HistoricalReliabilityProviderAdapter'
  readonly featureFlagEnvVar = historicalReliabilityProviderFrameworkFeatureFlag
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const
  readonly status: HistoricalReliabilityProviderStatus
  private readonly scenario: 'success' | 'unavailable' | 'unknown'
  private readonly now: Date

  constructor(input: { env?: Record<string, string | undefined>; now?: Date } = {}) {
    const env = input.env || process.env
    this.status = featureEnabled(env) && adapterEnabled(env) ? 'configured' : 'feature-disabled'
    const scenario = String(env.NONREV_HISTORICAL_RELIABILITY_PROVIDER_SCENARIO || 'success').trim().toLowerCase()
    this.scenario = scenario === 'unavailable' || scenario === 'unknown' ? scenario : 'success'
    this.now = input.now || new Date()
  }

  async getReliability(query: HistoricalReliabilityQuery): Promise<HistoricalReliabilityProviderResult> {
    if (this.status !== 'configured' || this.scenario === 'unavailable') {
      return { ...nullHistoricalReliabilityResult, providerName: this.providerName }
    }

    if (this.scenario === 'unknown') {
      return {
        ...nullHistoricalReliabilityResult,
        lastUpdated: isoFromDate(this.now),
        providerName: this.providerName
      }
    }

    const routeKey = `${normalizeCode(query.origin)}>${normalizeCode(query.destination)}:${normalizeCode(query.carrier) || 'ANY'}`
    const routeAdjustment = [...routeKey].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 9
    return {
      onTimePercentage: 74 + routeAdjustment,
      cancellationPercentage: Number((1.5 + routeAdjustment / 10).toFixed(2)),
      averageDepartureDelay: 10 + routeAdjustment,
      averageArrivalDelay: 8 + routeAdjustment,
      confidenceScore: 58 + routeAdjustment,
      lastUpdated: isoFromDate(this.now),
      providerName: this.providerName
    }
  }
}

const defaultCacheFreshForMinutes = 60 * 24
const defaultCacheDiagnosticStaleForMinutes = 60 * 24 * 14

export function getHistoricalReliabilityCachePolicy(env: Record<string, string | undefined> = process.env): HistoricalReliabilityCachePolicy {
  const freshForMinutes = minutesFromEnv(env.NONREV_HISTORICAL_RELIABILITY_CACHE_FRESH_MINUTES, defaultCacheFreshForMinutes, 30, 60 * 24 * 30)
  const diagnosticStaleForMinutes = Math.max(
    freshForMinutes,
    minutesFromEnv(env.NONREV_HISTORICAL_RELIABILITY_CACHE_DIAGNOSTIC_STALE_MINUTES, defaultCacheDiagnosticStaleForMinutes, 60, 60 * 24 * 180)
  )
  return { freshForMinutes, diagnosticStaleForMinutes }
}

export function historicalReliabilityCacheKeyForQuery(query: HistoricalReliabilityQuery) {
  const parts = [
    normalizeCode(query.origin),
    normalizeCode(query.destination),
    normalizeCode(query.carrier) || 'ANY',
    normalizeCode(query.flightNumber) || 'ANY',
    normalizeDate(query.departureDate) || 'ANY'
  ]
  return parts[0] && parts[1] ? `historical-reliability:${parts.join(':')}` : 'historical-reliability:unknown'
}

export class InMemoryHistoricalReliabilityCacheStore implements HistoricalReliabilityCacheStore {
  private entries = new Map<string, HistoricalReliabilityCacheEntry>()

  get(key: string) {
    return this.entries.get(key)
  }

  set(entry: HistoricalReliabilityCacheEntry) {
    this.entries.set(entry.key, entry)
  }

  delete(key: string) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }
}

function freshnessStatus(entry: HistoricalReliabilityCacheEntry | undefined, now: Date, policy: HistoricalReliabilityCachePolicy): Exclude<HistoricalReliabilityCacheFreshnessStatus, 'disabled'> {
  if (!entry) return 'missing'
  const fetchedAt = validInstant(entry.fetchedAt)
  if (fetchedAt === null) return 'expired'
  const ageMinutes = Math.max(0, (now.getTime() - fetchedAt) / 60_000)
  if (ageMinutes <= policy.freshForMinutes) return 'fresh'
  if (ageMinutes <= policy.diagnosticStaleForMinutes) return 'stale'
  return 'expired'
}

export function createHistoricalReliabilityCacheEntry(input: {
  query: HistoricalReliabilityQuery
  result: HistoricalReliabilityProviderResult
  key?: string
  fetchedAt?: Date
  policy?: HistoricalReliabilityCachePolicy
  diagnostics?: HistoricalReliabilityProviderDiagnostic[]
}): HistoricalReliabilityCacheEntry {
  const fetchedAt = input.fetchedAt || new Date()
  const policy = input.policy || getHistoricalReliabilityCachePolicy({})
  const expiresAt = new Date(fetchedAt.getTime() + policy.freshForMinutes * 60_000)
  const staleAfter = new Date(fetchedAt.getTime() + policy.diagnosticStaleForMinutes * 60_000)
  return {
    key: input.key || historicalReliabilityCacheKeyForQuery(input.query),
    providerName: input.result.providerName,
    advisoryOnly: true,
    result: { ...input.result },
    fetchedAt: isoFromDate(fetchedAt),
    expiresAt: isoFromDate(expiresAt),
    dataFreshness: {
      fetchedAt: isoFromDate(fetchedAt),
      expiresAt: isoFromDate(expiresAt),
      staleAfter: isoFromDate(staleAfter)
    },
    diagnostics: input.diagnostics || []
  }
}

export function readHistoricalReliabilityCache(input: {
  store: HistoricalReliabilityCacheStore
  query: HistoricalReliabilityQuery
  now?: Date
  env?: Record<string, string | undefined>
  policy?: HistoricalReliabilityCachePolicy
}): HistoricalReliabilityCacheReadResult {
  const env = input.env || process.env
  const key = historicalReliabilityCacheKeyForQuery(input.query)
  const featureFlag = featureEnabled(env) ? 'enabled' : 'disabled'
  const now = input.now || new Date()
  const policy = input.policy || getHistoricalReliabilityCachePolicy(env)

  if (featureFlag === 'disabled') {
    return {
      status: 'disabled',
      key,
      featureFlag,
      entry: null,
      result: null,
      advisoryOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      diagnostics: [diagnostic({ code: 'feature_disabled', severity: 'info', message: 'Historical reliability provider feature flag is disabled; cached data is ignored safely.' })]
    }
  }

  const entry = input.store.get(key)
  const status = freshnessStatus(entry, now, policy)
  const result = status === 'fresh' ? (entry?.result || null) : null
  const message = status === 'fresh'
    ? 'Fresh cached historical reliability is available for advisory use only.'
    : status === 'stale'
      ? 'Cached historical reliability is stale; it remains diagnostic-only and neutral.'
      : status === 'expired'
        ? 'Cached historical reliability is expired; it is ignored and remains neutral.'
        : 'No cached historical reliability is available; unknown remains neutral.'

  return {
    status,
    key,
    featureFlag,
    entry: entry || null,
    result,
    advisoryOnly: true,
    appliesToScoring: false,
    unknownNeutral: true,
    diagnostics: [diagnostic({ code: `cache_${status}`, severity: status === 'fresh' ? 'info' : 'warning', message }), ...(entry?.diagnostics || [])]
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
  const futureConfigs: HistoricalReliabilityProviderConfig[] = futureProviderDefinitions.map((definition) => ({
    providerName: definition.providerName,
    credentialEnvVar: definition.credentialEnvVar,
    enabled: featureEnabled(env),
    status: futureProviderStatus({ env, credentialEnvVar: definition.credentialEnvVar, implemented: false }),
    liveCallsEnabled: false,
    advisoryOnly: true,
    notes: [...definition.notes]
  }))
  return [
    ...futureConfigs,
    {
      providerName: 'HistoricalReliabilityProviderAdapter',
      enabled: featureEnabled(env) && adapterEnabled(env),
      status: featureEnabled(env) && adapterEnabled(env) ? 'configured' : 'feature-disabled',
      liveCallsEnabled: false,
      advisoryOnly: true,
      notes: [
        'Single demo/local historical reliability provider adapter for Integration Sprint 1; no live external API calls are made.',
        'Adapter output is advisory historical reliability only and must not alter itinerary scoring or planner behavior.'
      ]
    }
  ]
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
  const env = input.env || process.env
  if (!featureEnabled(env)) return new NullHistoricalReliabilityProvider()
  if (input.providerName === 'HistoricalReliabilityProviderAdapter' && adapterEnabled(env)) return new HistoricalReliabilityProviderAdapter({ env })
  return (input.registry || createHistoricalReliabilityProviderRegistry()).get(input.providerName)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('historical-reliability-adapter-timeout')), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function resultHasMetrics(result: HistoricalReliabilityProviderResult) {
  return [result.onTimePercentage, result.cancellationPercentage, result.averageDepartureDelay, result.averageArrivalDelay]
    .some((value) => typeof value === 'number' && Number.isFinite(value))
}

export async function getHistoricalReliabilityWithCache(input: {
  query: HistoricalReliabilityQuery
  store: HistoricalReliabilityCacheStore
  provider?: HistoricalReliabilityProvider
  providerName?: string
  env?: Record<string, string | undefined>
  now?: Date
  policy?: HistoricalReliabilityCachePolicy
  timeoutMs?: number
}): Promise<HistoricalReliabilityProviderAdapterFetchResult> {
  const env = input.env || process.env
  const now = input.now || new Date()
  const policy = input.policy || getHistoricalReliabilityCachePolicy(env)
  const cache = readHistoricalReliabilityCache({ store: input.store, query: input.query, env, now, policy })

  if (cache.featureFlag === 'disabled') {
    return {
      status: 'disabled',
      key: cache.key,
      cache,
      result: null,
      providerName: 'NullHistoricalReliabilityProvider',
      providerCallsAttempted: false,
      cacheUpdated: false,
      advisoryOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      dataFreshness: null,
      diagnostics: cache.diagnostics
    }
  }

  if (cache.status === 'fresh' && cache.result) {
    return {
      status: 'cache-hit',
      key: cache.key,
      cache,
      result: cache.result,
      providerName: cache.entry?.providerName || cache.result.providerName,
      providerCallsAttempted: false,
      cacheUpdated: false,
      advisoryOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      dataFreshness: cache.entry?.dataFreshness || null,
      diagnostics: [
        diagnostic({ code: 'cache_hit', severity: 'info', message: 'Historical reliability cache hit; provider request skipped to respect freshness.' }),
        ...cache.diagnostics
      ]
    }
  }

  const provider = input.provider || createHistoricalReliabilityProvider({ providerName: input.providerName, env })
  if (provider.providerName === 'NullHistoricalReliabilityProvider' || provider.status !== 'configured') {
    return {
      status: 'provider-unavailable',
      key: cache.key,
      cache,
      result: null,
      providerName: provider.providerName,
      providerCallsAttempted: false,
      cacheUpdated: false,
      advisoryOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      dataFreshness: null,
      diagnostics: [
        diagnostic({ code: 'provider_unavailable', severity: 'warning', providerName: provider.providerName, message: `Historical reliability provider unavailable (${provider.status}); unknown remains neutral.` }),
        ...cache.diagnostics
      ]
    }
  }

  try {
    const result = await withTimeout(provider.getReliability(input.query), Math.max(1, input.timeoutMs || 1500))
    if (!resultHasMetrics(result)) {
      return {
        status: 'provider-unavailable',
        key: cache.key,
        cache,
        result: { ...result },
        providerName: provider.providerName,
        providerCallsAttempted: true,
        cacheUpdated: false,
        advisoryOnly: true,
        appliesToScoring: false,
        unknownNeutral: true,
        dataFreshness: null,
        diagnostics: [diagnostic({ code: 'provider_unknown', severity: 'warning', providerName: provider.providerName, message: 'Historical reliability provider returned no usable metrics; unknown remains neutral and cache was left unchanged.' })]
      }
    }

    const entry = createHistoricalReliabilityCacheEntry({
      query: input.query,
      result,
      fetchedAt: now,
      policy,
      diagnostics: [diagnostic({ code: 'provider_success', severity: 'info', providerName: provider.providerName, message: 'Historical reliability provider adapter returned advisory metrics.' })]
    })
    input.store.set(entry)

    return {
      status: 'fetched',
      key: cache.key,
      cache,
      result: entry.result,
      providerName: provider.providerName,
      providerCallsAttempted: true,
      cacheUpdated: true,
      advisoryOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      dataFreshness: entry.dataFreshness,
      diagnostics: entry.diagnostics
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === 'historical-reliability-adapter-timeout'
    return {
      status: isTimeout ? 'timeout' : 'failed',
      key: cache.key,
      cache,
      result: null,
      providerName: provider.providerName,
      providerCallsAttempted: true,
      cacheUpdated: false,
      advisoryOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      dataFreshness: null,
      diagnostics: [diagnostic({
        code: isTimeout ? 'provider_timeout' : 'provider_failed',
        severity: 'warning',
        providerName: provider.providerName,
        message: isTimeout
          ? 'Historical reliability provider timed out; raw provider details were hidden and unknown remains neutral.'
          : 'Historical reliability provider failed; raw provider details were hidden and unknown remains neutral.'
      })]
    }
  }
}

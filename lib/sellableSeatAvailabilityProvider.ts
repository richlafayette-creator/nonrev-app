export type SellableSeatAvailabilityStatus = 'available' | 'limited' | 'unavailable' | 'unknown'
export type CommercialAvailabilitySafeLabel = 'favorable' | 'limited' | 'unavailable' | 'unknown'
export type SellableSeatPriceTrend = 'lower' | 'stable' | 'higher' | 'unknown'
export type SellableSeatAvailabilityConfidence = 'high' | 'medium' | 'low' | 'unknown'
export type SellableSeatAvailabilityProviderStatus = 'feature-disabled' | 'credential-missing' | 'not-implemented' | 'demo-ready' | 'provider-unavailable'
export type CommercialAvailabilityCacheFreshnessStatus = 'fresh' | 'stale' | 'expired' | 'missing' | 'disabled'

export type CabinSellableAvailability = {
  cabin: 'economy' | 'premium-economy' | 'business' | 'first' | 'unknown'
  sellableStatus: SellableSeatAvailabilityStatus
  availableInventory: number | null
  confidence: SellableSeatAvailabilityConfidence
  lastUpdated: string | null
}

export type FareClassSellableAvailability = {
  fareClass: string
  sellableStatus: SellableSeatAvailabilityStatus
  observedPrice: number | null
  currency: string | null
  confidence: SellableSeatAvailabilityConfidence
  lastUpdated: string | null
}

export type SellableSeatAvailabilityQuery = {
  carrier: string
  flightNumber: string
  origin: string
  destination: string
  departureDate: string
  cabin?: CabinSellableAvailability['cabin']
  requestedAt?: string
}

export type SellableSeatAvailabilityProviderResult = {
  carrier: string
  flightNumber: string
  origin: string
  destination: string
  departureDate: string
  cabinAvailability: CabinSellableAvailability[]
  fareClassAvailability: FareClassSellableAvailability[]
  observedPrice: number | null
  priceTrend: SellableSeatPriceTrend
  sellableStatus: SellableSeatAvailabilityStatus
  safeLabel: CommercialAvailabilitySafeLabel
  confidence: SellableSeatAvailabilityConfidence
  providerName: string
  lastUpdated: string | null
  limitations: string[]
}

export type CommercialAvailabilityCachePolicy = {
  freshForMinutes: number
  diagnosticStaleForMinutes: number
}

export type CommercialAvailabilityCacheEntry = {
  key: string
  providerName: string
  advisoryOnly: true
  proxyOnly: true
  result: SellableSeatAvailabilityProviderResult
  fetchedAt: string
  expiresAt: string
  diagnostics: string[]
  limitations: string[]
}

export type CommercialAvailabilityCacheReadResult = {
  status: CommercialAvailabilityCacheFreshnessStatus
  key: string
  featureFlag: 'enabled' | 'disabled'
  entry: CommercialAvailabilityCacheEntry | null
  result: SellableSeatAvailabilityProviderResult | null
  safeLabel: CommercialAvailabilitySafeLabel
  advisoryOnly: true
  proxyOnly: true
  appliesToScoring: false
  unknownNeutral: true
  diagnostics: string[]
  limitations: string[]
}

export type CommercialAvailabilityFetchResult = {
  status: 'disabled' | 'cache-hit' | 'fetched' | 'provider-unavailable' | 'failed'
  key: string
  cache: CommercialAvailabilityCacheReadResult
  result: SellableSeatAvailabilityProviderResult | null
  safeLabel: CommercialAvailabilitySafeLabel
  providerName: string
  providerCallsAttempted: boolean
  cacheUpdated: boolean
  advisoryOnly: true
  proxyOnly: true
  appliesToScoring: false
  unknownNeutral: true
  diagnostics: string[]
  limitations: string[]
}

export interface CommercialAvailabilityCacheStore {
  get(key: string): CommercialAvailabilityCacheEntry | undefined
  set(entry: CommercialAvailabilityCacheEntry): void
  delete(key: string): void
  clear(): void
}

export interface SellableSeatAvailabilityProvider {
  readonly providerName: string
  readonly featureFlagEnvVar: typeof sellableSeatAvailabilityProviderFeatureFlag
  readonly status: SellableSeatAvailabilityProviderStatus
  readonly liveCallsEnabled: false
  readonly advisoryOnly: true
  readonly scrapingAllowed: false
  getAvailability(query: SellableSeatAvailabilityQuery): Promise<SellableSeatAvailabilityProviderResult>
}

export type SellableSeatAvailabilityProviderConfig = {
  providerName: string
  credentialEnvVar?: string
  enabled: boolean
  status: SellableSeatAvailabilityProviderStatus
  liveCallsEnabled: false
  advisoryOnly: true
  scrapingAllowed: false
  notes: string[]
}

export const sellableSeatAvailabilityProviderFeatureFlag = 'NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED' as const
export const mockCommercialAvailabilityProviderFeatureFlag = 'NONREV_COMMERCIAL_AVAILABILITY_MOCK_PROVIDER_ENABLED' as const

export const sellableSeatAvailabilityLimitations = [
  'Commercial sellable seat availability is a proxy signal only.',
  'This framework must never claim confirmed standby availability, non-rev clearance, or guaranteed boarding.',
  'No airline website scraping is permitted by this provider abstraction.',
  'No live sellable seat availability provider is implemented yet.'
]

export const nullSellableSeatAvailabilityProviderResult: Omit<
  SellableSeatAvailabilityProviderResult,
  'carrier' | 'flightNumber' | 'origin' | 'destination' | 'departureDate'
> = {
  cabinAvailability: [],
  fareClassAvailability: [],
  observedPrice: null,
  priceTrend: 'unknown',
  sellableStatus: 'unknown',
  safeLabel: 'unknown',
  confidence: 'unknown',
  providerName: 'NullSellableSeatAvailabilityProvider',
  lastUpdated: null,
  limitations: sellableSeatAvailabilityLimitations
}

const commercialAvailabilityCacheLimitations = [
  'Cached commercial availability is a proxy signal only and must not be treated as confirmed standby availability.',
  'Missing, stale, expired, disabled, unavailable, or unknown commercial availability remains neutral for itinerary scoring and ranking.',
  'Commercial availability cache data never confirms non-rev clearance, standby list position, airline load factors, or guaranteed boarding.'
]

const defaultCacheFreshForMinutes = 20
const defaultCacheDiagnosticStaleForMinutes = 90

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

const futureProviderDefinitions: Array<{
  providerName: string
  credentialEnvVar?: string
  notes: string[]
}> = [
  {
    providerName: 'DuffelSellableSeatAvailabilityProvider',
    credentialEnvVar: 'DUFFEL_API_KEY',
    notes: [
      'Future Duffel commercial availability adapter placeholder only; no Duffel API call is implemented.',
      'Adapter output must remain proxy-only and must not claim standby seats, non-rev clearance, or guaranteed boarding.'
    ]
  },
  {
    providerName: 'AmadeusGdsSellableSeatAvailabilityProvider',
    credentialEnvVar: 'AMADEUS_API_KEY',
    notes: [
      'Future Amadeus/GDS commercial shopping placeholder only; no Amadeus or GDS request path is implemented.',
      'Requires licensing, caching, timeout, freshness, redaction, and proxy-only wording review before implementation.'
    ]
  },
  {
    providerName: 'SabreSellableSeatAvailabilityProvider',
    credentialEnvVar: 'SABRE_API_KEY',
    notes: [
      'Future Sabre commercial availability placeholder only; no Sabre API call is implemented.',
      'Requires endpoint scope, rate-limit, cache, and terms review before any server-side request path is added.'
    ]
  },
  {
    providerName: 'ManualCommercialAvailabilityProvider',
    notes: [
      'Future moderated manual/community commercial availability placeholder only; no user-entered availability source is implemented.',
      'Requires freshness, moderation, trust, audit, and anti-confirmation wording rules before accepting proxy signals.'
    ]
  }
]

function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

function normalizeFlightNumber(value: string) {
  return value.trim().toUpperCase()
}

function normalizeDate(value: string) {
  return String(value || '').trim()
}

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[sellableSeatAvailabilityProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function mockProviderEnabled(env: Record<string, string | undefined>) {
  const value = String(env[mockCommercialAvailabilityProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function isoFromDate(value: Date) {
  return value.toISOString()
}

function validInstant(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function commercialAvailabilitySafeLabel(status: SellableSeatAvailabilityStatus): CommercialAvailabilitySafeLabel {
  return ({
    available: 'favorable',
    limited: 'limited',
    unavailable: 'unavailable',
    unknown: 'unknown'
  } satisfies Record<SellableSeatAvailabilityStatus, CommercialAvailabilitySafeLabel>)[status]
}

export function getCommercialAvailabilityCachePolicy(env: Record<string, string | undefined> = process.env): CommercialAvailabilityCachePolicy {
  const freshForMinutes = minutesFromEnv(env.NONREV_COMMERCIAL_AVAILABILITY_CACHE_FRESH_MINUTES, defaultCacheFreshForMinutes, 5, 180)
  const diagnosticStaleForMinutes = Math.max(
    freshForMinutes,
    minutesFromEnv(env.NONREV_COMMERCIAL_AVAILABILITY_CACHE_DIAGNOSTIC_STALE_MINUTES, defaultCacheDiagnosticStaleForMinutes, 30, 720)
  )
  return { freshForMinutes, diagnosticStaleForMinutes }
}

export function commercialAvailabilityCacheKeyForQuery(query: SellableSeatAvailabilityQuery) {
  const cabin = query.cabin ? normalizeCode(query.cabin) : 'ANY'
  const parts = [
    normalizeCode(query.carrier),
    normalizeFlightNumber(query.flightNumber),
    normalizeCode(query.origin),
    normalizeCode(query.destination),
    normalizeDate(query.departureDate),
    cabin
  ].filter(Boolean)
  return parts.length >= 5 ? `commercial-availability:${parts.join(':')}` : 'commercial-availability:unknown'
}

function freshnessStatus(entry: CommercialAvailabilityCacheEntry | undefined, now: Date, policy: CommercialAvailabilityCachePolicy): Exclude<CommercialAvailabilityCacheFreshnessStatus, 'disabled'> {
  if (!entry) return 'missing'
  const fetchedAt = validInstant(entry.fetchedAt)
  if (fetchedAt === null) return 'expired'
  const ageMinutes = Math.max(0, (now.getTime() - fetchedAt) / 60_000)
  if (ageMinutes <= policy.freshForMinutes) return 'fresh'
  if (ageMinutes <= policy.diagnosticStaleForMinutes) return 'stale'
  return 'expired'
}

export class InMemoryCommercialAvailabilityCacheStore implements CommercialAvailabilityCacheStore {
  private entries = new Map<string, CommercialAvailabilityCacheEntry>()

  get(key: string) {
    return this.entries.get(key)
  }

  set(entry: CommercialAvailabilityCacheEntry) {
    this.entries.set(entry.key, entry)
  }

  delete(key: string) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }
}

export function createCommercialAvailabilityCacheEntry(input: {
  query: SellableSeatAvailabilityQuery
  result: SellableSeatAvailabilityProviderResult
  key?: string
  fetchedAt?: Date
  policy?: CommercialAvailabilityCachePolicy
  diagnostics?: string[]
  limitations?: string[]
}): CommercialAvailabilityCacheEntry {
  const fetchedAt = input.fetchedAt || new Date()
  const policy = input.policy || getCommercialAvailabilityCachePolicy({})
  const expiresAt = new Date(fetchedAt.getTime() + policy.freshForMinutes * 60_000)
  return {
    key: input.key || commercialAvailabilityCacheKeyForQuery(input.query),
    providerName: input.result.providerName,
    advisoryOnly: true,
    proxyOnly: true,
    result: { ...input.result, safeLabel: input.result.safeLabel || commercialAvailabilitySafeLabel(input.result.sellableStatus) },
    fetchedAt: isoFromDate(fetchedAt),
    expiresAt: isoFromDate(expiresAt),
    diagnostics: input.diagnostics || [],
    limitations: [...commercialAvailabilityCacheLimitations, ...(input.limitations || input.result.limitations || [])]
  }
}

export function readCommercialAvailabilityCache(input: {
  store: CommercialAvailabilityCacheStore
  query: SellableSeatAvailabilityQuery
  now?: Date
  env?: Record<string, string | undefined>
  policy?: CommercialAvailabilityCachePolicy
}): CommercialAvailabilityCacheReadResult {
  const env = input.env || process.env
  const key = commercialAvailabilityCacheKeyForQuery(input.query)
  const featureFlag = featureEnabled(env) ? 'enabled' : 'disabled'
  const now = input.now || new Date()
  const policy = input.policy || getCommercialAvailabilityCachePolicy(env)

  if (featureFlag === 'disabled') {
    return {
      status: 'disabled',
      key,
      featureFlag,
      entry: null,
      result: null,
      safeLabel: 'unknown',
      advisoryOnly: true,
      proxyOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      diagnostics: ['Commercial availability provider feature flag is disabled; cached proxy data is ignored safely.'],
      limitations: commercialAvailabilityCacheLimitations
    }
  }

  const entry = input.store.get(key)
  const status = freshnessStatus(entry, now, policy)
  const result = status === 'fresh' ? (entry?.result || null) : null
  const diagnostic = status === 'fresh'
    ? 'Fresh cached commercial availability proxy data is available for future advisory use only.'
    : status === 'stale'
      ? 'Cached commercial availability is stale; it remains diagnostic-only and neutral for scoring.'
      : status === 'expired'
        ? 'Cached commercial availability is expired; it is ignored and remains neutral for scoring.'
        : 'No cached commercial availability is available; unknown remains neutral.'

  return {
    status,
    key,
    featureFlag,
    entry: entry || null,
    result,
    safeLabel: result?.safeLabel || 'unknown',
    advisoryOnly: true,
    proxyOnly: true,
    appliesToScoring: false,
    unknownNeutral: true,
    diagnostics: [diagnostic, ...(entry?.diagnostics || [])],
    limitations: [...commercialAvailabilityCacheLimitations, ...(entry?.limitations || [])]
  }
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function providerConfigStatus(definition: { credentialEnvVar?: string }, env: Record<string, string | undefined>): SellableSeatAvailabilityProviderStatus {
  if (!featureEnabled(env)) return 'feature-disabled'
  if (definition.credentialEnvVar && !hasCredential(env, definition.credentialEnvVar)) return 'credential-missing'
  return 'not-implemented'
}

export class NullSellableSeatAvailabilityProvider implements SellableSeatAvailabilityProvider {
  readonly providerName = 'NullSellableSeatAvailabilityProvider'
  readonly featureFlagEnvVar = sellableSeatAvailabilityProviderFeatureFlag
  readonly status: SellableSeatAvailabilityProviderStatus = 'feature-disabled'
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const
  readonly scrapingAllowed = false as const

  async getAvailability(query: SellableSeatAvailabilityQuery): Promise<SellableSeatAvailabilityProviderResult> {
    return {
      carrier: normalizeCode(query.carrier),
      flightNumber: normalizeFlightNumber(query.flightNumber),
      origin: normalizeCode(query.origin),
      destination: normalizeCode(query.destination),
      departureDate: query.departureDate,
      ...nullSellableSeatAvailabilityProviderResult,
      cabinAvailability: [...nullSellableSeatAvailabilityProviderResult.cabinAvailability],
      fareClassAvailability: [...nullSellableSeatAvailabilityProviderResult.fareClassAvailability],
      limitations: [...nullSellableSeatAvailabilityProviderResult.limitations]
    }
  }
}

export class MockCommercialAvailabilityProvider implements SellableSeatAvailabilityProvider {
  readonly providerName = 'MockCommercialAvailabilityProvider'
  readonly featureFlagEnvVar = sellableSeatAvailabilityProviderFeatureFlag
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const
  readonly scrapingAllowed = false as const
  readonly status: SellableSeatAvailabilityProviderStatus
  private readonly scenario: CommercialAvailabilitySafeLabel | 'provider-unavailable'
  private readonly now: Date

  constructor(input: { env?: Record<string, string | undefined>; now?: Date } = {}) {
    const env = input.env || process.env
    this.status = featureEnabled(env) && mockProviderEnabled(env) ? 'demo-ready' : 'feature-disabled'
    const scenario = String(env.NONREV_COMMERCIAL_AVAILABILITY_MOCK_SCENARIO || 'unknown').trim().toLowerCase()
    this.scenario = scenario === 'favorable' || scenario === 'limited' || scenario === 'unavailable' || scenario === 'provider-unavailable'
      ? scenario
      : 'unknown'
    this.now = input.now || new Date()
  }

  async getAvailability(query: SellableSeatAvailabilityQuery): Promise<SellableSeatAvailabilityProviderResult> {
    const normalized = {
      carrier: normalizeCode(query.carrier),
      flightNumber: normalizeFlightNumber(query.flightNumber),
      origin: normalizeCode(query.origin),
      destination: normalizeCode(query.destination),
      departureDate: normalizeDate(query.departureDate)
    }
    const lastUpdated = isoFromDate(this.now)

    if (this.status !== 'demo-ready' || this.scenario === 'provider-unavailable') {
      return {
        ...normalized,
        cabinAvailability: [],
        fareClassAvailability: [],
        observedPrice: null,
        priceTrend: 'unknown',
        sellableStatus: 'unknown',
        safeLabel: 'unknown',
        confidence: 'unknown',
        providerName: this.providerName,
        lastUpdated: null,
        limitations: [
          ...sellableSeatAvailabilityLimitations,
          'Mock commercial availability provider is unavailable; unknown remains neutral.'
        ]
      }
    }

    const sellableStatus = ({
      favorable: 'available',
      limited: 'limited',
      unavailable: 'unavailable',
      unknown: 'unknown'
    } satisfies Record<CommercialAvailabilitySafeLabel, SellableSeatAvailabilityStatus>)[this.scenario]
    const safeLabel = commercialAvailabilitySafeLabel(sellableStatus)
    const confidence: SellableSeatAvailabilityConfidence = safeLabel === 'unknown' ? 'unknown' : 'low'
    const inventory = safeLabel === 'favorable' ? 7 : safeLabel === 'limited' ? 2 : safeLabel === 'unavailable' ? 0 : null
    const observedPrice = safeLabel === 'favorable' ? 288 : safeLabel === 'limited' ? 642 : null

    return {
      ...normalized,
      cabinAvailability: [
        {
          cabin: query.cabin || 'economy',
          sellableStatus,
          availableInventory: inventory,
          confidence,
          lastUpdated
        }
      ],
      fareClassAvailability: safeLabel === 'unknown'
        ? []
        : [
            {
              fareClass: 'Y',
              sellableStatus,
              observedPrice,
              currency: observedPrice === null ? null : 'USD',
              confidence,
              lastUpdated
            }
          ],
      observedPrice,
      priceTrend: safeLabel === 'limited' ? 'higher' : safeLabel === 'favorable' ? 'stable' : 'unknown',
      sellableStatus,
      safeLabel,
      confidence,
      providerName: this.providerName,
      lastUpdated,
      limitations: [
        ...sellableSeatAvailabilityLimitations,
        'Mock commercial availability data is demo-only and must not be interpreted as live airline inventory.'
      ]
    }
  }
}

export class SellableSeatAvailabilityProviderRegistry {
  private readonly providers = new Map<string, SellableSeatAvailabilityProvider>()
  private readonly fallbackProvider = new NullSellableSeatAvailabilityProvider()

  register(provider: SellableSeatAvailabilityProvider) {
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

export function createSellableSeatAvailabilityProviderRegistry() {
  return new SellableSeatAvailabilityProviderRegistry()
}

export function createSellableSeatAvailabilityProvider(input: {
  providerName?: string
  env?: Record<string, string | undefined>
  registry?: SellableSeatAvailabilityProviderRegistry
} = {}): SellableSeatAvailabilityProvider {
  const env = input.env || process.env
  if (!featureEnabled(env)) return new NullSellableSeatAvailabilityProvider()
  if (input.providerName === 'MockCommercialAvailabilityProvider' && mockProviderEnabled(env)) return new MockCommercialAvailabilityProvider({ env })
  return (input.registry || createSellableSeatAvailabilityProviderRegistry()).get(input.providerName)
}

export async function getCommercialAvailabilityWithCache(input: {
  query: SellableSeatAvailabilityQuery
  store: CommercialAvailabilityCacheStore
  provider?: SellableSeatAvailabilityProvider
  providerName?: string
  env?: Record<string, string | undefined>
  now?: Date
  policy?: CommercialAvailabilityCachePolicy
}): Promise<CommercialAvailabilityFetchResult> {
  const env = input.env || process.env
  const now = input.now || new Date()
  const policy = input.policy || getCommercialAvailabilityCachePolicy(env)
  const cache = readCommercialAvailabilityCache({ store: input.store, query: input.query, env, now, policy })
  const limitations = commercialAvailabilityCacheLimitations

  if (cache.featureFlag === 'disabled') {
    return {
      status: 'disabled',
      key: cache.key,
      cache,
      result: null,
      safeLabel: 'unknown',
      providerName: 'NullSellableSeatAvailabilityProvider',
      providerCallsAttempted: false,
      cacheUpdated: false,
      advisoryOnly: true,
      proxyOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      diagnostics: cache.diagnostics,
      limitations
    }
  }

  if (cache.status === 'fresh' && cache.result) {
    return {
      status: 'cache-hit',
      key: cache.key,
      cache,
      result: cache.result,
      safeLabel: cache.safeLabel,
      providerName: cache.entry?.providerName || cache.result.providerName,
      providerCallsAttempted: false,
      cacheUpdated: false,
      advisoryOnly: true,
      proxyOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      diagnostics: ['Commercial availability cache hit; provider request skipped to respect cache freshness and rate limits.', ...cache.diagnostics],
      limitations
    }
  }

  const provider = input.provider || createSellableSeatAvailabilityProvider({ providerName: input.providerName, env })
  if (provider instanceof NullSellableSeatAvailabilityProvider || provider.status === 'feature-disabled' || provider.status === 'provider-unavailable') {
    return {
      status: 'provider-unavailable',
      key: cache.key,
      cache,
      result: null,
      safeLabel: 'unknown',
      providerName: provider.providerName,
      providerCallsAttempted: false,
      cacheUpdated: false,
      advisoryOnly: true,
      proxyOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      diagnostics: ['Commercial availability provider unavailable; unknown remains neutral and no cache entry was changed.', ...cache.diagnostics],
      limitations
    }
  }

  try {
    const result = await provider.getAvailability(input.query)
    const safeLabel = result.safeLabel || commercialAvailabilitySafeLabel(result.sellableStatus)
    if (safeLabel === 'unknown') {
      return {
        status: 'provider-unavailable',
        key: cache.key,
        cache,
        result: { ...result, safeLabel },
        safeLabel,
        providerName: provider.providerName,
        providerCallsAttempted: true,
        cacheUpdated: false,
        advisoryOnly: true,
        proxyOnly: true,
        appliesToScoring: false,
        unknownNeutral: true,
        diagnostics: ['Commercial availability provider returned unknown; unknown remains neutral and cache was left unchanged.'],
        limitations
      }
    }

    const entry = createCommercialAvailabilityCacheEntry({
      query: input.query,
      result: { ...result, safeLabel },
      fetchedAt: now,
      policy,
      diagnostics: ['Commercial availability proxy cached behind feature flags.'],
      limitations: result.limitations
    })
    input.store.set(entry)

    return {
      status: 'fetched',
      key: cache.key,
      cache,
      result: entry.result,
      safeLabel,
      providerName: provider.providerName,
      providerCallsAttempted: true,
      cacheUpdated: true,
      advisoryOnly: true,
      proxyOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      diagnostics: ['Commercial availability proxy fetched and cached for advisory future use only.'],
      limitations
    }
  } catch {
    return {
      status: 'failed',
      key: cache.key,
      cache,
      result: null,
      safeLabel: 'unknown',
      providerName: provider.providerName,
      providerCallsAttempted: true,
      cacheUpdated: false,
      advisoryOnly: true,
      proxyOnly: true,
      appliesToScoring: false,
      unknownNeutral: true,
      diagnostics: ['Commercial availability provider failed; raw provider error was hidden and unknown remains neutral.'],
      limitations
    }
  }
}

export function sellableSeatAvailabilityProviderConfiguration(env: Record<string, string | undefined> = process.env): SellableSeatAvailabilityProviderConfig[] {
  const futureConfigs: SellableSeatAvailabilityProviderConfig[] = futureProviderDefinitions.map((definition) => ({
    providerName: definition.providerName,
    credentialEnvVar: definition.credentialEnvVar,
    enabled: featureEnabled(env),
    status: providerConfigStatus(definition, env),
    liveCallsEnabled: false,
    advisoryOnly: true,
    scrapingAllowed: false,
    notes: [...definition.notes]
  }))
  return [
    ...futureConfigs,
    {
      providerName: 'MockCommercialAvailabilityProvider',
      enabled: featureEnabled(env) && mockProviderEnabled(env),
      status: featureEnabled(env) && mockProviderEnabled(env) ? 'demo-ready' as const : 'feature-disabled' as const,
      liveCallsEnabled: false as const,
      advisoryOnly: true as const,
      scrapingAllowed: false as const,
      notes: [
        'Demo-only commercial availability provider for local/test harnesses; no airline website scraping and no external API calls.',
        'Outputs safe labels only: favorable, limited, unavailable, or unknown; never confirmed standby availability.'
      ]
    }
  ]
}

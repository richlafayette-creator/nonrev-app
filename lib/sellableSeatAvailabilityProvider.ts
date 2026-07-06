export type SellableSeatAvailabilityStatus = 'available' | 'limited' | 'unavailable' | 'unknown'
export type SellableSeatPriceTrend = 'lower' | 'stable' | 'higher' | 'unknown'
export type SellableSeatAvailabilityConfidence = 'high' | 'medium' | 'low' | 'unknown'
export type SellableSeatAvailabilityProviderStatus = 'feature-disabled' | 'credential-missing' | 'not-implemented'

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
  confidence: SellableSeatAvailabilityConfidence
  providerName: string
  lastUpdated: string | null
  limitations: string[]
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
  confidence: 'unknown',
  providerName: 'NullSellableSeatAvailabilityProvider',
  lastUpdated: null,
  limitations: sellableSeatAvailabilityLimitations
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

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[sellableSeatAvailabilityProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
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
  if (!featureEnabled(input.env || process.env)) return new NullSellableSeatAvailabilityProvider()
  return (input.registry || createSellableSeatAvailabilityProviderRegistry()).get(input.providerName)
}

export function sellableSeatAvailabilityProviderConfiguration(env: Record<string, string | undefined> = process.env): SellableSeatAvailabilityProviderConfig[] {
  return futureProviderDefinitions.map((definition) => ({
    providerName: definition.providerName,
    credentialEnvVar: definition.credentialEnvVar,
    enabled: featureEnabled(env),
    status: providerConfigStatus(definition, env),
    liveCallsEnabled: false,
    advisoryOnly: true,
    scrapingAllowed: false,
    notes: [...definition.notes]
  }))
}

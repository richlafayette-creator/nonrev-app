export type SellableSeatStatus = 'available' | 'limited' | 'unavailable' | 'unknown'
export type PriceMovement = 'lower' | 'stable' | 'higher' | 'unknown'
export type CommercialAvailabilityConfidence = 'high' | 'medium' | 'low' | 'unknown'
export type SellableSeatProvider = 'duffel-placeholder' | 'amadeus-gds-placeholder' | 'sabre-placeholder' | 'manual-community-placeholder'
export type SellableSeatProviderReadinessStatus = 'feature-disabled' | 'credential-configured' | 'credential-missing' | 'manual-source-ready' | 'not-implemented'

export type CabinAvailabilitySignal = {
  cabin: 'economy' | 'premium-economy' | 'business' | 'first' | 'unknown'
  sellableStatus: SellableSeatStatus
  availableInventory?: number | null
  source: SellableSeatProvider | string
  observedAt: string
  confidence: CommercialAvailabilityConfidence
  limitations: string[]
}

export type FareAvailabilitySignal = {
  fareClass: string
  sellableStatus: SellableSeatStatus
  observedPrice?: number | null
  currency?: string
  source: SellableSeatProvider | string
  observedAt: string
  confidence: CommercialAvailabilityConfidence
  limitations: string[]
}

export type SeatMapAvailabilitySignal = {
  cabin: CabinAvailabilitySignal['cabin']
  seatMapOpenSeats: number | null
  sellableStatus: SellableSeatStatus
  source: SellableSeatProvider | string
  observedAt: string
  confidence: CommercialAvailabilityConfidence
  limitations: string[]
}

export type SellableSeatSignal = {
  flightNumber: string
  carrier: string
  departureDate: string
  origin: string
  destination: string
  sellableStatus: SellableSeatStatus
  cabinSignals: CabinAvailabilitySignal[]
  fareClassSignals: FareAvailabilitySignal[]
  observedPrice?: number | null
  priceMovement: PriceMovement
  seatMapOpenSeats?: number | null
  seatMapSignals?: SeatMapAvailabilitySignal[]
  source: SellableSeatProvider | string
  observedAt: string
  confidence: CommercialAvailabilityConfidence
  limitations: string[]
}

type PlaceholderProviderAdapter = {
  provider: SellableSeatProvider
  label: string
  canQueryLiveAvailability: false
  limitation: string
  buildUnavailableSignal: (input: SellableSeatSignalInput) => SellableSeatSignal
}

export type SellableSeatProviderReadiness = {
  provider: SellableSeatProvider
  label: string
  status: SellableSeatProviderReadinessStatus
  featureFlagEnvVar: 'NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED'
  credentialEnvVar?: string
  canQueryLiveAvailability: false
  proxyOnly: true
  canProvide: string[]
  cannotProvide: string[]
  nextAction: string
}

export type SellableSeatSignalInput = {
  flightNumber: string
  carrier: string
  departureDate: string
  origin: string
  destination: string
  observedAt?: string
}

export const commercialAvailabilityProviderFeatureFlag = 'NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED' as const

export const sellableSeatSignalLimitations = [
  'Commercial availability is a proxy signal only.',
  'This does not confirm non-rev, standby, upgrade, or pass-rider seat availability.',
  'No airline website scraping is performed by this framework.',
  'Provider adapters are placeholders until explicit API integrations are added.'
]

function placeholderSignal(provider: SellableSeatProvider, input: SellableSeatSignalInput): SellableSeatSignal {
  return {
    flightNumber: input.flightNumber,
    carrier: input.carrier,
    departureDate: input.departureDate,
    origin: input.origin,
    destination: input.destination,
    sellableStatus: 'unknown',
    cabinSignals: [],
    fareClassSignals: [],
    observedPrice: null,
    priceMovement: 'unknown',
    seatMapOpenSeats: null,
    seatMapSignals: [],
    source: provider,
    observedAt: input.observedAt || new Date().toISOString(),
    confidence: 'unknown',
    limitations: sellableSeatSignalLimitations
  }
}

function placeholderAdapter(provider: SellableSeatProvider, label: string, limitation: string): PlaceholderProviderAdapter {
  return {
    provider,
    label,
    canQueryLiveAvailability: false,
    limitation,
    buildUnavailableSignal: (input) => placeholderSignal(provider, input)
  }
}

export const duffelSellableSeatPlaceholder = placeholderAdapter(
  'duffel-placeholder',
  'Duffel placeholder',
  'Future Duffel integration point; no Duffel API call is made yet.'
)

export const amadeusGdsSellableSeatPlaceholder = placeholderAdapter(
  'amadeus-gds-placeholder',
  'Amadeus/GDS placeholder',
  'Future Amadeus or GDS integration point; no GDS API call is made yet.'
)

export const sabreSellableSeatPlaceholder = placeholderAdapter(
  'sabre-placeholder',
  'Sabre placeholder',
  'Future Sabre integration point; no Sabre API call is made yet.'
)

export const manualCommunitySellableSeatPlaceholder = placeholderAdapter(
  'manual-community-placeholder',
  'Manual/community placeholder',
  'Future manual or community commercial-availability entry point; no live source is queried yet.'
)

export const sellableSeatProviderPlaceholders = [
  duffelSellableSeatPlaceholder,
  amadeusGdsSellableSeatPlaceholder,
  sabreSellableSeatPlaceholder,
  manualCommunitySellableSeatPlaceholder
]

type SellableSeatProviderCapability = Omit<SellableSeatProviderReadiness, 'status' | 'featureFlagEnvVar' | 'canQueryLiveAvailability' | 'proxyOnly'> & {
  manualSource?: boolean
}

const sellableSeatProviderCapabilities: SellableSeatProviderCapability[] = [
  {
    provider: 'duffel-placeholder',
    label: 'Duffel commercial availability proxy',
    credentialEnvVar: 'DUFFEL_API_KEY',
    canProvide: ['Sellable commercial fare/cabin context if credentials, budget, and endpoint scope are approved.'],
    cannotProvide: ['Non-rev availability, standby list position, pass-rider priority, confirmed seat inventory, or guaranteed boarding.'],
    nextAction: 'Validate API scope, timeout, cache, and proxy-only wording before enabling server-side calls.'
  },
  {
    provider: 'amadeus-gds-placeholder',
    label: 'Amadeus/GDS commercial availability proxy',
    credentialEnvVar: 'AMADEUS_API_KEY',
    canProvide: ['Commercial shopping or fare-class context if credentials and licensing are approved.'],
    cannotProvide: ['Confirmed non-rev seats, standby clearance, employee travel eligibility, or airline internal inventory.'],
    nextAction: 'Keep disabled until licensing, caching, and proxy-only display rules are approved.'
  },
  {
    provider: 'sabre-placeholder',
    label: 'Sabre commercial availability proxy',
    credentialEnvVar: 'SABRE_API_KEY',
    canProvide: ['Commercial availability context if credentials, commercial terms, and endpoint limits are approved.'],
    cannotProvide: ['Non-rev boarding outcome, standby list order, confirmed standby availability, or guaranteed seat access.'],
    nextAction: 'Define adapter contract and redaction rules before introducing any Sabre request path.'
  },
  {
    provider: 'manual-community-placeholder',
    label: 'Manual/community commercial availability proxy',
    manualSource: true,
    canProvide: ['Manually entered or community-reported commercial availability context once moderation and freshness rules are approved.'],
    cannotProvide: ['Verified airline inventory, confirmed seats, standby clearance, or guaranteed travel outcomes.'],
    nextAction: 'Define freshness, trust, and moderation requirements before accepting user-entered proxy signals.'
  }
]

function commercialAvailabilityProviderEnabled(env: Record<string, string | undefined>) {
  const value = String(env[commercialAvailabilityProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function sellableSeatProviderReadinessStatus(source: SellableSeatProviderCapability, env: Record<string, string | undefined>): SellableSeatProviderReadinessStatus {
  if (!commercialAvailabilityProviderEnabled(env)) return 'feature-disabled'
  if (source.manualSource) return 'manual-source-ready'
  if (source.credentialEnvVar) return hasCredential(env, source.credentialEnvVar) ? 'credential-configured' : 'credential-missing'
  return 'not-implemented'
}

export function getSellableSeatProviderReadiness(env: Record<string, string | undefined> = process.env): SellableSeatProviderReadiness[] {
  return sellableSeatProviderCapabilities.map((source) => ({
    provider: source.provider,
    label: source.label,
    status: sellableSeatProviderReadinessStatus(source, env),
    featureFlagEnvVar: commercialAvailabilityProviderFeatureFlag,
    credentialEnvVar: source.credentialEnvVar,
    canQueryLiveAvailability: false,
    proxyOnly: true,
    canProvide: source.canProvide,
    cannotProvide: source.cannotProvide,
    nextAction: source.nextAction
  }))
}

export function enabledSellableSeatProviderNames(env: Record<string, string | undefined> = process.env): SellableSeatProvider[] {
  return getSellableSeatProviderReadiness(env)
    .filter((source) => source.status === 'credential-configured' || source.status === 'manual-source-ready')
    .map((source) => source.provider)
}

export function commercialAvailabilityLabel(signal?: SellableSeatSignal | null) {
  if (!signal) return null
  return ({
    available: 'Favorable',
    limited: 'Limited',
    unavailable: 'Unavailable',
    unknown: 'Unknown'
  } satisfies Record<SellableSeatStatus, string>)[signal.sellableStatus]
}

export function sellableSeatSignalScoreAdjustment(signal?: SellableSeatSignal | null) {
  if (!signal) return 0
  return ({
    available: 3,
    limited: 0,
    unavailable: -6,
    unknown: 0
  } satisfies Record<SellableSeatStatus, number>)[signal.sellableStatus]
}

export function sellableSeatSignalCaution(signal?: SellableSeatSignal | null) {
  if (!signal) return null
  if (signal.sellableStatus === 'limited') return 'Commercial availability is limited; treat this as caution only, not standby availability.'
  if (signal.sellableStatus === 'unavailable') return 'Commercial availability appears unavailable; this is a negative proxy only, not a confirmed non-rev result.'
  if (signal.sellableStatus === 'available') return 'Commercial availability appears favorable; this is a positive proxy only, not confirmed non-rev availability.'
  return 'Commercial availability is unknown and has no scoring effect.'
}

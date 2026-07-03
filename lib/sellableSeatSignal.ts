export type SellableSeatStatus = 'available' | 'limited' | 'unavailable' | 'unknown'
export type PriceMovement = 'lower' | 'stable' | 'higher' | 'unknown'
export type CommercialAvailabilityConfidence = 'high' | 'medium' | 'low' | 'unknown'
export type SellableSeatProvider = 'duffel-placeholder' | 'amadeus-gds-placeholder' | 'sabre-placeholder' | 'manual-community-placeholder'

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

export type SellableSeatSignalInput = {
  flightNumber: string
  carrier: string
  departureDate: string
  origin: string
  destination: string
  observedAt?: string
}

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

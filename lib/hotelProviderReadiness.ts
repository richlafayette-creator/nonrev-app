export type HotelProviderStatus = 'feature-disabled' | 'credential-configured' | 'credential-missing' | 'manual-source-ready' | 'not-implemented'
export type HotelProviderName = 'Booking.com proxy' | 'Expedia/Rapid proxy' | 'Google Hotels context' | 'Manual hotel note'

export type HotelProviderReadiness = {
  provider: HotelProviderName
  status: HotelProviderStatus
  featureFlagEnvVar: 'NONREV_HOTEL_PROVIDER_ENABLED'
  credentialEnvVar?: string
  advisoryOnly: true
  bookingEnabled: false
  canProvide: string[]
  cannotProvide: string[]
  nextAction: string
}

type HotelProviderCapability = Omit<HotelProviderReadiness, 'status' | 'featureFlagEnvVar' | 'advisoryOnly' | 'bookingEnabled'> & {
  manualSource?: boolean
}

export const hotelProviderFeatureFlag = 'NONREV_HOTEL_PROVIDER_ENABLED' as const

const hotelProviderCapabilities: HotelProviderCapability[] = [
  {
    provider: 'Booking.com proxy',
    credentialEnvVar: 'BOOKING_COM_API_KEY',
    canProvide: ['Read-only lodging search context for overnight recovery planning if credentials, commercial terms, and request limits are approved.'],
    cannotProvide: ['Guaranteed room availability, booked rooms, refunds, airline hotel vouchers, or disruption compensation.'],
    nextAction: 'Define read-only adapter, cache policy, cost caps, and explicit user confirmation boundaries before any booking-capable work.'
  },
  {
    provider: 'Expedia/Rapid proxy',
    credentialEnvVar: 'EXPEDIA_RAPID_API_KEY',
    canProvide: ['Read-only hotel price/location context if credentials, budget, and licensing are approved.'],
    cannotProvide: ['Guaranteed rates, guaranteed rooms, bookings, cancellations, refunds, or airline-provided lodging.'],
    nextAction: 'Keep disabled until API terms, caching, privacy, and booking boundaries are reviewed.'
  },
  {
    provider: 'Google Hotels context',
    credentialEnvVar: 'GOOGLE_HOTELS_API_KEY',
    canProvide: ['General hotel/location context if an approved API exists and terms allow this use.'],
    cannotProvide: ['Guaranteed hotel inventory, live booking, traveler check-in eligibility, or airline disruption support.'],
    nextAction: 'Verify approved API availability and terms before adding any integration path.'
  },
  {
    provider: 'Manual hotel note',
    manualSource: true,
    canProvide: ['User-entered hotel/final-destination notes for planning context.'],
    cannotProvide: ['Verified lodging inventory, booked rooms, guaranteed availability, or payment/refund handling.'],
    nextAction: 'Allow notes to remain user-owned planning context unless a separate booking workflow is explicitly approved.'
  }
]

const limitations = [
  'Hotel provider readiness is advisory planning context only and cannot book rooms.',
  'Hotel context never confirms room availability, pricing guarantees, refunds, airline vouchers, or disruption compensation.',
  'Hotel context must not imply standby clearance, seat inventory, or guaranteed travel recovery.'
]

function enabled(env: Record<string, string | undefined>) {
  const value = String(env[hotelProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function statusFor(source: HotelProviderCapability, env: Record<string, string | undefined>): HotelProviderStatus {
  if (!enabled(env)) return 'feature-disabled'
  if (source.manualSource) return 'manual-source-ready'
  if (source.credentialEnvVar) return hasCredential(env, source.credentialEnvVar) ? 'credential-configured' : 'credential-missing'
  return 'not-implemented'
}

export function getHotelProviderReadiness(env: Record<string, string | undefined> = process.env): HotelProviderReadiness[] {
  return hotelProviderCapabilities.map((source) => ({
    provider: source.provider,
    status: statusFor(source, env),
    featureFlagEnvVar: hotelProviderFeatureFlag,
    credentialEnvVar: source.credentialEnvVar,
    advisoryOnly: true,
    bookingEnabled: false,
    canProvide: source.canProvide,
    cannotProvide: [...source.cannotProvide, ...limitations],
    nextAction: source.nextAction
  }))
}

export function enabledHotelProviderNames(env: Record<string, string | undefined> = process.env): HotelProviderName[] {
  return getHotelProviderReadiness(env)
    .filter((source) => source.status === 'credential-configured' || source.status === 'manual-source-ready')
    .map((source) => source.provider)
}

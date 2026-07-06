export type GroundTransportProviderStatus = 'feature-disabled' | 'credential-configured' | 'credential-missing' | 'manual-source-ready' | 'not-implemented'
export type GroundTransportProviderName = 'Rideshare proxy' | 'Rental car proxy' | 'Public transit proxy' | 'Manual pickup note'

export type GroundTransportProviderReadiness = {
  provider: GroundTransportProviderName
  status: GroundTransportProviderStatus
  featureFlagEnvVar: 'NONREV_GROUND_TRANSPORT_PROVIDER_ENABLED'
  credentialEnvVar?: string
  advisoryOnly: true
  bookingEnabled: false
  canProvide: string[]
  cannotProvide: string[]
  nextAction: string
}

type GroundTransportCapability = Omit<GroundTransportProviderReadiness, 'status' | 'featureFlagEnvVar' | 'advisoryOnly' | 'bookingEnabled'> & {
  manualSource?: boolean
}

export const groundTransportProviderFeatureFlag = 'NONREV_GROUND_TRANSPORT_PROVIDER_ENABLED' as const

const groundTransportCapabilities: GroundTransportCapability[] = [
  {
    provider: 'Rideshare proxy',
    credentialEnvVar: 'RIDESHARE_PROVIDER_API_KEY',
    canProvide: ['Read-only pickup/dropoff duration and cost context if provider terms, credentials, and rate limits are approved.'],
    cannotProvide: ['Guaranteed vehicle availability, booked rides, surge-price guarantees, driver assignment, or pickup feasibility.'],
    nextAction: 'Define read-only estimate scope and require explicit user action before any booking-capable integration.'
  },
  {
    provider: 'Rental car proxy',
    credentialEnvVar: 'RENTAL_CAR_PROVIDER_API_KEY',
    canProvide: ['Read-only rental car location and price context if credentials, licensing, and request limits are approved.'],
    cannotProvide: ['Guaranteed vehicle inventory, reservations, payment, insurance eligibility, or one-way rental feasibility.'],
    nextAction: 'Keep disabled until booking boundaries, fee disclosures, and cancellation constraints are reviewed.'
  },
  {
    provider: 'Public transit proxy',
    credentialEnvVar: 'TRANSIT_PROVIDER_API_KEY',
    canProvide: ['Transit schedule/duration context for airport access and recovery moves if provider terms are approved.'],
    cannotProvide: ['Guaranteed service operation, ticket purchase, accessibility guarantees, or disruption-free transfers.'],
    nextAction: 'Start with advisory schedules only and fail closed when feeds are stale or unavailable.'
  },
  {
    provider: 'Manual pickup note',
    manualSource: true,
    canProvide: ['User-entered pickup, drop-off, driving, or local transport notes for planning context.'],
    cannotProvide: ['Verified vehicle availability, booked rides/cars, guaranteed pickup times, or payment/refund handling.'],
    nextAction: 'Keep manual notes user-owned planning context unless a separate booking workflow is explicitly approved.'
  }
]

const limitations = [
  'Ground transportation readiness is advisory planning context only and cannot book rides, cars, transit, or pickups.',
  'Ground transport context never confirms vehicle availability, driver assignment, rental inventory, ticketing, or guaranteed pickup times.',
  'Ground transport context must not imply airline recovery support, seat inventory, standby clearance, or guaranteed travel recovery.'
]

function enabled(env: Record<string, string | undefined>) {
  const value = String(env[groundTransportProviderFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

function statusFor(source: GroundTransportCapability, env: Record<string, string | undefined>): GroundTransportProviderStatus {
  if (!enabled(env)) return 'feature-disabled'
  if (source.manualSource) return 'manual-source-ready'
  if (source.credentialEnvVar) return hasCredential(env, source.credentialEnvVar) ? 'credential-configured' : 'credential-missing'
  return 'not-implemented'
}

export function getGroundTransportProviderReadiness(env: Record<string, string | undefined> = process.env): GroundTransportProviderReadiness[] {
  return groundTransportCapabilities.map((source) => ({
    provider: source.provider,
    status: statusFor(source, env),
    featureFlagEnvVar: groundTransportProviderFeatureFlag,
    credentialEnvVar: source.credentialEnvVar,
    advisoryOnly: true,
    bookingEnabled: false,
    canProvide: source.canProvide,
    cannotProvide: [...source.cannotProvide, ...limitations],
    nextAction: source.nextAction
  }))
}

export function enabledGroundTransportProviderNames(env: Record<string, string | undefined> = process.env): GroundTransportProviderName[] {
  return getGroundTransportProviderReadiness(env)
    .filter((source) => source.status === 'credential-configured' || source.status === 'manual-source-ready')
    .map((source) => source.provider)
}

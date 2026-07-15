export type StandbyLoadStatus = 'available' | 'unavailable' | 'stale' | 'community-reported' | 'unverified'

export type LoadDataSourceKind = 'live-standby-provider' | 'employee-submitted' | 'community-reported' | 'historical-observation'

export type LoadAvailabilityObservation = {
  id: string
  kind: LoadDataSourceKind
  carrier?: string
  flightNumber: string
  origin?: string
  destination?: string
  departureDate?: string
  reportedAt: string
  verifiedCarrier?: boolean
  contributorTrustScore?: number
  availableSeats?: number
  standbyCount?: number
  cabin?: string
  notes?: string
}

export type LoadAvailabilityFlight = {
  flightNumber: string
  carrier?: string
  origin?: string
  destination?: string
  departureDate?: string
}

export type LoadAvailabilitySummary = {
  flightNumber: string
  carrier?: string
  origin?: string
  destination?: string
  departureDate?: string
  status: StandbyLoadStatus
  label: string
  sources: LoadAvailabilityObservation[]
  latestReportedAt?: string
  expiresAt?: string
  warnings: string[]
}

export type LoadAvailabilityOptions = {
  now?: Date
  staleAfterMinutes?: number
  expireAfterMinutes?: number
}

function normalizeFlightNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function normalizeOptionalCode(value?: string) {
  return value?.trim().toUpperCase() || undefined
}

function normalizeOptionalDate(value?: string) {
  return value?.trim() || undefined
}

function minutesSince(value: string, now: Date) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY
  return Math.max(0, (now.getTime() - timestamp) / 60_000)
}

function reportTime(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function normalizeFlight(value: string | LoadAvailabilityFlight): Required<Pick<LoadAvailabilityFlight, 'flightNumber'>> & Omit<LoadAvailabilityFlight, 'flightNumber'> {
  const flight = typeof value === 'string' ? { flightNumber: value } : value
  return {
    flightNumber: normalizeFlightNumber(flight.flightNumber),
    carrier: normalizeOptionalCode(flight.carrier),
    origin: normalizeOptionalCode(flight.origin),
    destination: normalizeOptionalCode(flight.destination),
    departureDate: normalizeOptionalDate(flight.departureDate)
  }
}

function sameOptionalField(expected: string | undefined, actual: string | undefined, normalize = normalizeOptionalCode) {
  if (!expected) return true
  return normalize(actual) === expected
}

function observationMatchesFlight(observation: LoadAvailabilityObservation, flight: LoadAvailabilityFlight) {
  const normalized = normalizeFlight(flight)
  return normalizeFlightNumber(observation.flightNumber) === normalized.flightNumber &&
    sameOptionalField(normalized.carrier, observation.carrier) &&
    sameOptionalField(normalized.origin, observation.origin) &&
    sameOptionalField(normalized.destination, observation.destination) &&
    sameOptionalField(normalized.departureDate, observation.departureDate, normalizeOptionalDate)
}

export function summarizeLoadAvailabilityForFlights(
  flights: Array<string | LoadAvailabilityFlight>,
  observations: LoadAvailabilityObservation[],
  options: LoadAvailabilityOptions = {}
): LoadAvailabilitySummary[] {
  const now = options.now || new Date()
  const staleAfterMinutes = options.staleAfterMinutes ?? 240
  const expireAfterMinutes = options.expireAfterMinutes ?? 1440
  return flights.map((flightInput) => {
    const flight = normalizeFlight(flightInput)
    const matching = observations
      .filter((observation) => observationMatchesFlight(observation, flight))
      .sort((a, b) => reportTime(b.reportedAt) - reportTime(a.reportedAt))
    const current = matching.filter((observation) => observation.kind !== 'historical-observation' && minutesSince(observation.reportedAt, now) <= expireAfterMinutes)
    const latest = current[0]
    const warnings: string[] = []

    if (!latest) {
      if (matching.some((observation) => observation.kind === 'historical-observation')) warnings.push('Historical load observations are not current standby/load availability.')
      if (matching.some((observation) => minutesSince(observation.reportedAt, now) > expireAfterMinutes)) warnings.push('Expired load observations are omitted from current availability.')
      return {
        ...flight,
        status: 'unavailable',
        label: 'Load data unavailable',
        sources: [],
        warnings: [
          'No live standby/load provider, verified employee report, or current community report is attached to this exact schedule flight.',
          ...warnings
        ]
      }
    }

    const ageMinutes = minutesSince(latest.reportedAt, now)
    const expiresAt = Number.isFinite(Date.parse(latest.reportedAt)) ? new Date(Date.parse(latest.reportedAt) + expireAfterMinutes * 60_000).toISOString() : undefined
    if (ageMinutes > staleAfterMinutes) warnings.push('Load report is stale and must not be treated as current availability.')
    if (latest.kind === 'community-reported') warnings.push('Community-reported load data is not carrier-verified.')
    if (latest.verifiedCarrier === false) warnings.push('Carrier verification is missing or failed.')

    const status: StandbyLoadStatus = ageMinutes > staleAfterMinutes
      ? 'stale'
      : latest.kind === 'live-standby-provider' && latest.verifiedCarrier !== false
        ? 'available'
        : latest.kind === 'community-reported'
          ? 'community-reported'
          : latest.verifiedCarrier === false
            ? 'unverified'
            : 'available'

    const label = status === 'available'
      ? 'Load data available'
      : status === 'stale'
        ? 'Stale load data'
        : status === 'community-reported'
          ? 'Community-reported load data'
          : status === 'unverified'
            ? 'Unverified load data'
            : 'Load data unavailable'

    return {
      ...flight,
      status,
      label,
      sources: current,
      latestReportedAt: latest.reportedAt,
      expiresAt,
      warnings
    }
  })
}

export function loadAvailabilityDisclaimer(summary: LoadAvailabilitySummary) {
  if (summary.status === 'unavailable') return 'A valid schedule itinerary may be shown without standby/load availability.'
  if (summary.status === 'stale') return 'Do not use stale load data as current standby availability.'
  if (summary.status === 'community-reported' || summary.status === 'unverified') return 'Treat this load data as unverified context, not a success probability.'
  return 'Schedule availability and standby/load availability are separate signals.'
}

export type FlightSignals = {
  flight_number?: string | null
  origin?: string | null
  destination?: string | null
  aircraft?: string | null
  status?: string | null
  score?: number | null
  created_at?: string | null
}

export type ItinerarySignals = {
  route: string
  confidence: string
  segments: string[]
  backupOptions?: number
  travelerFriction?: number
}

export type NonrevSuccessChoiceLabel = 'Best Choice' | 'Strong Option' | 'Backup Option' | 'Last Chance'

export type NonrevLoadReportSignal = {
  availableSeats?: number
  standbyCount?: number
  trustScore?: number
  sourceTrustScore?: number
  contributorId?: string
  createdAt?: string
  boardedResult?: boolean | null
  missedResult?: boolean | null
  verified?: boolean
  confidenceLevel?: string
}

export type NonrevSuccessScoringInput = {
  route: string
  flightNumber?: string
  carrier?: string
  baseItineraryScore?: number
  baseSuccessProbability?: number
  historicalFlightSuccessRate?: number | null
  historicalRouteSuccessRate?: number | null
  airlineRecoveryNetworkStrength?: number | null
  remainingDeparturesToday?: number | null
  hubStrength?: number | null
  publicSeatInventory?: number | null
  standbyCount?: number | null
  departureDateTime?: string | null
  historicalCancellationRate?: number | null
  historicalDelayRate?: number | null
  aircraftSeatCount?: number | null
  alternateRoutingOptions?: number | null
  userLoadReports?: NonrevLoadReportSignal[]
  connectionCount?: number
}

export type NonrevSuccessFactor = {
  key: keyof typeof nonrevSuccessWeights
  label: string
  contribution: number
  normalizedScore: number
  weight: number
  detail: string
}

export type NonrevSuccessScore = {
  score: number
  label: NonrevSuccessChoiceLabel
  topPositiveFactors: NonrevSuccessFactor[]
  topRiskFactor: NonrevSuccessFactor
  factors: NonrevSuccessFactor[]
  formula: string
}

export const nonrevSuccessWeights = {
  historicalFlightSuccess: 14,
  historicalRouteSuccess: 10,
  airlineRecoveryNetwork: 9,
  remainingDepartures: 8,
  hubStrength: 7,
  publicSeatInventory: 10,
  timeUntilDeparture: 7,
  cancellationReliability: 7,
  delayReliability: 7,
  aircraftSeatCount: 5,
  alternateRoutingOptions: 6,
  userLoadReports: 5,
  loadReportFreshness: 3,
  independentConfirmations: 2
} as const

export const nonrevSuccessFormulaDocumentation = {
  formula: 'overallScore = Σ(normalizedFactorScore × factorWeight) / Σ(factorWeight), clamped to 1–99.',
  principle: 'Ranks by probability of reaching destination as a nonrev traveler, prioritizing successful boarding and recovery over schedule convenience.',
  missingDataPolicy: 'Missing external/API-backed inputs use conservative neutral defaults so the architecture is ready without pretending to have unavailable live data.',
  labels: {
    'Best Choice': '85–99, strongest success probability and recovery shape.',
    'Strong Option': '72–84, viable primary choice with manageable risk.',
    'Backup Option': '58–71, keep available but verify loads/recovery.',
    'Last Chance': '1–57, only use when better options are unavailable.'
  },
  weights: nonrevSuccessWeights
} as const

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term))
}

function clamp(value: number, min = 1, max = 99) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizePercent(value: number | null | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, value))
}

function normalizeCount(value: number | null | undefined, excellentAt: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, (value / excellentAt) * 100))
}

function departureLeadScore(departureDateTime?: string | null) {
  if (!departureDateTime) return 62
  const parsed = Date.parse(departureDateTime)
  if (!Number.isFinite(parsed)) return 62
  const hours = (parsed - Date.now()) / 3_600_000
  if (hours < 0) return 8
  if (hours < 1) return 30
  if (hours < 3) return 58
  if (hours < 8) return 78
  if (hours < 24) return 86
  if (hours < 72) return 74
  return 64
}

function aircraftCapacityScore(seats?: number | null) {
  if (typeof seats !== 'number' || !Number.isFinite(seats)) return 58
  if (seats >= 300) return 94
  if (seats >= 220) return 86
  if (seats >= 170) return 76
  if (seats >= 130) return 64
  if (seats >= 90) return 48
  return 34
}

function loadMarginScore(availableSeats?: number | null, standbyCount?: number | null) {
  if (typeof availableSeats !== 'number' || !Number.isFinite(availableSeats)) return 54
  const standby = typeof standbyCount === 'number' && Number.isFinite(standbyCount) ? standbyCount : 0
  const margin = availableSeats - standby
  if (margin >= 12) return 96
  if (margin >= 6) return 86
  if (margin >= 2) return 72
  if (margin >= 0) return 58
  if (margin >= -4) return 36
  return 18
}

function loadReportAgeHours(report: NonrevLoadReportSignal) {
  const raw = report.createdAt
  if (!raw) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY
  return Math.max(0, (Date.now() - parsed) / 3_600_000)
}

function loadReportFreshnessScore(reports: NonrevLoadReportSignal[] = []) {
  if (!reports.length) return 45
  const freshest = Math.min(...reports.map(loadReportAgeHours))
  if (freshest <= 1) return 96
  if (freshest <= 4) return 84
  if (freshest <= 12) return 68
  if (freshest <= 24) return 54
  return 34
}

function userLoadReportScore(reports: NonrevLoadReportSignal[] = []) {
  if (!reports.length) return 48
  const weighted = reports.map((report) => {
    const trust = normalizePercent(report.sourceTrustScore ?? report.trustScore, report.verified === false ? 45 : 65)
    const recency = loadReportFreshnessScore([report])
    const margin = loadMarginScore(report.availableSeats, report.standbyCount)
    const outcome = report.boardedResult === true ? 92 : report.missedResult === true ? 18 : 60
    return margin * 0.46 + trust * 0.24 + recency * 0.2 + outcome * 0.1
  })
  return weighted.reduce((total, score) => total + score, 0) / weighted.length
}

function independentConfirmationScore(reports: NonrevLoadReportSignal[] = []) {
  if (!reports.length) return 42
  const contributors = new Set(reports.map((report) => report.contributorId || 'unknown'))
  if (contributors.size >= 4) return 94
  if (contributors.size === 3) return 84
  if (contributors.size === 2) return 72
  return 56
}

function factorDetail(score: number, good: string, neutral: string, risk: string) {
  if (score >= 75) return good
  if (score >= 55) return neutral
  return risk
}

function buildFactor(
  key: keyof typeof nonrevSuccessWeights,
  label: string,
  normalizedScore: number,
  detail: string
): NonrevSuccessFactor {
  const weight = nonrevSuccessWeights[key]
  return {
    key,
    label,
    normalizedScore: clamp(normalizedScore, 0, 100),
    weight,
    contribution: Math.round((clamp(normalizedScore, 0, 100) * weight) / 100),
    detail
  }
}

export function nonrevSuccessLabel(score: number): NonrevSuccessChoiceLabel {
  if (score >= 85) return 'Best Choice'
  if (score >= 72) return 'Strong Option'
  if (score >= 58) return 'Backup Option'
  return 'Last Chance'
}

export function scoreNonrevItinerary(input: NonrevSuccessScoringInput): NonrevSuccessScore {
  const reports = input.userLoadReports || []
  const publicInventory = loadMarginScore(input.publicSeatInventory, input.standbyCount)
  const userLoads = userLoadReportScore(reports)
  const factors: NonrevSuccessFactor[] = [
    buildFactor('historicalFlightSuccess', 'Flight history', normalizePercent(input.historicalFlightSuccessRate, input.baseSuccessProbability ?? 62), factorDetail(normalizePercent(input.historicalFlightSuccessRate, input.baseSuccessProbability ?? 62), 'Specific flight has strong historical nonrev success.', 'Specific flight history is neutral or still sparse.', 'Specific flight history is weak or unavailable.')),
    buildFactor('historicalRouteSuccess', 'Route history', normalizePercent(input.historicalRouteSuccessRate, input.baseSuccessProbability ?? 62), factorDetail(normalizePercent(input.historicalRouteSuccessRate, input.baseSuccessProbability ?? 62), 'Route has a strong success pattern.', 'Route history is usable but not dominant.', 'Route history is weak or sparse.')),
    buildFactor('airlineRecoveryNetwork', 'Airline recovery network', normalizePercent(input.airlineRecoveryNetworkStrength, 62), factorDetail(normalizePercent(input.airlineRecoveryNetworkStrength, 62), 'Carrier/network gives multiple recovery paths.', 'Carrier recovery network is acceptable.', 'Carrier recovery network is thin for this trip.')),
    buildFactor('remainingDepartures', 'Remaining departures today', normalizeCount(input.remainingDeparturesToday, 8, 52), factorDetail(normalizeCount(input.remainingDeparturesToday, 8, 52), 'Several same-day departures remain.', 'Some same-day recovery remains.', 'Few or no same-day departures remain.')),
    buildFactor('hubStrength', 'Hub strength', normalizePercent(input.hubStrength, 60), factorDetail(normalizePercent(input.hubStrength, 60), 'Route touches a strong recovery hub.', 'Hub support is moderate.', 'Hub support is limited.')),
    buildFactor('publicSeatInventory', 'Seat inventory', publicInventory, factorDetail(publicInventory, 'Visible seat/open-seat margin is favorable.', 'Visible seat inventory is marginal or unknown.', 'Visible inventory is tight versus standby demand.')),
    buildFactor('timeUntilDeparture', 'Time until departure', departureLeadScore(input.departureDateTime), factorDetail(departureLeadScore(input.departureDateTime), 'Enough lead time to monitor and pivot.', 'Departure timing is workable.', 'Departure is too close for comfortable recovery.')),
    buildFactor('cancellationReliability', 'Cancellation reliability', 100 - normalizePercent(input.historicalCancellationRate, 8) * 4, factorDetail(100 - normalizePercent(input.historicalCancellationRate, 8) * 4, 'Historical cancellation risk is low.', 'Cancellation risk is moderate.', 'Cancellation risk is elevated.')),
    buildFactor('delayReliability', 'Delay reliability', 100 - normalizePercent(input.historicalDelayRate, 22) * 2.2, factorDetail(100 - normalizePercent(input.historicalDelayRate, 22) * 2.2, 'Historical delay risk is low.', 'Delay risk is manageable.', 'Delay risk threatens connections/recovery.')),
    buildFactor('aircraftSeatCount', 'Aircraft capacity', aircraftCapacityScore(input.aircraftSeatCount), factorDetail(aircraftCapacityScore(input.aircraftSeatCount), 'Larger aircraft improves nonrev odds.', 'Aircraft capacity is average.', 'Small aircraft limits nonrev seats.')),
    buildFactor('alternateRoutingOptions', 'Alternate routing options', normalizeCount(input.alternateRoutingOptions, 6, input.connectionCount ? 58 : 52), factorDetail(normalizeCount(input.alternateRoutingOptions, 6, input.connectionCount ? 58 : 52), 'Good alternate routing if the trip breaks.', 'Some alternate routing exists.', 'Few alternate routes after a misconnect.')),
    buildFactor('userLoadReports', 'User load reports', userLoads, factorDetail(userLoads, 'Community/user load reports support this option.', 'Community/user loads are neutral or incomplete.', 'Community/user load reports point to pressure.')),
    buildFactor('loadReportFreshness', 'Load freshness', loadReportFreshnessScore(reports), factorDetail(loadReportFreshnessScore(reports), 'Load reports are fresh.', 'Load reports are usable but aging.', 'Load reports are stale or missing.')),
    buildFactor('independentConfirmations', 'Independent confirmations', independentConfirmationScore(reports), factorDetail(independentConfirmationScore(reports), 'Multiple independent reports agree.', 'Limited independent confirmation.', 'No independent confirmation yet.'))
  ]

  const totalWeight = factors.reduce((total, factor) => total + factor.weight, 0)
  const weightedScore = factors.reduce((total, factor) => total + factor.normalizedScore * factor.weight, 0) / totalWeight
  const score = clamp(weightedScore, 1, 99)
  const topPositiveFactors = [...factors]
    .sort((a, b) => (b.normalizedScore - 50) * b.weight - (a.normalizedScore - 50) * a.weight)
    .slice(0, 3)
  const topRiskFactor = [...factors]
    .sort((a, b) => (a.normalizedScore - 50) * a.weight - (b.normalizedScore - 50) * b.weight)[0]

  return {
    score,
    label: nonrevSuccessLabel(score),
    topPositiveFactors,
    topRiskFactor,
    factors,
    formula: nonrevSuccessFormulaDocumentation.formula
  }
}

export function delayRiskScore(flight: FlightSignals) {
  const status = (flight.status || '').toLowerCase()
  const route = `${flight.origin || ''}-${flight.destination || ''}`.toUpperCase()
  const aircraft = (flight.aircraft || '').toLowerCase()
  let risk = 28
  const reasons: string[] = ['Baseline scaffold risk']

  if (includesAny(status, ['delayed', 'late', 'weather', 'irrop', 'cancel'])) {
    risk += 35
    reasons.push('Current status suggests operational disruption')
  }

  if (includesAny(route, ['SFO', 'EWR', 'ORD', 'DEN'])) {
    risk += 10
    reasons.push('Route touches a weather/congestion-sensitive hub')
  }

  if (includesAny(aircraft, ['regional', 'crj', 'embraer', 'e75'])) {
    risk += 8
    reasons.push('Smaller aircraft can reduce recovery options')
  }

  if ((flight.score || 0) >= 75) {
    risk -= 8
    reasons.push('Strong load score offsets some delay risk')
  }

  const score = Math.max(5, Math.min(95, risk))
  const label = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low'

  return { score, label, reasons }
}

export function rankItinerary(itinerary: ItinerarySignals) {
  const recoveryScore = scoreNonrevItinerary({
    route: itinerary.route,
    baseItineraryScore: itinerary.confidence === 'Strong' ? 76 : itinerary.confidence === 'Caution' ? 52 : 62,
    baseSuccessProbability: itinerary.confidence === 'Strong' ? 76 : itinerary.confidence === 'Caution' ? 52 : 62,
    remainingDeparturesToday: itinerary.backupOptions ?? itinerary.segments.length,
    alternateRoutingOptions: itinerary.backupOptions ?? itinerary.segments.length,
    connectionCount: Math.max(0, itinerary.route.split('→').length - 2),
    historicalFlightSuccessRate: itinerary.confidence === 'Strong' ? 76 : null,
    historicalRouteSuccessRate: itinerary.confidence === 'Caution' ? 52 : 62,
    airlineRecoveryNetworkStrength: Math.min(90, 48 + (itinerary.backupOptions ?? itinerary.segments.length) * 8),
    hubStrength: itinerary.route.split('→').length > 2 ? 68 : 58
  })

  const frictionPenalty = Math.max(0, itinerary.travelerFriction || 0)
  const rank = clamp(recoveryScore.score - frictionPenalty, 1, 99)
  return {
    score: rank,
    label: nonrevSuccessLabel(rank),
    notes: [
      ...recoveryScore.topPositiveFactors.map((factor) => factor.detail),
      recoveryScore.topRiskFactor.detail
    ].filter(Boolean).slice(0, 4)
  }
}

import type { CommunityLoadReport } from './communityLoads'
import type { ItineraryResult, ParsedItineraryRequest } from './itinerarySearch'
import type { ProviderResultRecord } from './providerResultRepository'
import type { RecoveryIntelligence } from './recoveryIntelligence'
import type { TripOutcome } from './outcomeRepository'

export type HistoricalOutcomeState = 'boarded' | 'failed' | 'canceled trip' | 'unknown'

export type HistoricalRouteObservation = {
  origin: string
  destination: string
  airline: string
  flightNumber: string
  dayOfWeek: number
  month: number
  searchTimestamp: string
}

export type HistoricalSuccessMetrics = {
  score: number
  confidence: number
  successfulOutcomes: number
  failedOutcomes: number
  canceledTrips: number
  unknownOutcomes: number
  sampleSize: number
  weightedSampleSize: number
  recencyScore: number
}

export type LoadReportTrustMetrics = {
  score: number
  confidence: number
  reportCount: number
  weightedReportCount: number
  reporterReliabilityScore: number
  priorReportScore: number
  outcomeAgreementScore: number
  recencyScore: number
  singleReportCapApplied: boolean
}

export type CompositeRouteScoreMetrics = {
  score: number
  liveAvailabilityScore: number
  historicalSuccessScore: number
  communityLoadScore: number
  recoveryStrength: number
  sampleSizeScore: number
  confidence: number
  capApplied: number
}

export type HistoricalRouteIntelligence = {
  observations: HistoricalRouteObservation[]
  historicalSuccess: HistoricalSuccessMetrics
  loadReportTrust: LoadReportTrustMetrics
  compositeRouteScore: CompositeRouteScoreMetrics
  outcomeStates: HistoricalOutcomeState[]
  explanation: string[]
}

export type HistoricalIntelligenceInput = {
  request: ParsedItineraryRequest
  itineraries?: ItineraryResult[]
  providerRecords?: ProviderResultRecord[]
  outcomes?: TripOutcome[]
  communityLoadReports?: CommunityLoadReport[]
  recoveryIntelligence?: RecoveryIntelligence
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalized(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

function compactFlightNumber(value?: string | null) {
  return normalized(value).replace(/\s+/g, '')
}

function parseTime(value?: string) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : NaN
}

function routeAirports(route?: string) {
  const matches = normalized(route).match(/\b[A-Z]{3}\b/g) || []
  return {
    origin: matches[0] || '',
    destination: matches[matches.length - 1] || ''
  }
}

function observationDateParts(timestamp?: string, fallback?: string) {
  const parsed = parseTime(timestamp) || parseTime(fallback) || Date.now()
  const date = new Date(parsed)
  return {
    dayOfWeek: date.getUTCDay(),
    month: date.getUTCMonth() + 1,
    searchTimestamp: new Date(parsed).toISOString()
  }
}

export function providerRecordToHistoricalObservation(record: ProviderResultRecord): HistoricalRouteObservation {
  const parts = observationDateParts(record.source_checked_at || record.cached_at, record.departure_time)
  return {
    origin: normalized(record.origin),
    destination: normalized(record.destination),
    airline: normalized(record.airline || record.carrier || 'Unknown'),
    flightNumber: compactFlightNumber(record.flight_number) || 'UNKNOWN',
    ...parts
  }
}

function itineraryToHistoricalObservation(itinerary: ItineraryResult): HistoricalRouteObservation {
  const firstLeg = itinerary.legs[0]
  const route = routeAirports(itinerary.route)
  const parts = observationDateParts(itinerary.sourceCheckedAt, itinerary.departureTime || firstLeg?.departureTime)
  return {
    origin: normalized(firstLeg?.origin || route.origin),
    destination: normalized(itinerary.legs[itinerary.legs.length - 1]?.destination || route.destination),
    airline: normalized(itinerary.carrier || firstLeg?.carrier || 'Unknown'),
    flightNumber: compactFlightNumber(itinerary.operatingFlightNumber || itinerary.flightNumber || firstLeg?.flightNumber) || 'UNKNOWN',
    ...parts
  }
}

export function requestToHistoricalObservation(request: ParsedItineraryRequest): HistoricalRouteObservation | null {
  if (!request.origin || !request.destination) return null
  const parts = observationDateParts(new Date().toISOString(), request.date ? `${request.date}T00:00:00.000Z` : undefined)
  return {
    origin: normalized(request.origin),
    destination: normalized(request.destination),
    airline: normalized(request.carrier && request.carrier !== 'all' ? request.carrier : 'ALL'),
    flightNumber: 'UNKNOWN',
    ...parts
  }
}

function outcomeState(outcome: Partial<TripOutcome> & { status?: string; success?: boolean | null; cancelled?: boolean | null }): HistoricalOutcomeState {
  const status = normalized(outcome.status)
  if (status === 'BOARDED' || status === 'YES, GOT ON' || outcome.success === true) return 'boarded'
  if (status === 'FAILED' || status === 'NO, DID NOT GET ON' || outcome.success === false) return 'failed'
  if (status === 'CANCELED TRIP' || status === 'CANCELLED TRIP' || outcome.cancelled === true) return 'canceled trip'
  return 'unknown'
}

function outcomeMatchesRequest(outcome: TripOutcome, request: ParsedItineraryRequest) {
  const route = routeAirports(outcome.route || outcome.title)
  const originMatches = !request.origin || route.origin === normalized(request.origin) || normalized(outcome.route).includes(normalized(request.origin))
  const destinationMatches = !request.destination || route.destination === normalized(request.destination) || normalized(outcome.route).includes(normalized(request.destination))
  return originMatches && destinationMatches
}

function recencyWeight(timestamp?: string) {
  const parsed = parseTime(timestamp)
  if (!Number.isFinite(parsed)) return 0.22
  const ageDays = Math.max(0, (Date.now() - parsed) / 86_400_000)
  if (ageDays <= 7) return 1
  if (ageDays <= 30) return 0.82
  if (ageDays <= 90) return 0.58
  if (ageDays <= 365) return 0.32
  return 0.18
}

function buildHistoricalSuccess(outcomes: TripOutcome[], request: ParsedItineraryRequest): HistoricalSuccessMetrics {
  const matching = outcomes.filter((outcome) => outcomeMatchesRequest(outcome, request))
  let successfulOutcomes = 0
  let failedOutcomes = 0
  let canceledTrips = 0
  let unknownOutcomes = 0
  let weightedSuccess = 0
  let weightedFailure = 0
  let recencyTotal = 0

  matching.forEach((outcome) => {
    const state = outcomeState(outcome)
    const weight = recencyWeight(outcome.timestamp || outcome.createdAt)
    recencyTotal += weight
    if (state === 'boarded') {
      successfulOutcomes += 1
      weightedSuccess += weight
    } else if (state === 'failed') {
      failedOutcomes += 1
      weightedFailure += weight
    } else if (state === 'canceled trip') {
      canceledTrips += 1
    } else {
      unknownOutcomes += 1
    }
  })

  const sampleSize = successfulOutcomes + failedOutcomes
  const weightedSampleSize = Number((weightedSuccess + weightedFailure).toFixed(2))
  const rawScore = weightedSampleSize ? (weightedSuccess / weightedSampleSize) * 100 : 50
  const sampleConfidence = Math.min(1, Math.sqrt(sampleSize / 8))
  const recencyScore = clamp(matching.length ? (recencyTotal / matching.length) * 100 : 20)
  const confidence = clamp(sampleConfidence * 70 + (recencyScore / 100) * 30, 8, 100)
  const conservativeScore = clamp(50 + (rawScore - 50) * (confidence / 100))

  return {
    score: conservativeScore,
    confidence,
    successfulOutcomes,
    failedOutcomes,
    canceledTrips,
    unknownOutcomes,
    sampleSize,
    weightedSampleSize,
    recencyScore
  }
}

function loadMarginScore(report: CommunityLoadReport) {
  const availableSeats = Number(report.availableSeats)
  const standbyCount = Number(report.standbyCount)
  if (!Number.isFinite(availableSeats) || !Number.isFinite(standbyCount)) return 50
  const margin = availableSeats - standbyCount
  if (standbyCount <= 0) return availableSeats >= 6 ? 94 : availableSeats >= 3 ? 76 : 62
  if (availableSeats >= standbyCount * 2) return 92
  if (availableSeats > standbyCount) return margin >= Math.max(3, standbyCount * 0.35) ? 78 : 64
  if (availableSeats === standbyCount) return 48
  if (margin >= -3) return 32
  return 18
}

function reportOutcomeAgreement(report: CommunityLoadReport) {
  const margin = Number(report.availableSeats) - Number(report.standbyCount)
  const hasKnownOutcome = report.boardedResult === true || report.missedResult === true
  if (!hasKnownOutcome) return 56
  if (report.boardedResult === true && margin >= 0) return 92
  if (report.missedResult === true && margin <= 0) return 88
  return 28
}

function priorReportScore(report: CommunityLoadReport) {
  const counts = report.validationCounts || { Confirmed: 0, Outdated: 0, Inaccurate: 0 }
  const validationCount = (counts.Confirmed || 0) + (counts.Outdated || 0) + (counts.Inaccurate || 0)
  return clamp(Math.min(validationCount, 10) * 7 + Math.min(Math.max(0, report.contributorTrustScore - 45), 35), 18, 100)
}

function buildLoadTrust(reports: CommunityLoadReport[]): LoadReportTrustMetrics {
  if (!reports.length) {
    return {
      score: 50,
      confidence: 0,
      reportCount: 0,
      weightedReportCount: 0,
      reporterReliabilityScore: 50,
      priorReportScore: 0,
      outcomeAgreementScore: 50,
      recencyScore: 20,
      singleReportCapApplied: false
    }
  }

  const weighted = reports.map((report) => {
    const reporterReliability = clamp(((report.contributorTrustScore || 50) * 0.55) + ((report.sourceTrustScore || 50) * 0.45))
    const prior = priorReportScore(report)
    const agreement = reportOutcomeAgreement(report)
    const recency = clamp(recencyWeight(report.createdAt) * 100)
    const trustWeight = Math.max(0.05, reporterReliability * 0.34 + prior * 0.18 + agreement * 0.28 + recency * 0.20) / 100
    return { report, reporterReliability, prior, agreement, recency, score: loadMarginScore(report), trustWeight }
  })

  const rawTotalWeight = weighted.reduce((total, row) => total + row.trustWeight, 0) || 1
  const maxSingleWeight = reports.length === 1 ? 0.28 : 0.42
  const capped = weighted.map((row) => ({ ...row, effectiveWeight: Math.min(row.trustWeight / rawTotalWeight, maxSingleWeight) }))
  const totalEffectiveWeight = capped.reduce((total, row) => total + row.effectiveWeight, 0) || 1
  const score = capped.reduce((total, row) => total + row.score * row.effectiveWeight, 0) / totalEffectiveWeight
  const reporterReliabilityScore = capped.reduce((total, row) => total + row.reporterReliability * row.effectiveWeight, 0) / totalEffectiveWeight
  const priorScore = capped.reduce((total, row) => total + row.prior * row.effectiveWeight, 0) / totalEffectiveWeight
  const outcomeAgreementScore = capped.reduce((total, row) => total + row.agreement * row.effectiveWeight, 0) / totalEffectiveWeight
  const recencyScore = capped.reduce((total, row) => total + row.recency * row.effectiveWeight, 0) / totalEffectiveWeight
  const confidence = clamp(Math.min(reports.length, 6) * 10 + reporterReliabilityScore * 0.22 + outcomeAgreementScore * 0.18 + recencyScore * 0.12, 0, 88)

  return {
    score: clamp(50 + (score - 50) * Math.min(0.78, confidence / 100)),
    confidence,
    reportCount: reports.length,
    weightedReportCount: Number(totalEffectiveWeight.toFixed(2)),
    reporterReliabilityScore: clamp(reporterReliabilityScore),
    priorReportScore: clamp(priorScore),
    outcomeAgreementScore: clamp(outcomeAgreementScore),
    recencyScore: clamp(recencyScore),
    singleReportCapApplied: reports.length === 1
  }
}

function liveAvailabilityScore(itinerary?: ItineraryResult) {
  if (!itinerary) return 0
  if (itinerary.productionAvailability === false) {
    if (itinerary.dataFreshnessRule === 'cached-provider-current') return Math.min(72, itinerary.score)
    if (String(itinerary.dataFreshnessRule || '').startsWith('cached-provider')) return Math.min(62, itinerary.score)
    return Math.min(46, itinerary.score)
  }
  if (itinerary.dataFreshnessRule === 'exact-requested-date' || itinerary.sourceProvider === 'flightaware' || itinerary.sourceProvider === 'aviationstack') return Math.max(72, itinerary.score)
  return Math.min(68, itinerary.score)
}

function sampleSizeScore(historical: HistoricalSuccessMetrics, loadTrust: LoadReportTrustMetrics, observations: HistoricalRouteObservation[]) {
  return clamp(historical.sampleSize * 12 + loadTrust.reportCount * 7 + Math.min(observations.length, 12) * 3)
}

function compositeFor(itinerary: ItineraryResult | undefined, historical: HistoricalSuccessMetrics, loadTrust: LoadReportTrustMetrics, recovery?: RecoveryIntelligence, observations: HistoricalRouteObservation[] = []): CompositeRouteScoreMetrics {
  const liveScore = liveAvailabilityScore(itinerary)
  const sampleScore = sampleSizeScore(historical, loadTrust, observations)
  const historicalComponent = 50 + (historical.score - 50) * (historical.confidence / 100)
  const communityComponent = 50 + (loadTrust.score - 50) * (loadTrust.confidence / 100)
  const recoveryStrength = recovery?.recoveryStrength || 0
  const raw = liveScore * 0.50 + historicalComponent * 0.18 + communityComponent * 0.14 + recoveryStrength * 0.12 + sampleScore * 0.06
  const capApplied = itinerary?.productionAvailability === false ? 76 : itinerary ? 96 : 70
  const confidence = clamp((historical.confidence * 0.34) + (loadTrust.confidence * 0.24) + Math.min(100, liveScore) * 0.28 + sampleScore * 0.14)
  return {
    score: clamp(raw, 1, capApplied),
    liveAvailabilityScore: clamp(liveScore),
    historicalSuccessScore: historical.score,
    communityLoadScore: loadTrust.score,
    recoveryStrength,
    sampleSizeScore: sampleScore,
    confidence,
    capApplied
  }
}

export function buildHistoricalRouteIntelligence(input: HistoricalIntelligenceInput): HistoricalRouteIntelligence {
  const providerObservations = (input.providerRecords || []).map(providerRecordToHistoricalObservation)
  const itineraryObservations = (input.itineraries || []).map(itineraryToHistoricalObservation)
  const requestObservation = requestToHistoricalObservation(input.request)
  const observations = [...providerObservations, ...itineraryObservations, ...(requestObservation ? [requestObservation] : [])]
    .filter((observation) => observation.origin && observation.destination)
  const historicalSuccess = buildHistoricalSuccess(input.outcomes || [], input.request)
  const loadReportTrust = buildLoadTrust(input.communityLoadReports || [])
  const compositeRouteScore = compositeFor((input.itineraries || [])[0], historicalSuccess, loadReportTrust, input.recoveryIntelligence, observations)
  const outcomeStates = Array.from(new Set((input.outcomes || []).filter((outcome) => outcomeMatchesRequest(outcome, input.request)).map(outcomeState)))

  return {
    observations,
    historicalSuccess,
    loadReportTrust,
    compositeRouteScore,
    outcomeStates: outcomeStates.length ? outcomeStates : ['unknown'],
    explanation: [
      `Historical Success Score ${historicalSuccess.score}/100 from ${historicalSuccess.successfulOutcomes} boarded and ${historicalSuccess.failedOutcomes} failed outcome${historicalSuccess.sampleSize === 1 ? '' : 's'}; confidence ${historicalSuccess.confidence}/100 because low sample sizes stay conservative.`,
      `Load report trust ${loadReportTrust.score}/100 from ${loadReportTrust.reportCount} report${loadReportTrust.reportCount === 1 ? '' : 's'} using reporter reliability, prior-report signal, outcome agreement, and recency.`,
      `Composite route score ${compositeRouteScore.score}/100 blends live availability, historical success, community loads, recovery strength, and sample size without treating history as live availability.`
    ]
  }
}

export function blendHistoricalIntelligenceIntoItineraryScores(itineraries: ItineraryResult[], historical: HistoricalRouteIntelligence) {
  return itineraries.map((itinerary) => {
    const composite = compositeFor(itinerary, historical.historicalSuccess, historical.loadReportTrust, undefined, historical.observations)
    const cap = itinerary.productionAvailability === false ? Math.min(76, composite.capApplied) : composite.capApplied
    return {
      ...itinerary,
      score: clamp(itinerary.score * 0.72 + composite.score * 0.28, 1, cap),
      historicalSuccessScore: historical.historicalSuccess.score,
      historicalConfidence: historical.historicalSuccess.confidence,
      historicalSampleSize: historical.historicalSuccess.sampleSize,
      communityLoadTrustScore: historical.loadReportTrust.score,
      compositeRouteScore: composite.score,
      historicalFactors: {
        successfulOutcomes: historical.historicalSuccess.successfulOutcomes,
        failedOutcomes: historical.historicalSuccess.failedOutcomes,
        sampleSize: historical.historicalSuccess.sampleSize,
        recencyScore: historical.historicalSuccess.recencyScore,
        reporterReliabilityScore: historical.loadReportTrust.reporterReliabilityScore,
        priorReportScore: historical.loadReportTrust.priorReportScore,
        outcomeAgreementScore: historical.loadReportTrust.outcomeAgreementScore,
        loadReportRecencyScore: historical.loadReportTrust.recencyScore,
        singleReportCapApplied: historical.loadReportTrust.singleReportCapApplied ? 1 : 0
      }
    }
  })
}

export const communityLoadsStorageKey = 'nonrevy.communityLoads'
export const communityContributorReputationStorageKey = 'nonrevy.communityLoadContributorReputation'
export const communityLoadRequestsStorageKey = 'nonrevy.communityLoadRequests'

export type CommunityLoadFreshness = 'Fresh' | 'Recent' | 'Stale' | 'Expired'
export type CommunityLoadValidationStatus = 'Confirmed' | 'Outdated' | 'Inaccurate'

export type CommunityLoadReport = {
  id: string
  flightNumber: string
  carrier: string
  route: string
  origin: string
  destination: string
  date: string
  availableSeats: number
  standbyCount: number
  cabin?: string
  notes?: string
  boardedResult?: boolean | null
  missedResult?: boolean | null
  cabinUpgradeResult?: boolean | null
  gateClearTime?: string | null
  contributorId: string
  contributorTrustScore: number
  sourceTrustScore: number
  validationStatus?: CommunityLoadValidationStatus
  validationCounts?: Record<CommunityLoadValidationStatus, number>
  createdAt: string
}

export type CommunityLoadRequest = {
  id: string
  flightNumber: string
  carrier: string
  route: string
  origin: string
  destination: string
  date: string
  status: 'Open' | 'Fulfilled'
  createdAt: string
}

export type CommunityLoadContributorReputation = {
  contributorId: string
  totalReports: number
  acceptedReports: number
  confirmedValidations: number
  outdatedValidations: number
  inaccurateValidations: number
  averageSourceTrustScore: number
  trustScore: number
  trustLevel: CommunityContributorTrustLevel
  updatedAt: string
}

export type CommunityContributorTrustLevel = 'New' | 'Reliable' | 'Highly trusted' | 'Needs corroboration'

export type CommunityContributorTrustBreakdown = {
  trustScore: number
  trustLevel: CommunityContributorTrustLevel
  submissionQualityScore: number
  validationScore: number
  volumeScore: number
  corroborationPenalty: number
  explanation: string[]
}

export type CommunityConfidenceLevel = 'High' | 'Medium' | 'Low'

export type CommunityLoadIntelligenceReport = CommunityLoadReport & {
  adjustedTrustScore: number
  outlier: boolean
}

export type CommunityLoadImpact = 'Strong' | 'Narrow' | 'Risky' | 'Poor' | 'Unknown'

export type CommunityLoadIntelligence = {
  key: string
  flightNumber: string
  date: string
  cabin: string
  route: string
  latestReport: CommunityLoadReport | null
  reportCount: number
  averageAvailableSeats: number | null
  averageStandbyCount: number | null
  loadMargin: number | null
  loadImpact: CommunityLoadImpact
  loadScoreCap: number | null
  scoringWeight: number
  isRecent: boolean
  freshness: CommunityLoadFreshness | null
  freshnessScore: number
  confidenceScore: number
  agreementScore: number
  averageTrustScore: number
  communityConfidence: CommunityConfidenceLevel
  outlierReportIds: string[]
  trustedReports: CommunityLoadIntelligenceReport[]
  explanation: string[]
  loadImpactExplanation: string[]
  scoreContribution: number
}

export type CommunityLoadSummary = {
  latestReport: CommunityLoadReport | null
  reportCount: number
  averageTrustScore: number
  freshness: CommunityLoadFreshness | null
}

export type CommunityLoadSubmission = {
  flightNumber: string
  carrier: string
  route: string
  origin?: string
  destination?: string
  date: string
  availableSeats: number
  standbyCount: number
  cabin?: string
  notes?: string
  boardedResult?: boolean | null
  missedResult?: boolean | null
  cabinUpgradeResult?: boolean | null
  gateClearTime?: string | null
  contributorId?: string
}

const defaultContributorId = 'local-community-contributor'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function safeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

export function normalizeCommunityFlightNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export function communityRouteAirports(route: string) {
  const matches = route.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  return {
    origin: matches[0] || '',
    destination: matches[matches.length - 1] || ''
  }
}

function readJsonArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function communityLoadFreshness(createdAt: string, now = new Date()): CommunityLoadFreshness {
  const createdTime = Date.parse(createdAt)
  if (!Number.isFinite(createdTime)) return 'Stale'
  const ageMinutes = Math.max(0, (now.getTime() - createdTime) / 60_000)
  if (ageMinutes < 60) return 'Fresh'
  if (ageMinutes < 240) return 'Recent'
  if (ageMinutes < 1440) return 'Stale'
  return 'Expired'
}

export function relativeCommunityLoadTime(createdAt: string, now = new Date()) {
  const createdTime = Date.parse(createdAt)
  if (!Number.isFinite(createdTime)) return 'time unknown'
  const ageMinutes = Math.max(0, Math.round((now.getTime() - createdTime) / 60_000))
  if (ageMinutes < 1) return 'just now'
  if (ageMinutes < 60) return `${ageMinutes} min ago`
  const ageHours = Math.round(ageMinutes / 60)
  if (ageHours < 24) return `${ageHours} hr${ageHours === 1 ? '' : 's'} ago`
  const ageDays = Math.round(ageHours / 24)
  return `${ageDays} day${ageDays === 1 ? '' : 's'} ago`
}

export function communityContributorTrustLevel(trustScore: number, validationCount = 0): CommunityContributorTrustLevel {
  if (trustScore >= 82 && validationCount >= 3) return 'Highly trusted'
  if (trustScore >= 62) return 'Reliable'
  if (trustScore < 42) return 'Needs corroboration'
  return 'New'
}

export function calculateCommunityContributorTrustScore(input: {
  totalReports: number
  acceptedReports: number
  confirmedValidations?: number
  outdatedValidations?: number
  inaccurateValidations?: number
  averageSourceTrustScore?: number
}): CommunityContributorTrustBreakdown {
  const totalReports = clamp(safeNumber(input.totalReports), 0, 999_999)
  const acceptedReports = clamp(safeNumber(input.acceptedReports), 0, totalReports || 999_999)
  const confirmedValidations = clamp(safeNumber(input.confirmedValidations), 0, 999_999)
  const outdatedValidations = clamp(safeNumber(input.outdatedValidations), 0, 999_999)
  const inaccurateValidations = clamp(safeNumber(input.inaccurateValidations), 0, 999_999)
  const validationCount = confirmedValidations + outdatedValidations + inaccurateValidations
  const acceptedRate = totalReports ? acceptedReports / totalReports : 0.72
  const averageSourceTrustScore = clamp(safeNumber(input.averageSourceTrustScore, 50), 0, 100)
  const submissionQualityScore = clamp(acceptedRate * 26 + averageSourceTrustScore * 0.24, 0, 50)
  const validationBalance = validationCount
    ? (confirmedValidations * 1 + outdatedValidations * 0.3 - inaccurateValidations * 1.15) / validationCount
    : 0.18
  const validationScore = clamp(18 + validationBalance * 24, 0, 42)
  const volumeScore = clamp(Math.min(totalReports, 12) * 1.6 + Math.min(validationCount, 8) * 1.2, 0, 24)
  const corroborationPenalty = clamp(inaccurateValidations * 8 + outdatedValidations * 3 - confirmedValidations * 1.5, 0, 30)
  const trustScore = clamp(18 + submissionQualityScore + validationScore + volumeScore - corroborationPenalty, 0, 100)
  const trustLevel = communityContributorTrustLevel(trustScore, validationCount)
  return {
    trustScore,
    trustLevel,
    submissionQualityScore,
    validationScore,
    volumeScore,
    corroborationPenalty,
    explanation: [
      `Submission quality contributes ${submissionQualityScore}/50 from accepted reports and source completeness.`,
      validationCount ? `Community validation contributes ${validationScore}/42 from ${confirmedValidations} confirmed, ${outdatedValidations} outdated, and ${inaccurateValidations} inaccurate marks.` : 'Validation starts neutral until other travelers confirm or dispute reports.',
      `Report volume contributes ${volumeScore}/24 without overpowering accuracy.`,
      corroborationPenalty ? `Corroboration penalty subtracts ${corroborationPenalty} for disputed or stale reports.` : 'No corroboration penalty currently applied.'
    ]
  }
}

export function initialCommunityContributorReputation(contributorId = defaultContributorId): CommunityLoadContributorReputation {
  const trust = calculateCommunityContributorTrustScore({ totalReports: 0, acceptedReports: 0, averageSourceTrustScore: 50 })
  return {
    contributorId,
    totalReports: 0,
    acceptedReports: 0,
    confirmedValidations: 0,
    outdatedValidations: 0,
    inaccurateValidations: 0,
    averageSourceTrustScore: 50,
    trustScore: trust.trustScore,
    trustLevel: trust.trustLevel,
    updatedAt: new Date().toISOString()
  }
}

function migrateReputation(raw: Partial<CommunityLoadContributorReputation> | null | undefined, contributorId = defaultContributorId): CommunityLoadContributorReputation {
  const totalReports = clamp(safeNumber(raw?.totalReports), 0, 999_999)
  const acceptedReports = clamp(safeNumber(raw?.acceptedReports), 0, totalReports || 999_999)
  const confirmedValidations = clamp(safeNumber(raw?.confirmedValidations), 0, 999_999)
  const outdatedValidations = clamp(safeNumber(raw?.outdatedValidations), 0, 999_999)
  const inaccurateValidations = clamp(safeNumber(raw?.inaccurateValidations), 0, 999_999)
  const averageSourceTrustScore = clamp(safeNumber(raw?.averageSourceTrustScore, raw?.trustScore || 50), 0, 100)
  const trust = calculateCommunityContributorTrustScore({
    totalReports,
    acceptedReports,
    confirmedValidations,
    outdatedValidations,
    inaccurateValidations,
    averageSourceTrustScore
  })
  return {
    contributorId: String(raw?.contributorId || contributorId),
    totalReports,
    acceptedReports,
    confirmedValidations,
    outdatedValidations,
    inaccurateValidations,
    averageSourceTrustScore,
    trustScore: trust.trustScore,
    trustLevel: trust.trustLevel,
    updatedAt: String(raw?.updatedAt || new Date().toISOString())
  }
}

export function loadCommunityContributorReputation(contributorId = defaultContributorId) {
  if (typeof window === 'undefined') return initialCommunityContributorReputation(contributorId)
  try {
    const raw = window.localStorage.getItem(communityContributorReputationStorageKey)
    if (!raw) return initialCommunityContributorReputation(contributorId)
    return migrateReputation(JSON.parse(raw), contributorId)
  } catch {
    return initialCommunityContributorReputation(contributorId)
  }
}

export function saveCommunityContributorReputation(reputation: CommunityLoadContributorReputation) {
  const nextReputation = migrateReputation(reputation, reputation.contributorId)
  writeJson(communityContributorReputationStorageKey, nextReputation)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('nonrevy-reputation-updated'))
  return nextReputation
}

export function updateCommunityContributorReputation(options: {
  contributorId?: string
  accepted?: boolean
  sourceTrustScore?: number
  validationStatus?: CommunityLoadValidationStatus
} = {}) {
  const current = loadCommunityContributorReputation(options.contributorId || defaultContributorId)
  const isSubmissionUpdate = options.accepted !== undefined
  const totalReports = current.totalReports + (isSubmissionUpdate ? 1 : 0)
  const acceptedReports = current.acceptedReports + (isSubmissionUpdate && options.accepted === false ? 0 : isSubmissionUpdate ? 1 : 0)
  const sourceTrustScore = options.sourceTrustScore === undefined ? undefined : clamp(options.sourceTrustScore, 0, 100)
  const averageSourceTrustScore = isSubmissionUpdate && sourceTrustScore !== undefined
    ? clamp(((current.averageSourceTrustScore * current.totalReports) + sourceTrustScore) / Math.max(1, totalReports), 0, 100)
    : current.averageSourceTrustScore
  const confirmedValidations = current.confirmedValidations + (options.validationStatus === 'Confirmed' ? 1 : 0)
  const outdatedValidations = current.outdatedValidations + (options.validationStatus === 'Outdated' ? 1 : 0)
  const inaccurateValidations = current.inaccurateValidations + (options.validationStatus === 'Inaccurate' ? 1 : 0)
  const trust = calculateCommunityContributorTrustScore({
    totalReports,
    acceptedReports,
    confirmedValidations,
    outdatedValidations,
    inaccurateValidations,
    averageSourceTrustScore
  })
  return saveCommunityContributorReputation({
    ...current,
    totalReports,
    acceptedReports,
    confirmedValidations,
    outdatedValidations,
    inaccurateValidations,
    averageSourceTrustScore,
    trustScore: trust.trustScore,
    trustLevel: trust.trustLevel,
    updatedAt: new Date().toISOString()
  })
}

export function communityContributorTrustBreakdown(reputation: CommunityLoadContributorReputation): CommunityContributorTrustBreakdown {
  return calculateCommunityContributorTrustScore(reputation)
}


function normalizeCommunityCabin(value?: string | null) {
  return value?.trim().toUpperCase().replace(/\s+/g, ' ') || 'ANY'
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0
  const avg = average(values)
  const variance = average(values.map((value) => Math.pow(value - avg, 2)))
  return Math.sqrt(variance)
}

function freshnessScoreFor(createdAt: string) {
  const createdTime = Date.parse(createdAt)
  if (!Number.isFinite(createdTime)) return 28
  const ageMinutes = Math.max(0, (Date.now() - createdTime) / 60_000)
  if (ageMinutes <= 60) return 96
  if (ageMinutes <= 240) return 84
  if (ageMinutes <= 720) return 68
  if (ageMinutes <= 1440) return 52
  if (ageMinutes <= 2880) return 34
  return 20
}

function communityLoadAgreementScore(reports: CommunityLoadReport[]) {
  if (reports.length <= 1) return 48
  const margins = reports.map((report) => report.availableSeats - report.standbyCount)
  const seats = reports.map((report) => report.availableSeats)
  const standby = reports.map((report) => report.standbyCount)
  const marginDeviation = standardDeviation(margins)
  const seatDeviation = standardDeviation(seats)
  const standbyDeviation = standardDeviation(standby)
  return clamp(100 - marginDeviation * 6 - seatDeviation * 2.5 - standbyDeviation * 1.5, 0, 100)
}

export function communityLoadMargin(availableSeats: number | null, standbyCount: number | null) {
  if (availableSeats === null || standbyCount === null) return null
  return availableSeats - standbyCount
}

export function communityLoadImpactFor(availableSeats: number | null, standbyCount: number | null): CommunityLoadImpact {
  if (availableSeats === null || standbyCount === null) return 'Unknown'
  if (standbyCount <= 0) return availableSeats >= 4 ? 'Strong' : 'Narrow'
  if (availableSeats >= standbyCount * 2) return 'Strong'
  if (availableSeats > standbyCount) return 'Narrow'
  if (availableSeats === standbyCount) return 'Risky'
  return 'Poor'
}

export function communityLoadScoreCapFor(availableSeats: number | null, standbyCount: number | null) {
  if (availableSeats === null || standbyCount === null) return null
  if (standbyCount > availableSeats) return 35
  if (standbyCount >= availableSeats) return 50
  return null
}

function communityLoadScore(averageAvailableSeats: number | null, averageStandbyCount: number | null) {
  if (averageAvailableSeats === null || averageStandbyCount === null) return 50
  const margin = averageAvailableSeats - averageStandbyCount
  if (averageStandbyCount <= 0) return averageAvailableSeats >= 6 ? 94 : averageAvailableSeats >= 3 ? 76 : 62
  if (averageAvailableSeats >= averageStandbyCount * 2) return 94
  if (averageAvailableSeats > averageStandbyCount && margin >= Math.max(4, averageStandbyCount * 0.45)) return 82
  if (averageAvailableSeats > averageStandbyCount) return 66
  if (averageAvailableSeats === averageStandbyCount) return 48
  if (margin >= -4) return 30
  return 16
}

function communityLoadScoringWeight(freshness: CommunityLoadFreshness | null, confidenceScore: number) {
  const confidenceMultiplier = confidenceScore >= 76 ? 1 : confidenceScore >= 52 ? 0.82 : 0.64
  if (freshness === 'Fresh') return Number((0.42 * confidenceMultiplier).toFixed(2))
  if (freshness === 'Recent') return Number((0.34 * confidenceMultiplier).toFixed(2))
  if (freshness === 'Stale') return Number((0.1 * confidenceMultiplier).toFixed(2))
  return Number((0.04 * confidenceMultiplier).toFixed(2))
}

function communityConfidenceLevelFor(reportCount: number, freshnessScore: number, agreementScore: number): CommunityConfidenceLevel {
  if (reportCount >= 3 && freshnessScore >= 80 && agreementScore >= 72) return 'High'
  if (reportCount >= 2 && freshnessScore >= 52 && agreementScore >= 52) return 'Medium'
  if (reportCount === 1 && freshnessScore >= 80) return 'Medium'
  return 'Low'
}

function groupKeyForCommunityLoad(report: Pick<CommunityLoadReport, 'flightNumber' | 'date' | 'cabin' | 'route'>) {
  return [normalizeCommunityFlightNumber(report.flightNumber), report.date, normalizeCommunityCabin(report.cabin), report.route.trim().toUpperCase()].join('|')
}

function sourceTrustScoreFor(reputation: CommunityLoadContributorReputation, submission: CommunityLoadSubmission) {
  const completeness = [
    Boolean(normalizeCommunityFlightNumber(submission.flightNumber)),
    Boolean(submission.date),
    Number.isFinite(submission.availableSeats),
    Number.isFinite(submission.standbyCount),
    Boolean(submission.route || (submission.origin && submission.destination)),
    Boolean(submission.cabin)
  ].filter(Boolean).length
  return clamp(reputation.trustScore * 0.7 + (completeness / 6) * 30, 0, 100)
}

function migrateReport(raw: Partial<CommunityLoadReport>): CommunityLoadReport | null {
  if (!raw || typeof raw !== 'object') return null
  const route = String(raw.route || '').toUpperCase()
  const routeAirports = communityRouteAirports(route)
  const flightNumber = normalizeCommunityFlightNumber(String(raw.flightNumber || ''))
  const date = String(raw.date || '')
  const createdAt = String(raw.createdAt || new Date().toISOString())
  if (!flightNumber || !date) return null
  return {
    id: String(raw.id || `community-load-${flightNumber}-${date}-${Date.now()}`),
    flightNumber,
    carrier: String(raw.carrier || flightNumber.match(/^[A-Z]{2,3}/)?.[0] || 'Unknown'),
    route: route || `${String(raw.origin || routeAirports.origin)} → ${String(raw.destination || routeAirports.destination)}`.trim(),
    origin: String(raw.origin || routeAirports.origin || ''),
    destination: String(raw.destination || routeAirports.destination || ''),
    date,
    availableSeats: clamp(safeNumber(raw.availableSeats), 0, 999),
    standbyCount: clamp(safeNumber(raw.standbyCount), 0, 999),
    cabin: raw.cabin ? String(raw.cabin) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    boardedResult: typeof raw.boardedResult === 'boolean' ? raw.boardedResult : null,
    missedResult: typeof raw.missedResult === 'boolean' ? raw.missedResult : null,
    cabinUpgradeResult: typeof raw.cabinUpgradeResult === 'boolean' ? raw.cabinUpgradeResult : null,
    gateClearTime: raw.gateClearTime ? String(raw.gateClearTime) : null,
    contributorId: String(raw.contributorId || defaultContributorId),
    contributorTrustScore: clamp(safeNumber(raw.contributorTrustScore, 50), 0, 100),
    sourceTrustScore: clamp(safeNumber(raw.sourceTrustScore, raw.contributorTrustScore || 50), 0, 100),
    validationStatus: raw.validationStatus === 'Confirmed' || raw.validationStatus === 'Outdated' || raw.validationStatus === 'Inaccurate' ? raw.validationStatus : undefined,
    validationCounts: {
      Confirmed: clamp(safeNumber(raw.validationCounts?.Confirmed), 0, 999_999),
      Outdated: clamp(safeNumber(raw.validationCounts?.Outdated), 0, 999_999),
      Inaccurate: clamp(safeNumber(raw.validationCounts?.Inaccurate), 0, 999_999)
    },
    createdAt
  }
}

export function loadCommunityLoads() {
  return readJsonArray<Partial<CommunityLoadReport>>(communityLoadsStorageKey)
    .map(migrateReport)
    .filter((report): report is CommunityLoadReport => Boolean(report))
}


function migrateRequest(raw: Partial<CommunityLoadRequest>): CommunityLoadRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const route = String(raw.route || '').toUpperCase()
  const routeAirports = communityRouteAirports(route)
  const flightNumber = normalizeCommunityFlightNumber(String(raw.flightNumber || ''))
  const date = String(raw.date || '')
  if (!flightNumber || !date) return null
  return {
    id: String(raw.id || `community-load-request-${flightNumber}-${date}-${Date.now()}`),
    flightNumber,
    carrier: String(raw.carrier || flightNumber.match(/^[A-Z]{2,3}/)?.[0] || 'Unknown'),
    route,
    origin: String(raw.origin || routeAirports.origin || ''),
    destination: String(raw.destination || routeAirports.destination || ''),
    date,
    status: raw.status === 'Fulfilled' ? 'Fulfilled' : 'Open',
    createdAt: String(raw.createdAt || new Date().toISOString())
  }
}

export function loadCommunityLoadRequests() {
  return readJsonArray<Partial<CommunityLoadRequest>>(communityLoadRequestsStorageKey)
    .map(migrateRequest)
    .filter((request): request is CommunityLoadRequest => Boolean(request))
}

export function saveCommunityLoadRequest(input: Omit<CommunityLoadRequest, 'id' | 'status' | 'createdAt'>) {
  if (typeof window === 'undefined') return null
  const flightNumber = normalizeCommunityFlightNumber(input.flightNumber)
  const origin = input.origin.trim().toUpperCase()
  const destination = input.destination.trim().toUpperCase()
  const date = input.date.trim()
  if (!flightNumber || !date || !origin || !destination) return null
  const route = input.route.trim().toUpperCase() || `${origin} → ${destination}`
  const existing = loadCommunityLoadRequests()
  const duplicate = existing.find((request) =>
    request.flightNumber === flightNumber &&
    request.date === date &&
    request.origin === origin &&
    request.destination === destination
  )
  if (duplicate) return duplicate
  const request: CommunityLoadRequest = {
    id: `community-load-request-${flightNumber}-${date}-${origin}-${destination}`,
    flightNumber,
    carrier: input.carrier.trim() || flightNumber.match(/^[A-Z]{2,3}/)?.[0] || 'Unknown',
    route,
    origin,
    destination,
    date,
    status: 'Open',
    createdAt: new Date().toISOString()
  }
  writeJson(communityLoadRequestsStorageKey, [request, ...existing])
  window.dispatchEvent(new Event('nonrevy-community-load-requests-updated'))
  return request
}

export function validateCommunityLoadReport(reportId: string, status: CommunityLoadValidationStatus) {
  if (typeof window === 'undefined') return []
  const reports = loadCommunityLoads().map((report) => {
    if (report.id !== reportId) return report
    const validationCounts = report.validationCounts || { Confirmed: 0, Outdated: 0, Inaccurate: 0 }
    const nextSourceTrustScore = clamp(report.sourceTrustScore + (status === 'Confirmed' ? 4 : status === 'Outdated' ? -6 : -12), 0, 100)
    updateCommunityContributorReputation({
      contributorId: report.contributorId,
      validationStatus: status,
      sourceTrustScore: nextSourceTrustScore
    })
    return {
      ...report,
      validationStatus: status,
      validationCounts: {
        ...validationCounts,
        [status]: (validationCounts[status] || 0) + 1
      },
      sourceTrustScore: nextSourceTrustScore
    }
  })
  writeJson(communityLoadsStorageKey, reports)
  window.dispatchEvent(new Event('nonrevy-community-loads-updated'))
  return reports
}

export function saveCommunityLoadReport(submission: CommunityLoadSubmission) {
  if (typeof window === 'undefined') return null
  const contributorId = submission.contributorId || defaultContributorId
  const currentReputation = loadCommunityContributorReputation(contributorId)
  const preliminarySourceTrustScore = sourceTrustScoreFor(currentReputation, submission)
  const reputation = updateCommunityContributorReputation({ contributorId, accepted: true, sourceTrustScore: preliminarySourceTrustScore })
  const routeAirports = communityRouteAirports(submission.route)
  const flightNumber = normalizeCommunityFlightNumber(submission.flightNumber)
  const createdAt = new Date().toISOString()
  const report: CommunityLoadReport = {
    id: `community-load-${flightNumber}-${submission.date}-${Date.now()}`,
    flightNumber,
    carrier: submission.carrier.trim() || flightNumber.match(/^[A-Z]{2,3}/)?.[0] || 'Unknown',
    route: submission.route.trim().toUpperCase(),
    origin: (submission.origin || routeAirports.origin).trim().toUpperCase(),
    destination: (submission.destination || routeAirports.destination).trim().toUpperCase(),
    date: submission.date,
    availableSeats: clamp(submission.availableSeats, 0, 999),
    standbyCount: clamp(submission.standbyCount, 0, 999),
    cabin: submission.cabin?.trim() || undefined,
    notes: submission.notes?.trim() || undefined,
    boardedResult: submission.boardedResult ?? null,
    missedResult: submission.missedResult ?? null,
    cabinUpgradeResult: submission.cabinUpgradeResult ?? null,
    gateClearTime: submission.gateClearTime || null,
    contributorId,
    contributorTrustScore: reputation.trustScore,
    sourceTrustScore: sourceTrustScoreFor(reputation, submission),
    validationStatus: undefined,
    validationCounts: { Confirmed: 0, Outdated: 0, Inaccurate: 0 },
    createdAt
  }
  const reports = [report, ...loadCommunityLoads()]
  writeJson(communityLoadsStorageKey, reports)
  window.dispatchEvent(new Event('nonrevy-community-loads-updated'))
  return report
}


export function aggregateCommunityLoadReports(reports: CommunityLoadReport[]) {
  const groups = new Map<string, CommunityLoadReport[]>()
  reports.forEach((report) => {
    const key = groupKeyForCommunityLoad(report)
    groups.set(key, [...(groups.get(key) || []), report])
  })
  return [...groups.entries()].map(([key, groupReports]) => buildCommunityLoadIntelligence(key, groupReports))
}

function buildCommunityLoadIntelligence(key: string, reports: CommunityLoadReport[]): CommunityLoadIntelligence {
  const sortedReports = [...reports].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const latestReport = sortedReports[0] || null
  const medianSeats = median(sortedReports.map((report) => report.availableSeats))
  const medianStandby = median(sortedReports.map((report) => report.standbyCount))
  const medianMargin = median(sortedReports.map((report) => report.availableSeats - report.standbyCount))
  const trustedReports: CommunityLoadIntelligenceReport[] = sortedReports.map((report) => {
    const seatDeviation = Math.abs(report.availableSeats - medianSeats)
    const standbyDeviation = Math.abs(report.standbyCount - medianStandby)
    const marginDeviation = Math.abs((report.availableSeats - report.standbyCount) - medianMargin)
    const outlier = sortedReports.length >= 3 && (seatDeviation > Math.max(6, Math.abs(medianSeats) * 0.45) || standbyDeviation > Math.max(6, Math.abs(medianStandby) * 0.55) || marginDeviation > 8)
    return {
      ...report,
      outlier,
      adjustedTrustScore: clamp(report.sourceTrustScore * (outlier ? 0.35 : 1), 0, 100)
    }
  })
  const trustedWeight = trustedReports.reduce((total, report) => total + Math.max(1, report.adjustedTrustScore), 0)
  const weightedAverage = (selector: (report: CommunityLoadIntelligenceReport) => number) => trustedReports.length
    ? trustedReports.reduce((total, report) => total + selector(report) * Math.max(1, report.adjustedTrustScore), 0) / trustedWeight
    : null
  const averageAvailableSeats = weightedAverage((report) => report.availableSeats)
  const averageStandbyCount = weightedAverage((report) => report.standbyCount)
  const freshness = latestReport ? communityLoadFreshness(latestReport.createdAt) : null
  const isRecent = freshness === 'Fresh' || freshness === 'Recent'
  const freshnessScore = latestReport ? freshnessScoreFor(latestReport.createdAt) : 0
  const agreementScore = communityLoadAgreementScore(trustedReports.filter((report) => !report.outlier))
  const averageTrustScore = trustedReports.length ? clamp(average(trustedReports.map((report) => report.adjustedTrustScore)), 0, 100) : 0
  const loadScore = communityLoadScore(averageAvailableSeats, averageStandbyCount)
  const loadMargin = averageAvailableSeats === null || averageStandbyCount === null ? null : clamp(averageAvailableSeats - averageStandbyCount, -999, 999)
  const loadImpact = communityLoadImpactFor(averageAvailableSeats, averageStandbyCount)
  const loadScoreCap = communityLoadScoreCapFor(averageAvailableSeats, averageStandbyCount)
  const reportVolumeScore = clamp(45 + Math.min(trustedReports.length, 5) * 11, 0, 100)
  const confidenceScore = clamp(reportVolumeScore * 0.24 + freshnessScore * 0.32 + agreementScore * 0.26 + averageTrustScore * 0.18, 0, 100)
  const communityConfidence = communityConfidenceLevelFor(trustedReports.length, freshnessScore, agreementScore)
  const scoringWeight = communityLoadScoringWeight(freshness, confidenceScore)
  const outlierReportIds = trustedReports.filter((report) => report.outlier).map((report) => report.id)
  const freshnessAdjustedLoadScore = isRecent ? loadScore : clamp(loadScore * 0.45 + 50 * 0.55, 0, 100)
  const scoreContribution = clamp(freshnessAdjustedLoadScore * 0.72 + confidenceScore * 0.28, 0, 100)
  const matchingReportText = trustedReports.length === 1 ? '1 report' : `${trustedReports.filter((report) => !report.outlier).length} matching reports`
  const lastUpdateText = latestReport ? `Last update ${relativeCommunityLoadTime(latestReport.createdAt)}` : 'No recent update'
  const agreementText = agreementScore >= 76 ? 'Strong agreement' : agreementScore >= 55 ? 'Moderate agreement' : 'Reporter agreement is weak'
  return {
    key,
    flightNumber: latestReport?.flightNumber || key.split('|')[0] || '',
    date: latestReport?.date || key.split('|')[1] || '',
    cabin: latestReport?.cabin || key.split('|')[2] || 'ANY',
    route: latestReport?.route || key.split('|')[3] || '',
    latestReport,
    reportCount: trustedReports.length,
    averageAvailableSeats: averageAvailableSeats === null ? null : clamp(averageAvailableSeats, 0, 999),
    averageStandbyCount: averageStandbyCount === null ? null : clamp(averageStandbyCount, 0, 999),
    loadMargin,
    loadImpact,
    loadScoreCap,
    scoringWeight,
    isRecent,
    freshness,
    freshnessScore,
    confidenceScore,
    agreementScore,
    averageTrustScore,
    communityConfidence,
    outlierReportIds,
    trustedReports,
    explanation: [
      matchingReportText,
      lastUpdateText,
      agreementText,
      outlierReportIds.length ? `${outlierReportIds.length} outlier report${outlierReportIds.length === 1 ? '' : 's'} down-weighted` : 'No major outliers detected',
      isRecent ? 'Fresh/recent load data receives major scoring weight.' : 'Stale load data is down-weighted significantly.'
    ],
    loadImpactExplanation: [
      averageAvailableSeats === null ? 'Open seat count is missing.' : `${clamp(averageAvailableSeats, 0, 999)} open seat${clamp(averageAvailableSeats, 0, 999) === 1 ? '' : 's'}.`,
      averageStandbyCount === null ? 'Listed nonrev passenger count is missing.' : `${clamp(averageStandbyCount, 0, 999)} listed nonrev passenger${clamp(averageStandbyCount, 0, 999) === 1 ? '' : 's'}.`,
      loadMargin === null ? 'Load margin cannot be calculated yet.' : `${loadImpact === 'Strong' ? 'Strong' : loadImpact === 'Narrow' ? 'Narrow' : loadImpact === 'Risky' ? 'Risky' : loadImpact === 'Poor' ? 'Poor' : 'Unknown'} ${loadMargin >= 0 ? loadMargin : Math.abs(loadMargin)}-seat ${loadMargin >= 0 ? 'margin' : 'shortfall'}.`,
      loadScoreCap ? `Score capped at ${loadScoreCap} because standby demand ${loadImpact === 'Poor' ? 'exceeds' : 'is close to'} availability.` : isRecent ? 'Recent load margin can lift otherwise similar itineraries.' : 'Stale load is only a weak planning signal.'
    ],
    scoreContribution
  }
}

export function communityLoadIntelligenceForItinerary(reports: CommunityLoadReport[], input: { flightNumber: string; route: string; date?: string; cabin?: string }): CommunityLoadIntelligence | null {
  const matchingReports = reports.filter((report) => {
    if (!communityLoadMatchesItinerary(report, input)) return false
    if (input.cabin && normalizeCommunityCabin(report.cabin) !== normalizeCommunityCabin(input.cabin)) return false
    return true
  })
  if (!matchingReports.length) return null
  const groups = aggregateCommunityLoadReports(matchingReports)
  return groups.sort((a, b) =>
    Number(b.isRecent) - Number(a.isRecent) ||
    b.confidenceScore - a.confidenceScore ||
    b.freshnessScore - a.freshnessScore ||
    b.reportCount - a.reportCount ||
    Date.parse(b.latestReport?.createdAt || '') - Date.parse(a.latestReport?.createdAt || '')
  )[0] || null
}

export function communityLoadMatchesItinerary(report: CommunityLoadReport, input: { flightNumber: string; route: string; date?: string }) {
  const reportFlight = normalizeCommunityFlightNumber(report.flightNumber)
  const targetFlight = normalizeCommunityFlightNumber(input.flightNumber)
  const routeMatches = report.route.toUpperCase() === input.route.toUpperCase()
    || report.route.toUpperCase().includes(input.route.toUpperCase())
    || input.route.toUpperCase().includes(report.route.toUpperCase())
  const flightMatches = reportFlight && targetFlight && (reportFlight === targetFlight || reportFlight.endsWith(targetFlight) || targetFlight.endsWith(reportFlight))
  const dateMatches = !input.date || !report.date || report.date === input.date || input.date === 'Flexible'
  return dateMatches && (flightMatches || routeMatches)
}

export function communityLoadSummaryForItinerary(reports: CommunityLoadReport[], input: { flightNumber: string; route: string; date?: string }): CommunityLoadSummary {
  const matchingReports = reports
    .filter((report) => communityLoadMatchesItinerary(report, input))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const latestReport = matchingReports[0] || null
  const averageTrustScore = matchingReports.length
    ? clamp(matchingReports.reduce((total, report) => total + report.sourceTrustScore, 0) / matchingReports.length, 0, 100)
    : 0
  return {
    latestReport,
    reportCount: matchingReports.length,
    averageTrustScore,
    freshness: latestReport ? communityLoadFreshness(latestReport.createdAt) : null
  }
}

export const communityScoringSignalArchitecture = {
  communityLoads: 'Structured flight/date/cabin load observations with source trust, report count, and freshness.',
  historicalOutcomes: 'Future scoring can compare boarded_result and missed_result against saved trip outcomes.',
  recoveryOptions: 'Future scoring can combine load pressure with same-day alternatives and backup availability.',
  carrierPerformance: 'Future scoring can weight contributor-confirmed loads by carrier reliability and source coverage.',
  routeComplexity: 'Future scoring can dampen confidence on multi-leg routes even when a single leg has favorable loads.'
} as const

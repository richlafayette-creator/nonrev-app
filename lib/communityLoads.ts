export const communityLoadsStorageKey = 'nonrevy.communityLoads'
export const communityContributorReputationStorageKey = 'nonrevy.communityLoadContributorReputation'

export type CommunityLoadFreshness = 'Fresh' | 'Recent' | 'Stale'

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
  createdAt: string
}

export type CommunityLoadContributorReputation = {
  contributorId: string
  totalReports: number
  acceptedReports: number
  trustScore: number
  updatedAt: string
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
  return 'Stale'
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

export function initialCommunityContributorReputation(contributorId = defaultContributorId): CommunityLoadContributorReputation {
  return {
    contributorId,
    totalReports: 0,
    acceptedReports: 0,
    trustScore: 50,
    updatedAt: new Date().toISOString()
  }
}

function migrateReputation(raw: Partial<CommunityLoadContributorReputation> | null | undefined, contributorId = defaultContributorId): CommunityLoadContributorReputation {
  return {
    contributorId: String(raw?.contributorId || contributorId),
    totalReports: clamp(safeNumber(raw?.totalReports), 0, 999_999),
    acceptedReports: clamp(safeNumber(raw?.acceptedReports), 0, 999_999),
    trustScore: clamp(safeNumber(raw?.trustScore, 50), 0, 100),
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
  return nextReputation
}

export function updateCommunityContributorReputation(options: { contributorId?: string; accepted?: boolean } = {}) {
  const current = loadCommunityContributorReputation(options.contributorId || defaultContributorId)
  const totalReports = current.totalReports + 1
  const acceptedReports = current.acceptedReports + (options.accepted === false ? 0 : 1)
  const acceptanceRate = totalReports ? acceptedReports / totalReports : 1
  const trustScore = clamp(50 + acceptanceRate * 35 + Math.min(totalReports, 30) * 0.5 - (totalReports - acceptedReports) * 8, 0, 100)
  return saveCommunityContributorReputation({
    ...current,
    totalReports,
    acceptedReports,
    trustScore,
    updatedAt: new Date().toISOString()
  })
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
    createdAt
  }
}

export function loadCommunityLoads() {
  return readJsonArray<Partial<CommunityLoadReport>>(communityLoadsStorageKey)
    .map(migrateReport)
    .filter((report): report is CommunityLoadReport => Boolean(report))
}

export function saveCommunityLoadReport(submission: CommunityLoadSubmission) {
  if (typeof window === 'undefined') return null
  const contributorId = submission.contributorId || defaultContributorId
  const reputation = updateCommunityContributorReputation({ contributorId, accepted: true })
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
    createdAt
  }
  const reports = [report, ...loadCommunityLoads()]
  writeJson(communityLoadsStorageKey, reports)
  window.dispatchEvent(new Event('nonrevy-community-loads-updated'))
  return report
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

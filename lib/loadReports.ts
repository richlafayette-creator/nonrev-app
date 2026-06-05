import { deliverNotification } from './notificationDelivery'

export const loadReportsStorageKey = 'nonrevy.verifiedLoadReports'

export type LoadStatus = 'Seats open' | 'Looks workable' | 'Tight' | 'Full' | 'Unknown'
export type LoadReportConfidenceLevel = 'Low' | 'Medium' | 'High'

export type LoadReport = {
  id: string
  carrier: string
  airline: string
  flightNumber: string
  route: string
  origin: string
  destination: string
  date: string
  loadStatus: LoadStatus
  seatsAvailableEstimate: number | null
  standbysClearedEstimate: number | null
  confidenceLevel: LoadReportConfidenceLevel
  notes: string
  verified: boolean
  contributorTrustScore: number
  trustedWeight: number
  reportTrustScore: number
  recencyWeight: number
  createdAt: string
}

export const loadStatusOptions: LoadStatus[] = ['Seats open', 'Looks workable', 'Tight', 'Full', 'Unknown']
export const loadReportConfidenceOptions: LoadReportConfidenceLevel[] = ['Low', 'Medium', 'High']

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function normalizeAirportCode(value: string) {
  const match = value.trim().toUpperCase().match(/\b[A-Z]{3}\b/)
  return match?.[0] || ''
}

export function normalizeFlightNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export function routeFromAirports(origin: string, destination: string) {
  const normalizedOrigin = normalizeAirportCode(origin)
  const normalizedDestination = normalizeAirportCode(destination)
  if (normalizedOrigin && normalizedDestination) return `${normalizedOrigin} → ${normalizedDestination}`
  return ''
}

export function trustedContributorWeight(trustScore: number) {
  if (trustScore >= 80) return 1.5
  if (trustScore >= 50) return 1.25
  return 1
}

export function confidenceLevelWeight(level: LoadReportConfidenceLevel) {
  if (level === 'High') return 1
  if (level === 'Medium') return 0.78
  return 0.55
}

export function loadReportRecencyWeight(createdAt: string, now = new Date()) {
  const createdTime = Date.parse(createdAt)
  if (!Number.isFinite(createdTime)) return 0.5
  const ageDays = Math.max(0, (now.getTime() - createdTime) / 86_400_000)
  if (ageDays <= 1) return 1
  if (ageDays <= 3) return 0.88
  if (ageDays <= 7) return 0.72
  if (ageDays <= 14) return 0.55
  if (ageDays <= 30) return 0.36
  return 0.2
}

export function calculateReportTrustScore(input: {
  contributorTrustScore: number
  confidenceLevel: LoadReportConfidenceLevel
  seatsAvailableEstimate?: number | null
  standbysClearedEstimate?: number | null
  flightNumber?: string
  origin?: string
  destination?: string
  date?: string
}) {
  const contributorComponent = clamp(input.contributorTrustScore, 0, 100) * 0.52
  const confidenceComponent = confidenceLevelWeight(input.confidenceLevel) * 24
  const structuredFields = [
    Boolean(input.flightNumber),
    Boolean(normalizeAirportCode(input.origin || '')),
    Boolean(normalizeAirportCode(input.destination || '')),
    Boolean(input.date),
    typeof input.seatsAvailableEstimate === 'number',
    typeof input.standbysClearedEstimate === 'number'
  ].filter(Boolean).length
  const completenessComponent = (structuredFields / 6) * 24
  return clamp(Math.round(contributorComponent + confidenceComponent + completenessComponent), 1, 100)
}

export function effectiveLoadReportWeight(report: LoadReport, now = new Date()) {
  return Number(((report.trustedWeight || trustedContributorWeight(report.contributorTrustScore)) * confidenceLevelWeight(report.confidenceLevel || 'Medium') * loadReportRecencyWeight(report.createdAt, now)).toFixed(2))
}

export function loadReportSignal(report: LoadReport, now = new Date()) {
  const weight = effectiveLoadReportWeight(report, now)
  const seats = report.seatsAvailableEstimate
  const cleared = report.standbysClearedEstimate
  const structuredSignal = typeof seats === 'number' && typeof cleared === 'number'
    ? clamp((seats - cleared) * 0.55, -5, 5)
    : 0
  let statusSignal = 0
  if (report.loadStatus === 'Seats open') statusSignal = 3
  if (report.loadStatus === 'Looks workable') statusSignal = 1.5
  if (report.loadStatus === 'Tight') statusSignal = -2
  if (report.loadStatus === 'Full') statusSignal = -5
  return (statusSignal + structuredSignal) * weight
}

export function loadReportProbability(report: LoadReport) {
  const seats = report.seatsAvailableEstimate
  const cleared = report.standbysClearedEstimate
  if (typeof seats === 'number' && typeof cleared === 'number') {
    const seatMargin = seats - cleared
    if (seatMargin >= 10) return 90
    if (seatMargin >= 5) return 82
    if (seatMargin >= 1) return 70
    if (seatMargin === 0) return 55
    if (seatMargin >= -5) return 42
    return 28
  }

  if (report.loadStatus === 'Seats open') return 88
  if (report.loadStatus === 'Looks workable') return 74
  if (report.loadStatus === 'Tight') return 52
  if (report.loadStatus === 'Full') return 28
  return 62
}

export function loadReportSummary(report: LoadReport) {
  const seatText = typeof report.seatsAvailableEstimate === 'number' ? `${report.seatsAvailableEstimate} seat${report.seatsAvailableEstimate === 1 ? '' : 's'} est.` : 'Seats unknown'
  const standbyText = typeof report.standbysClearedEstimate === 'number' ? `${report.standbysClearedEstimate} standby${report.standbysClearedEstimate === 1 ? '' : 's'} est.` : 'Standbys unknown'
  return `${report.airline || report.carrier} ${report.flightNumber} · ${report.origin || '???'} → ${report.destination || '???'} · ${report.date} · ${seatText} · ${standbyText} · ${report.confidenceLevel} confidence`
}

function legacyRouteParts(route: string) {
  const matches = route.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  return {
    origin: matches[0] || '',
    destination: matches[matches.length - 1] || ''
  }
}

function migrateReport(raw: Partial<LoadReport>): LoadReport | null {
  if (!raw || typeof raw !== 'object') return null
  const legacy = legacyRouteParts(String(raw.route || ''))
  const origin = normalizeAirportCode(String(raw.origin || legacy.origin || ''))
  const destination = normalizeAirportCode(String(raw.destination || legacy.destination || ''))
  const route = routeFromAirports(origin, destination) || String(raw.route || 'Route TBD').toUpperCase()
  const confidenceLevel = (raw.confidenceLevel === 'Low' || raw.confidenceLevel === 'Medium' || raw.confidenceLevel === 'High') ? raw.confidenceLevel : 'Medium'
  const contributorTrustScore = Number.isFinite(raw.contributorTrustScore) ? Number(raw.contributorTrustScore) : 50
  const createdAt = raw.createdAt || new Date().toISOString()
  const migrated: LoadReport = {
    id: String(raw.id || `${raw.carrier || raw.airline || 'report'}-${raw.flightNumber || Date.now()}`),
    carrier: String(raw.carrier || raw.airline || 'Unknown carrier'),
    airline: String(raw.airline || raw.carrier || 'Unknown carrier'),
    flightNumber: normalizeFlightNumber(String(raw.flightNumber || 'TBD')) || 'TBD',
    route,
    origin,
    destination,
    date: String(raw.date || 'Date TBD'),
    loadStatus: loadStatusOptions.includes(raw.loadStatus as LoadStatus) ? raw.loadStatus as LoadStatus : 'Unknown',
    seatsAvailableEstimate: typeof raw.seatsAvailableEstimate === 'number' ? raw.seatsAvailableEstimate : null,
    standbysClearedEstimate: typeof raw.standbysClearedEstimate === 'number' ? raw.standbysClearedEstimate : null,
    confidenceLevel,
    notes: String(raw.notes || ''),
    verified: raw.verified !== false,
    contributorTrustScore,
    trustedWeight: Number.isFinite(raw.trustedWeight) ? Number(raw.trustedWeight) : trustedContributorWeight(contributorTrustScore),
    reportTrustScore: Number.isFinite(raw.reportTrustScore) ? Number(raw.reportTrustScore) : calculateReportTrustScore({
      contributorTrustScore,
      confidenceLevel,
      seatsAvailableEstimate: typeof raw.seatsAvailableEstimate === 'number' ? raw.seatsAvailableEstimate : null,
      standbysClearedEstimate: typeof raw.standbysClearedEstimate === 'number' ? raw.standbysClearedEstimate : null,
      flightNumber: String(raw.flightNumber || ''),
      origin,
      destination,
      date: String(raw.date || '')
    }),
    recencyWeight: loadReportRecencyWeight(createdAt),
    createdAt
  }
  return migrated
}

export function loadLoadReports() {
  if (typeof window === 'undefined') return []

  try {
    const storedReports = window.localStorage.getItem(loadReportsStorageKey)
    if (!storedReports) return []
    const reports = JSON.parse(storedReports)
    return Array.isArray(reports) ? reports.map(migrateReport).filter((report): report is LoadReport => Boolean(report)) : []
  } catch {
    return []
  }
}

export function saveLoadReport(report: Omit<LoadReport, 'id' | 'verified' | 'trustedWeight' | 'createdAt' | 'reportTrustScore' | 'recencyWeight' | 'route' | 'carrier'> & { carrier?: string; route?: string }) {
  if (typeof window === 'undefined') return null

  const createdAt = new Date().toISOString()
  const origin = normalizeAirportCode(report.origin)
  const destination = normalizeAirportCode(report.destination)
  const airline = report.airline.trim() || report.carrier?.trim() || 'Unknown carrier'
  const flightNumber = normalizeFlightNumber(report.flightNumber) || 'TBD'
  const confidenceLevel = report.confidenceLevel || 'Medium'
  const nextReport: LoadReport = {
    ...report,
    id: `${airline}-${flightNumber}-${origin}-${destination}-${Date.now()}`,
    carrier: airline,
    airline,
    flightNumber,
    origin,
    destination,
    route: routeFromAirports(origin, destination) || report.route?.trim().toUpperCase() || 'Route TBD',
    verified: true,
    trustedWeight: trustedContributorWeight(report.contributorTrustScore),
    reportTrustScore: calculateReportTrustScore({
      contributorTrustScore: report.contributorTrustScore,
      confidenceLevel,
      seatsAvailableEstimate: report.seatsAvailableEstimate,
      standbysClearedEstimate: report.standbysClearedEstimate,
      flightNumber,
      origin,
      destination,
      date: report.date
    }),
    recencyWeight: loadReportRecencyWeight(createdAt),
    createdAt
  }
  const reports = [nextReport, ...loadLoadReports()]
  window.localStorage.setItem(loadReportsStorageKey, JSON.stringify(reports))
  deliverNotification({
    eventType: 'community-load-reports',
    title: `Community load report: ${nextReport.origin} → ${nextReport.destination}`,
    body: loadReportSummary(nextReport),
    targetId: nextReport.id,
    targetLabel: `${nextReport.origin} → ${nextReport.destination}`,
    source: 'community-load-report',
    eventKey: `community-load-report:${nextReport.flightNumber}:${nextReport.origin}:${nextReport.destination}:${nextReport.date}:${nextReport.createdAt}`,
    details: [
      `Airline: ${nextReport.airline}`,
      `Seats available estimate: ${nextReport.seatsAvailableEstimate ?? 'unknown'}`,
      `Standbys cleared estimate: ${nextReport.standbysClearedEstimate ?? 'unknown'}`,
      `Report trust: ${nextReport.reportTrustScore}/100`,
      `Recency weight: ${nextReport.recencyWeight}x`
    ]
  })
  window.dispatchEvent(new Event('nonrevy-load-reports-updated'))
  return nextReport
}

export function loadReportStats(reports: LoadReport[]) {
  const verifiedReportsCount = reports.filter((report) => report.verified).length
  const weightedReportScore = reports.reduce((total, report) => total + (report.verified ? effectiveLoadReportWeight(report) : 0), 0)
  const trustedSignal = Number(weightedReportScore.toFixed(2))
  const averageTrustScore = reports.length
    ? Math.round(reports.reduce((total, report) => total + report.contributorTrustScore, 0) / reports.length)
    : 0
  const averageReportTrustScore = reports.length
    ? Math.round(reports.reduce((total, report) => total + report.reportTrustScore, 0) / reports.length)
    : 0
  const averageRecencyWeight = reports.length
    ? Number((reports.reduce((total, report) => total + loadReportRecencyWeight(report.createdAt), 0) / reports.length).toFixed(2))
    : 0

  return {
    totalReports: reports.length,
    verifiedReportsCount,
    trustedSignal,
    averageTrustScore,
    averageReportTrustScore,
    averageRecencyWeight
  }
}

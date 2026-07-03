export type CommunitySignalType =
  | 'made_it'
  | 'missed_it'
  | 'open_seats_reported'
  | 'standby_cleared_count'
  | 'standby_not_cleared_count'
  | 'gate_agent_note'
  | 'weight_restriction'
  | 'aircraft_swap'
  | 'boarding_closed'
  | 'delay_observed'
  | 'load_request_response'
  | 'general_note'

export type CommunitySignalConfidence = 'low' | 'medium' | 'high' | 'unknown'
export type CommunityReportSourceType = 'verified_employee' | 'trusted_user' | 'community' | 'anonymous'
export type CommunitySignalStatus = 'favorable' | 'mixed' | 'limited' | 'unavailable' | 'unknown'

export type CommunityReport = {
  flightNumber: string
  carrier: string
  origin: string
  destination: string
  departureDate: string
  reportedAt: string
  reportType: CommunitySignalType
  reportedValue?: string | number | boolean | null
  confidence: CommunitySignalConfidence
  sourceType: CommunityReportSourceType
  notes?: string
  expiresAt?: string
}

export type CommunitySignal = {
  signalType: CommunitySignalType
  status: CommunitySignalStatus
  weight: number
  confidence: CommunitySignalConfidence
  reportCount: number
  supportingReports: number
  conflictingReports: number
  summary: string
  limitations: string[]
  observedAt: string
  expiresAt?: string
}

export type FlightCommunitySummary = {
  flightNumber: string
  carrier: string
  origin: string
  destination: string
  departureDate: string
  status: CommunitySignalStatus
  confidence: CommunitySignalConfidence
  reportCount: number
  activeReportCount: number
  expiredReportCount: number
  conflictingReportCount: number
  signals: CommunitySignal[]
  latestReportedAt?: string
  expiresAt?: string
  summary: string
  limitations: string[]
  observedAt: string
}

type WeightedReport = {
  report: CommunityReport
  weight: number
  polarity: number
}

const sourceWeights: Record<CommunityReportSourceType, number> = {
  verified_employee: 1,
  trusted_user: 0.74,
  community: 0.45,
  anonymous: 0.2
}

const confidenceWeights: Record<CommunitySignalConfidence, number> = {
  high: 1,
  medium: 0.72,
  low: 0.42,
  unknown: 0.3
}

const favorableTypes = new Set<CommunitySignalType>(['made_it', 'open_seats_reported', 'standby_cleared_count'])
const cautionTypes = new Set<CommunitySignalType>(['missed_it', 'standby_not_cleared_count', 'weight_restriction', 'aircraft_swap', 'boarding_closed'])
const shortLivedTypes = new Set<CommunitySignalType>(['open_seats_reported', 'standby_cleared_count', 'standby_not_cleared_count', 'boarding_closed', 'load_request_response'])

function hoursForReportType(type: CommunitySignalType) {
  if (shortLivedTypes.has(type)) return 2
  if (type === 'delay_observed' || type === 'aircraft_swap' || type === 'weight_restriction') return 3
  return 4
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString()
}

export function communityReportExpiresAt(report: CommunityReport) {
  return report.expiresAt || addHours(new Date(report.reportedAt), hoursForReportType(report.reportType))
}

export function isCommunityReportExpired(report: CommunityReport, now = new Date()) {
  return new Date(communityReportExpiresAt(report)).getTime() <= now.getTime()
}

function recencyWeight(report: CommunityReport, now: Date) {
  const reportedAt = new Date(report.reportedAt).getTime()
  if (!Number.isFinite(reportedAt)) return 0.2
  const ageMinutes = Math.max(0, (now.getTime() - reportedAt) / 60000)
  if (ageMinutes <= 30) return 1
  if (ageMinutes <= 90) return 0.78
  if (ageMinutes <= 180) return 0.48
  return 0.24
}

function polarityFor(report: CommunityReport) {
  if (favorableTypes.has(report.reportType)) return 1
  if (cautionTypes.has(report.reportType)) return -1
  return 0
}

export function communityReportWeight(report: CommunityReport, now = new Date()) {
  if (isCommunityReportExpired(report, now)) return 0
  return Number((sourceWeights[report.sourceType] * confidenceWeights[report.confidence] * recencyWeight(report, now)).toFixed(3))
}

function confidenceFromScore(score: number, conflictRatio: number): CommunitySignalConfidence {
  if (score >= 1.4 && conflictRatio < 0.25) return 'high'
  if (score >= 0.55 && conflictRatio < 0.45) return 'medium'
  if (score > 0) return 'low'
  return 'unknown'
}

function statusFromScore(score: number, conflictRatio: number): CommunitySignalStatus {
  if (score === 0) return 'unknown'
  if (conflictRatio >= 0.35) return 'mixed'
  if (score >= 0.45) return 'favorable'
  if (score <= -0.75) return 'unavailable'
  if (score < -0.15) return 'limited'
  return 'mixed'
}

export function communitySignalLabel(status: CommunitySignalStatus) {
  if (status === 'favorable') return 'Recent reports favorable'
  if (status === 'mixed') return 'Recent reports mixed'
  if (status === 'limited') return 'Recent reports limited'
  if (status === 'unavailable') return 'Recent reports unavailable'
  return 'Recent reports unknown'
}

export function communitySignalScoreAdjustment(summary?: FlightCommunitySummary) {
  if (!summary || summary.activeReportCount === 0) return 0
  const confidenceMultiplier = summary.confidence === 'high' ? 1 : summary.confidence === 'medium' ? 0.7 : summary.confidence === 'low' ? 0.35 : 0
  const base = summary.status === 'favorable' ? 3 : summary.status === 'mixed' ? -1 : summary.status === 'limited' ? -2 : summary.status === 'unavailable' ? -4 : 0
  return Number((base * confidenceMultiplier).toFixed(2))
}

function summarizeSignal(type: CommunitySignalType, reports: WeightedReport[], now: Date): CommunitySignal {
  const totalWeight = reports.reduce((sum, item) => sum + item.weight, 0)
  const weightedPolarity = reports.reduce((sum, item) => sum + item.weight * item.polarity, 0)
  const positive = reports.filter((item) => item.polarity > 0).reduce((sum, item) => sum + item.weight, 0)
  const negative = reports.filter((item) => item.polarity < 0).reduce((sum, item) => sum + item.weight, 0)
  const conflictRatio = totalWeight ? Math.min(positive, negative) / totalWeight : 0
  const status = statusFromScore(weightedPolarity, conflictRatio)
  const confidence = confidenceFromScore(totalWeight, conflictRatio)
  const expiresAt = reports.map((item) => communityReportExpiresAt(item.report)).sort()[0]

  return {
    signalType: type,
    status,
    weight: Number(weightedPolarity.toFixed(2)),
    confidence,
    reportCount: reports.length,
    supportingReports: reports.filter((item) => item.polarity >= 0).length,
    conflictingReports: reports.filter((item) => item.polarity < 0).length,
    summary: `${communitySignalLabel(status)} from ${reports.length} active ${type.replace(/_/g, ' ')} report${reports.length === 1 ? '' : 's'}.`,
    limitations: [
      'Community reports expire quickly and may be incomplete.',
      'This is not confirmed standby, non-rev, upgrade, or pass-rider clearance.'
    ],
    observedAt: now.toISOString(),
    expiresAt
  }
}

export function summarizeFlightCommunityReports(reports: CommunityReport[], now = new Date()): FlightCommunitySummary | undefined {
  if (!reports.length) return undefined
  const active: WeightedReport[] = []
  let expiredReportCount = 0

  for (const report of reports) {
    const weight = communityReportWeight(report, now)
    if (weight <= 0) {
      expiredReportCount += 1
      continue
    }
    active.push({ report, weight, polarity: polarityFor(report) })
  }

  const sample = reports[0]
  const observedAt = now.toISOString()
  if (!active.length) {
    return {
      flightNumber: sample.flightNumber,
      carrier: sample.carrier,
      origin: sample.origin,
      destination: sample.destination,
      departureDate: sample.departureDate,
      status: 'unknown',
      confidence: 'unknown',
      reportCount: reports.length,
      activeReportCount: 0,
      expiredReportCount,
      conflictingReportCount: 0,
      signals: [],
      summary: 'Community reports are unavailable or expired.',
      limitations: [
        'Reports expire quickly and no active community signal should be inferred.',
        'Community intelligence must never be treated as guaranteed standby availability.'
      ],
      observedAt
    }
  }

  const byType = active.reduce((groups, item) => {
    const current = groups.get(item.report.reportType) || []
    current.push(item)
    groups.set(item.report.reportType, current)
    return groups
  }, new Map<CommunitySignalType, WeightedReport[]>())
  const signals = Array.from(byType.entries()).map(([type, items]) => summarizeSignal(type, items, now))
  const totalWeight = active.reduce((sum, item) => sum + item.weight, 0)
  const weightedPolarity = active.reduce((sum, item) => sum + item.weight * item.polarity, 0)
  const positive = active.filter((item) => item.polarity > 0).reduce((sum, item) => sum + item.weight, 0)
  const negative = active.filter((item) => item.polarity < 0).reduce((sum, item) => sum + item.weight, 0)
  const conflictRatio = totalWeight ? Math.min(positive, negative) / totalWeight : 0
  const status = statusFromScore(weightedPolarity, conflictRatio)
  const confidence = confidenceFromScore(totalWeight, conflictRatio)
  const latestReportedAt = active.map((item) => item.report.reportedAt).sort().at(-1)
  const expiresAt = active.map((item) => communityReportExpiresAt(item.report)).sort()[0]

  return {
    flightNumber: sample.flightNumber,
    carrier: sample.carrier,
    origin: sample.origin,
    destination: sample.destination,
    departureDate: sample.departureDate,
    status,
    confidence,
    reportCount: reports.length,
    activeReportCount: active.length,
    expiredReportCount,
    conflictingReportCount: signals.reduce((sum, signal) => sum + signal.conflictingReports, 0),
    signals,
    latestReportedAt,
    expiresAt,
    summary: `${communitySignalLabel(status)} from ${active.length} active report${active.length === 1 ? '' : 's'} at ${confidence} confidence. Community intelligence is advisory only.`,
    limitations: [
      'Recent verified reports carry more weight; anonymous reports carry low weight.',
      'Conflicting reports reduce confidence.',
      'Community reports are not confirmed standby, non-rev, upgrade, or pass-rider availability.'
    ],
    observedAt
  }
}

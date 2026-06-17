import type { BackupAvailability } from './airportIntelligence'
import type { CommunityLoadIntelligence } from './communityLoads'
import type { TravelerProfileScaffold } from './travelerProfile'

export type PersonalSuccessConfidence = 'Low' | 'Medium' | 'High'
export type PersonalSuccessPredictorInput = {
  airline: string
  route: string
  passPriority: string
  travelerType: TravelerProfileScaffold['travelerType']
  travelerProfile: TravelerProfileScaffold
  communityLoad?: {
    seatsAvailable?: number
    standbyCount?: number
    status?: 'verified' | 'trusted' | 'weak' | 'stale' | 'missing'
    confidence?: CommunityLoadIntelligence['communityConfidence']
    reportCount?: number
    freshness?: CommunityLoadIntelligence['freshness']
    detail?: string
  }
  historicalRouteBehavior: {
    successRate: number
    score: number
    reportCount: number
  }
  departureDateTime: string
  backupOptionCount: number
  recoveryNetworkStrength: 'Strong' | 'Moderate' | 'Limited'
  routeFrequency: 'High' | 'Medium' | 'Low'
  backupAvailability: BackupAvailability | string
  connectionCount: number
  routeConfidenceScore: number
}

export type PersonalSuccessPrediction = {
  probability: number
  confidence: PersonalSuccessConfidence
  confidenceScore: number
  why: string[]
  inputsUsed: string[]
}

function clamp(value: number, min = 1, max = 95) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function conservativeRound(value: number) {
  return Math.max(0, Math.min(100, Math.round(value / 5) * 5))
}

function priorityAdjustment(priority: string, travelerType: TravelerProfileScaffold['travelerType']) {
  const normalized = priority.toUpperCase()
  let score = 0
  if (normalized.includes('SA1') || normalized.includes('A1') || normalized.includes('D1')) score += 7
  else if (normalized.includes('SA2') || normalized.includes('A2') || normalized.includes('D2')) score += 4
  else if (normalized.includes('SA3') || normalized.includes('A3') || normalized.includes('D3')) score += 1
  else score -= 4

  if (travelerType === 'Buddy Pass') score -= 11
  else if (travelerType === 'Companion') score -= 7
  else if (travelerType === 'Retiree') score -= 3
  return score
}

function loadSignal(input: PersonalSuccessPredictorInput) {
  const seats = input.communityLoad?.seatsAvailable
  const standby = input.communityLoad?.standbyCount
  const status = input.communityLoad?.status || 'missing'
  if (typeof seats !== 'number' || typeof standby !== 'number') {
    return { adjustment: -10, cap: 68, reason: 'No current seat-and-standby load is available, so the personal estimate stays capped.' }
  }
  const margin = seats - standby
  const trusted = status === 'verified' || status === 'trusted'
  let cap = trusted ? 92 : 72
  let adjustment = trusted ? 0 : -8

  if (margin >= 10) adjustment += 18
  else if (margin >= 4) adjustment += 10
  else if (margin > 0) adjustment -= 2
  else if (margin === 0) adjustment -= 20
  else adjustment -= 34

  if (standby >= seats) cap = Math.min(cap, margin === 0 ? 48 : 36)
  const reason = `Recent reports show ${seats} open seat${seats === 1 ? '' : 's'} and ${standby} listed standby${standby === 1 ? '' : 's'}.`
  return { adjustment, cap, reason }
}

function departureProximityAdjustment(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return { adjustment: -2, confidence: -4, label: 'Departure timing is not confirmed.' }
  const hours = (parsed - Date.now()) / 36e5
  if (hours < 0) return { adjustment: -8, confidence: -10, label: 'Departure time appears stale or already passed.' }
  if (hours <= 6) return { adjustment: -6, confidence: 4, label: 'Departure is inside 6 hours, so load data matters more.' }
  if (hours <= 24) return { adjustment: -2, confidence: 6, label: 'Departure is within 24 hours.' }
  if (hours <= 72) return { adjustment: 0, confidence: 2, label: 'Departure is close enough for planning signals.' }
  return { adjustment: -5, confidence: -5, label: 'Departure is more than 72 hours out, so the estimate is intentionally conservative.' }
}

function recoveryAdjustment(input: PersonalSuccessPredictorInput) {
  let score = 0
  if (input.backupOptionCount >= 4) score += 9
  else if (input.backupOptionCount >= 2) score += 4
  else score -= 8

  if (input.recoveryNetworkStrength === 'Strong') score += 8
  else if (input.recoveryNetworkStrength === 'Moderate') score += 2
  else score -= 9

  if (input.routeFrequency === 'High') score += 6
  else if (input.routeFrequency === 'Medium') score += 1
  else score -= 7

  if (input.connectionCount === 0) score += 4
  else if (input.connectionCount > 1) score -= 8
  else score -= 3

  return score
}

function confidenceScore(input: PersonalSuccessPredictorInput, loadHasCounts: boolean, departureConfidence: number) {
  let score = 22 + departureConfidence
  const status = input.communityLoad?.status || 'missing'
  if (status === 'verified') score += 34
  else if (status === 'trusted') score += 27
  else if (status === 'weak') score += 10
  else if (status === 'stale') score += 4

  if (loadHasCounts) score += 16
  if ((input.communityLoad?.reportCount || 0) >= 2) score += 8
  if (input.historicalRouteBehavior.reportCount >= 8) score += 10
  else if (input.historicalRouteBehavior.reportCount >= 3) score += 5
  if (input.routeFrequency !== 'Low') score += 5
  if (input.routeConfidenceScore >= 72) score += 4
  return clamp(score, 1, 100)
}

function confidenceLevel(score: number): PersonalSuccessConfidence {
  if (score >= 75) return 'High'
  if (score >= 48) return 'Medium'
  return 'Low'
}

function historicalReason(input: PersonalSuccessPredictorInput) {
  const rate = conservativeRound(input.historicalRouteBehavior.successRate)
  if (rate >= 75) return 'Historical route performance is favorable.'
  if (rate >= 55) return 'Historical route performance is mixed but usable.'
  return 'Historical route performance is unfavorable, so the estimate is reduced.'
}

function backupReason(input: PersonalSuccessPredictorInput) {
  if (input.backupOptionCount >= 3) return `${input.backupOptionCount} same-day backup options are available.`
  if (input.backupOptionCount >= 1) return `${input.backupOptionCount} backup option${input.backupOptionCount === 1 ? '' : 's'} available; recovery is not deep.`
  return 'No meaningful same-day backup cushion is visible.'
}

export function calculatePersonalSuccessPrediction(input: PersonalSuccessPredictorInput): PersonalSuccessPrediction {
  const load = loadSignal(input)
  const departure = departureProximityAdjustment(input.departureDateTime)
  const historicalBase = input.historicalRouteBehavior.successRate * 0.46 + input.historicalRouteBehavior.score * 0.18 + input.routeConfidenceScore * 0.16 + 12
  const personalScore = historicalBase + priorityAdjustment(input.passPriority, input.travelerType) + load.adjustment + recoveryAdjustment(input) + departure.adjustment
  const rawProbability = clamp(Math.min(personalScore, load.cap), 1, 95)
  const confidenceRaw = confidenceScore(input, typeof input.communityLoad?.seatsAvailable === 'number' && typeof input.communityLoad?.standbyCount === 'number', departure.confidence)
  const confidence = confidenceLevel(confidenceRaw)
  const confidenceCap = confidence === 'High' ? 95 : confidence === 'Medium' ? 80 : 60
  const probability = conservativeRound(Math.min(rawProbability, confidenceCap))

  return {
    probability,
    confidence,
    confidenceScore: confidenceRaw,
    why: [load.reason, backupReason(input), historicalReason(input)].slice(0, 3),
    inputsUsed: [
      `Airline selected: ${input.airline}`,
      `Pass priority/class: ${input.passPriority} · ${input.travelerType}`,
      `Community load data: ${input.communityLoad?.detail || input.communityLoad?.status || 'missing'}`,
      `Historical route behavior: ${conservativeRound(input.historicalRouteBehavior.successRate)}% success · score ${input.historicalRouteBehavior.score}/100 · ${input.historicalRouteBehavior.reportCount} reports`,
      `Departure proximity: ${departure.label}`,
      `Backup options: ${input.backupOptionCount}`,
      `Recovery network strength: ${input.recoveryNetworkStrength}`,
      `Route frequency: ${input.routeFrequency}`
    ]
  }
}

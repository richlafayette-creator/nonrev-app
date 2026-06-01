import { tripOutcomeStats, type TripOutcome } from './tripOutcomes'

export const verifiedLoadReportsStorageKey = 'nonrevy.verifiedLoadReports'

export type ContributorBadge = 'New Contributor' | 'Trusted Contributor' | 'Elite Contributor'

export type TrustScoreScaffold = {
  trustScore: number
  verifiedOutcomes: number
  verifiedLoadReports: number
  communityContributionLevel: ContributorBadge
  badges: { label: ContributorBadge; active: boolean; threshold: number }[]
  predictionImpact: string[]
}

export function loadVerifiedLoadReportCount() {
  if (typeof window === 'undefined') return 0

  try {
    const storedReports = window.localStorage.getItem(verifiedLoadReportsStorageKey)
    if (!storedReports) return 0
    const reports = JSON.parse(storedReports)
    return Array.isArray(reports) ? reports.length : 0
  } catch {
    return 0
  }
}

export function calculateTrustScore(outcomes: TripOutcome[], verifiedLoadReports: number): TrustScoreScaffold {
  const outcomeStats = tripOutcomeStats(outcomes)
  const verifiedOutcomes = outcomeStats.outcomeCount
  const successSignal = Math.round(outcomeStats.successRate * 0.25)
  const outcomeSignal = Math.min(35, verifiedOutcomes * 7)
  const loadReportSignal = Math.min(25, verifiedLoadReports * 5)
  const trustScore = Math.min(100, 15 + successSignal + outcomeSignal + loadReportSignal)
  const communityContributionLevel =
    trustScore >= 80 ? 'Elite Contributor' : trustScore >= 50 ? 'Trusted Contributor' : 'New Contributor'

  return {
    trustScore,
    verifiedOutcomes,
    verifiedLoadReports,
    communityContributionLevel,
    badges: [
      { label: 'New Contributor', active: trustScore >= 0, threshold: 0 },
      { label: 'Trusted Contributor', active: trustScore >= 50, threshold: 50 },
      { label: 'Elite Contributor', active: trustScore >= 80, threshold: 80 }
    ],
    predictionImpact: [
      'Verified outcomes calibrate whether route recommendations were realistic after travel day conditions played out.',
      'Verified load reports can later weight fresh seat and standby-list signals from trusted contributors more heavily.',
      'Higher trust can reduce noisy community inputs and improve confidence levels for future success probability estimates.'
    ]
  }
}

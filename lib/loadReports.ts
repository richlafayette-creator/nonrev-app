export const loadReportsStorageKey = 'nonrevy.verifiedLoadReports'

export type LoadStatus = 'Seats open' | 'Looks workable' | 'Tight' | 'Full' | 'Unknown'

export type LoadReport = {
  id: string
  carrier: string
  flightNumber: string
  route: string
  date: string
  loadStatus: LoadStatus
  notes: string
  verified: boolean
  contributorTrustScore: number
  trustedWeight: number
  createdAt: string
}

export const loadStatusOptions: LoadStatus[] = ['Seats open', 'Looks workable', 'Tight', 'Full', 'Unknown']

export function trustedContributorWeight(trustScore: number) {
  if (trustScore >= 80) return 1.5
  if (trustScore >= 50) return 1.25
  return 1
}

export function loadLoadReports() {
  if (typeof window === 'undefined') return []

  try {
    const storedReports = window.localStorage.getItem(loadReportsStorageKey)
    if (!storedReports) return []
    const reports = JSON.parse(storedReports)
    return Array.isArray(reports) ? reports as LoadReport[] : []
  } catch {
    return []
  }
}

export function saveLoadReport(report: Omit<LoadReport, 'id' | 'verified' | 'trustedWeight' | 'createdAt'>) {
  if (typeof window === 'undefined') return null

  const nextReport: LoadReport = {
    ...report,
    id: `${report.carrier}-${report.flightNumber}-${Date.now()}`,
    verified: true,
    trustedWeight: trustedContributorWeight(report.contributorTrustScore),
    createdAt: new Date().toISOString()
  }
  const reports = [nextReport, ...loadLoadReports()]
  window.localStorage.setItem(loadReportsStorageKey, JSON.stringify(reports))
  window.dispatchEvent(new Event('nonrevy-load-reports-updated'))
  return nextReport
}

export function loadReportStats(reports: LoadReport[]) {
  const verifiedReportsCount = reports.filter((report) => report.verified).length
  const weightedReportScore = reports.reduce((total, report) => total + (report.verified ? report.trustedWeight : 0), 0)
  const trustedSignal = Number(weightedReportScore.toFixed(2))
  const averageTrustScore = reports.length
    ? Math.round(reports.reduce((total, report) => total + report.contributorTrustScore, 0) / reports.length)
    : 0

  return {
    totalReports: reports.length,
    verifiedReportsCount,
    trustedSignal,
    averageTrustScore
  }
}

import { carrierScoringProfiles, normalizeCarrierFamily, type RouteRecommendation, type SupportedCarrierValue } from './carrierScope'
import { type HistoricalRoute, type historicalRouteStats } from './historicalRoutes'
import { loadReportStats, type LoadReport } from './loadReports'
import { calculateTrustScore } from './reputation'
import { outcomesForCommunityProbability, tripOutcomeStats, type TripOutcome } from './tripOutcomes'
import { travelerProfileAssumptions, type TravelerProfileScaffold } from './travelerProfile'

type CarrierProfile = (typeof carrierScoringProfiles)[Exclude<SupportedCarrierValue, 'all'>]
type HistoricalStats = ReturnType<typeof historicalRouteStats>

export type PredictionEngineInput = {
  carrier: string
  travelerProfile: TravelerProfileScaffold
  carrierProfile: CarrierProfile
  recommendationScope: string
  routeIntelligence: Record<string, string>
  routeRecommendations: RouteRecommendation[]
  historicalStats: HistoricalStats
  loadReports: LoadReport[]
  outcomes: TripOutcome[]
  routeConfidenceScores?: number[]
}

export type PredictionEngineResult = {
  successProbability: number
  confidencePercent: number
  confidenceLevel: 'Low' | 'Medium' | 'Medium-High' | 'High'
  riskCategory: 'Low' | 'Medium-Low' | 'Medium' | 'Medium-High' | 'High'
  explanationBullets: string[]
  whyWeBelieveThis: string[]
  dataSourcesUsed: { label: string; used: boolean; sampleSize: number; impact: string }[]
  sampleSize: {
    total: number
    outcomeHistory: number
    communityLoadReports: number
    historicalRouteReports: number
    historicalRouteSamples: number
    weightedCommunitySample: number
    routeConfidenceSnapshots: number
  }
  communityContributionImpact: {
    newContributorReports: number
    trustedContributorReports: number
    eliteContributorReports: number
    weightedReportSignal: number
    averageContributorTrustScore: number
    currentUserTrustScore: number
    currentUserContributionLevel: string
    summary: string
  }
  placeholderWeights: { label: string; value: string }[]
  inputSummary: {
    travelerProfileSignals: string[]
    carrierDefaultProbability: number
    routeRisk: string
    historicalAverageScore: number
    historicalSuccessRate: number
    communityReportCount: number
    weightedLoadSignal: number
    outcomeCount: number
    outcomeSuccessRate: number
    trustScore: number
    routeConfidenceAverage: number
  }
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function routeRiskPenalty(routeRisk: string) {
  if (routeRisk.includes('High')) return 7
  if (routeRisk.includes('Low')) return -3
  return 2
}

function loadStatusSignal(report: LoadReport) {
  const weightedBase = report.trustedWeight || 1
  if (report.loadStatus === 'Seats open') return 3 * weightedBase
  if (report.loadStatus === 'Looks workable') return 1.5 * weightedBase
  if (report.loadStatus === 'Tight') return -2 * weightedBase
  if (report.loadStatus === 'Full') return -5 * weightedBase
  return 0
}

function loadStatusProbability(report: LoadReport) {
  if (report.loadStatus === 'Seats open') return 88
  if (report.loadStatus === 'Looks workable') return 74
  if (report.loadStatus === 'Tight') return 52
  if (report.loadStatus === 'Full') return 28
  return 62
}

function weightedAverage(values: { value: number; weight: number }[], fallback: number) {
  const totalWeight = values.reduce((total, item) => total + item.weight, 0)
  if (totalWeight === 0) return fallback
  return values.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight
}

function riskCategoryFromProbability(probability: number): PredictionEngineResult['riskCategory'] {
  if (probability >= 82) return 'Low'
  if (probability >= 74) return 'Medium-Low'
  if (probability >= 62) return 'Medium'
  if (probability >= 50) return 'Medium-High'
  return 'High'
}

function confidenceLevel(dataSignals: number, outcomeCount: number): PredictionEngineResult['confidenceLevel'] {
  if (dataSignals >= 7 && outcomeCount >= 5) return 'High'
  if (dataSignals >= 5) return 'Medium-High'
  if (dataSignals >= 3) return 'Medium'
  return 'Low'
}

function confidencePercentFromSample(sampleSize: number, dataSignals: number, weightedCommunitySample: number) {
  const sampleSignal = Math.min(42, sampleSize * 2.2)
  const sourceSignal = Math.min(28, dataSignals * 4)
  const communitySignal = Math.min(15, weightedCommunitySample * 3)
  return clamp(Math.round(15 + sampleSignal + sourceSignal + communitySignal), 1, 99)
}

function carrierDefaultProbability(carrier: SupportedCarrierValue, carrierProfile: CarrierProfile) {
  if (carrier === 'all') {
    return Math.round(average(Object.values(carrierScoringProfiles).map((profile) => profile.successDefaults.probability)))
  }
  return carrierProfile.successDefaults.probability
}

export function calculatePredictionEngine(input: PredictionEngineInput): PredictionEngineResult {
  const carrier = normalizeCarrierFamily(input.carrier)
  const loadStats = loadReportStats(input.loadReports)
  const storedProbabilityOutcomes = outcomesForCommunityProbability(input.outcomes)
  const outcomeStats = tripOutcomeStats(input.outcomes)
  const probabilityOutcomeStats = tripOutcomeStats(storedProbabilityOutcomes)
  const trustScore = calculateTrustScore(input.outcomes, loadStats.verifiedReportsCount)
  const averageRecommendationScore = Math.round(average(input.routeRecommendations.map((recommendation) => recommendation.score)))
  const defaultProbability = carrierDefaultProbability(carrier, input.carrierProfile)
  const routeRisk = input.routeIntelligence['Risk Level'] || input.carrierProfile.successDefaults.riskCategory
  const historicalSampleSize = input.historicalStats.reportCount + input.historicalStats.routes.length
  const weightedCommunitySample = Number(input.loadReports.reduce((total, report) => total + (report.verified ? report.trustedWeight : 0), 0).toFixed(2))
  const routeConfidenceScores = (input.routeConfidenceScores || []).filter((score) => Number.isFinite(score))
  const routeConfidenceAverage = Math.round(average(routeConfidenceScores)) || defaultProbability
  const totalSampleSize = probabilityOutcomeStats.outcomeCount + input.loadReports.length + historicalSampleSize + routeConfidenceScores.length
  const communityProbability = Math.round(weightedAverage(
    input.loadReports.map((report) => ({ value: loadStatusProbability(report), weight: report.verified ? report.trustedWeight : 0.5 })),
    defaultProbability
  ))
  const outcomeProbability = probabilityOutcomeStats.outcomeCount ? probabilityOutcomeStats.successRate : defaultProbability
  const historicalProbability = input.historicalStats.averageSuccessRate || defaultProbability
  const travelerProfileSignal = clamp(
    defaultProbability +
      (input.carrierProfile.label === input.travelerProfile.employeeAirline ? 4 : 0) +
      (input.travelerProfile.passPriority.toUpperCase().includes('SA1') ? 4 : input.travelerProfile.passPriority.toUpperCase().includes('SA2') ? 2 : 0) -
      (input.travelerProfile.travelerType === 'Buddy Pass' ? 7 : input.travelerProfile.travelerType === 'Companion' ? 4 : 0),
    1,
    99
  )
  const reputationSignal = clamp(58 + trustScore.trustScore * 0.34, 1, 99)
  const routeConfidenceSignal = clamp(routeConfidenceAverage, 1, 99)
  const historicalScoreSignal = input.historicalStats.averageScore ? (input.historicalStats.averageScore - 75) * 0.25 : 0
  const historicalSuccessSignal = input.historicalStats.averageSuccessRate ? (input.historicalStats.averageSuccessRate - 70) * 0.35 : 0
  const communityLoadSignal = clamp(input.loadReports.reduce((total, report) => total + loadStatusSignal(report), 0), -8, 8)
  const outcomeSignal = probabilityOutcomeStats.outcomeCount ? (probabilityOutcomeStats.successRate - 65) * 0.22 : 0
  const recommendationSignal = averageRecommendationScore ? (averageRecommendationScore - 78) * 0.3 : 0
  const riskPenalty = routeRiskPenalty(routeRisk)
  const employeeAirlineBoost = carrier !== 'all' && input.carrierProfile.label === input.travelerProfile.employeeAirline ? 3 : 0
  const preferredAirportBoost = input.routeRecommendations.some((recommendation) =>
    [input.travelerProfile.homeAirport, ...input.travelerProfile.preferredAirports].some((airport) => recommendation.route.includes(airport))
  ) ? 2 : 0
  const travelerTypePenalty = input.travelerProfile.travelerType === 'Buddy Pass' ? 5 : input.travelerProfile.travelerType === 'Companion' ? 3 : 0
  const priorityBoost = input.travelerProfile.passPriority.toUpperCase().includes('SA1') ? 3 : input.travelerProfile.passPriority.toUpperCase().includes('SA2') ? 1 : 0
  const rawProbability =
    defaultProbability * 0.2 +
    historicalProbability * 0.2 +
    outcomeProbability * 0.18 +
    communityProbability * 0.16 +
    routeConfidenceSignal * 0.1 +
    travelerProfileSignal * 0.09 +
    reputationSignal * 0.07 +
    averageRecommendationScore * 0.06 +
    historicalScoreSignal +
    historicalSuccessSignal +
    communityLoadSignal +
    outcomeSignal +
    recommendationSignal -
    riskPenalty +
    employeeAirlineBoost +
    preferredAirportBoost +
    priorityBoost -
    travelerTypePenalty
  const successProbability = clamp(Math.round(rawProbability), 1, 99)
  const newContributorReports = input.loadReports.filter((report) => report.contributorTrustScore < 50).length
  const trustedContributorReports = input.loadReports.filter((report) => report.contributorTrustScore >= 50 && report.contributorTrustScore < 80).length
  const eliteContributorReports = input.loadReports.filter((report) => report.contributorTrustScore >= 80).length
  const dataSignals = [
    input.travelerProfile.homeAirport,
    input.carrierProfile.label,
    routeRisk,
    input.historicalStats.routes.length > 0 ? 'historical-routes' : '',
    loadStats.totalReports > 0 ? 'community-load-reports' : '',
    probabilityOutcomeStats.outcomeCount > 0 ? 'outcome-history' : '',
    routeConfidenceScores.length > 0 ? 'route-confidence' : '',
    input.routeRecommendations.length > 0 ? 'route-recommendations' : ''
  ].filter(Boolean).length
  const confidencePercent = confidencePercentFromSample(totalSampleSize, dataSignals, weightedCommunitySample)
  const dataSourcesUsed = [
    {
      label: 'Outcome History',
      used: probabilityOutcomeStats.outcomeCount > 0,
      sampleSize: probabilityOutcomeStats.outcomeCount,
      impact: `${outcomeProbability}% stored outcome calibration from ${outcomeStats.localOutcomeCount} local and ${outcomeStats.databaseOutcomeCount} database outcomes; cancelled trips are retained but excluded from probability math.`
    },
    {
      label: 'Community Load Reports',
      used: loadStats.totalReports > 0,
      sampleSize: loadStats.totalReports,
      impact: `${communityProbability}% weighted load signal; trusted contributors count up to 1.5x.`
    },
    {
      label: 'Historical Route Database',
      used: input.historicalStats.routes.length > 0,
      sampleSize: historicalSampleSize,
      impact: `${historicalProbability}% historical route success from ${input.historicalStats.routes.length} route samples.`
    },
    {
      label: 'Reputation/Trust Scores',
      used: true,
      sampleSize: trustScore.verifiedOutcomes + trustScore.verifiedLoadReports,
      impact: `${trustScore.trustScore}/100 current trust score nudges confidence and community signal quality.`
    },
    {
      label: 'Route Confidence Scores',
      used: routeConfidenceScores.length > 0,
      sampleSize: routeConfidenceScores.length,
      impact: `${routeConfidenceAverage}/100 average stored route confidence from saved itineraries and watchlist snapshots.`
    },
    {
      label: 'Traveler Profile',
      used: true,
      sampleSize: 1,
      impact: `${input.travelerProfile.travelerType} at ${input.travelerProfile.passPriority} from ${input.travelerProfile.homeAirport} creates a ${Math.round(travelerProfileSignal)}% profile signal.`
    }
  ]

  return {
    successProbability,
    confidencePercent,
    confidenceLevel: confidenceLevel(dataSignals, probabilityOutcomeStats.outcomeCount),
    riskCategory: riskCategoryFromProbability(successProbability),
    explanationBullets: [
      `Base carrier profile starts at ${defaultProbability}% for ${input.recommendationScope}, then blends weighted community, outcome, historical, route-confidence, trust, and traveler-profile signals.`,
      `Route confidence contributes a ${routeConfidenceAverage}/100 average signal from saved itinerary and watchlist snapshots when available.`,
      `Route intelligence risk is ${routeRisk}, applying a ${riskPenalty >= 0 ? '-' : '+'}${Math.abs(riskPenalty)} point placeholder risk adjustment.`,
      `Historical route stats add ${input.historicalStats.averageScore} average score, ${input.historicalStats.averageSuccessRate}% success rate, and ${input.historicalStats.reportCount} reports.`,
      `Community load reports contribute ${loadStats.verifiedReportsCount} verified reports with ${loadStats.trustedSignal} weighted trusted signal and a ${communityLoadSignal >= 0 ? '+' : ''}${communityLoadSignal.toFixed(1)} point load adjustment.`,
      `Stored outcome history contributes ${probabilityOutcomeStats.outcomeCount} probability-eligible outcomes at ${probabilityOutcomeStats.successRate}% success, with ${outcomeStats.cancelledCount} cancelled trip${outcomeStats.cancelledCount === 1 ? '' : 's'} retained for audit but excluded from probability math.`,
      `Trust score contributes ${trustScore.trustScore}/100 reputation context, with ${trustScore.communityContributionLevel} weighting assumptions.`,
      `Traveler profile applies ${input.travelerProfile.travelerType} / ${input.travelerProfile.passPriority} assumptions from ${input.travelerProfile.homeAirport}.`
    ],
    whyWeBelieveThis: [
      `The displayed ${successProbability}% probability is a placeholder weighted blend: carrier baseline 20%, historical route database 20%, outcome history 18%, community load reports 16%, route confidence 10%, traveler profile 9%, and reputation/trust 7%, with small route-risk and recommendation adjustments layered on top.`,
      `Confidence is ${confidencePercent}% because the engine found ${totalSampleSize} total local/static samples across ${dataSignals} source categories, including ${weightedCommunitySample} weighted community-report units.`,
      `Trusted and elite contributor reports are weighted higher than new contributor reports, so a tight/full report from a high-trust member moves probability more than the same report from a new contributor.`,
      `Route confidence gives the engine a second-order signal: saved route scores already include success probability, historical data, community load reports, traveler profile, disruption intelligence, and weather impact.`,
      `Traveler profile still matters: pass priority, traveler type, home airport, preferred airports, and employee-airline alignment adjust the same route differently for different nonrev travelers.`
    ],
    dataSourcesUsed,
    sampleSize: {
      total: totalSampleSize,
      outcomeHistory: probabilityOutcomeStats.outcomeCount,
      communityLoadReports: input.loadReports.length,
      historicalRouteReports: input.historicalStats.reportCount,
      historicalRouteSamples: input.historicalStats.routes.length,
      weightedCommunitySample,
      routeConfidenceSnapshots: routeConfidenceScores.length
    },
    communityContributionImpact: {
      newContributorReports,
      trustedContributorReports,
      eliteContributorReports,
      weightedReportSignal: loadStats.trustedSignal,
      averageContributorTrustScore: loadStats.averageTrustScore,
      currentUserTrustScore: trustScore.trustScore,
      currentUserContributionLevel: trustScore.communityContributionLevel,
      summary: `${newContributorReports} new, ${trustedContributorReports} trusted, and ${eliteContributorReports} elite report(s) produced ${loadStats.trustedSignal} weighted community units.`
    },
    placeholderWeights: [
      { label: 'Carrier baseline', value: '20%' },
      { label: 'Historical route database', value: '20%' },
      { label: 'Outcome history', value: '18%' },
      { label: 'Community load reports', value: '16%' },
      { label: 'Route confidence', value: '10%' },
      { label: 'Traveler profile', value: '9%' },
      { label: 'Reputation/trust scores', value: '7%' }
    ],
    inputSummary: {
      travelerProfileSignals: travelerProfileAssumptions(input.travelerProfile),
      carrierDefaultProbability: defaultProbability,
      routeRisk,
      historicalAverageScore: input.historicalStats.averageScore,
      historicalSuccessRate: input.historicalStats.averageSuccessRate,
      communityReportCount: loadStats.verifiedReportsCount,
      weightedLoadSignal: loadStats.trustedSignal,
      outcomeCount: probabilityOutcomeStats.outcomeCount,
      outcomeSuccessRate: probabilityOutcomeStats.successRate,
      trustScore: trustScore.trustScore,
      routeConfidenceAverage
    }
  }
}

import { carrierScoringProfiles, normalizeCarrierFamily, type RouteRecommendation, type SupportedCarrierValue } from './carrierScope'
import { type HistoricalRoute, type historicalRouteStats } from './historicalRoutes'
import { loadReportStats, type LoadReport } from './loadReports'
import { tripOutcomeStats, type TripOutcome } from './tripOutcomes'
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
}

export type PredictionEngineResult = {
  successProbability: number
  confidenceLevel: 'Low' | 'Medium' | 'Medium-High' | 'High'
  riskCategory: 'Low' | 'Medium-Low' | 'Medium' | 'Medium-High' | 'High'
  explanationBullets: string[]
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

function carrierDefaultProbability(carrier: SupportedCarrierValue, carrierProfile: CarrierProfile) {
  if (carrier === 'all') {
    return Math.round(average(Object.values(carrierScoringProfiles).map((profile) => profile.successDefaults.probability)))
  }
  return carrierProfile.successDefaults.probability
}

export function calculatePredictionEngine(input: PredictionEngineInput): PredictionEngineResult {
  const carrier = normalizeCarrierFamily(input.carrier)
  const loadStats = loadReportStats(input.loadReports)
  const outcomeStats = tripOutcomeStats(input.outcomes)
  const averageRecommendationScore = Math.round(average(input.routeRecommendations.map((recommendation) => recommendation.score)))
  const defaultProbability = carrierDefaultProbability(carrier, input.carrierProfile)
  const routeRisk = input.routeIntelligence['Risk Level'] || input.carrierProfile.successDefaults.riskCategory
  const historicalScoreSignal = input.historicalStats.averageScore ? (input.historicalStats.averageScore - 75) * 0.25 : 0
  const historicalSuccessSignal = input.historicalStats.averageSuccessRate ? (input.historicalStats.averageSuccessRate - 70) * 0.35 : 0
  const communityLoadSignal = clamp(input.loadReports.reduce((total, report) => total + loadStatusSignal(report), 0), -8, 8)
  const outcomeSignal = outcomeStats.outcomeCount ? (outcomeStats.successRate - 65) * 0.22 : 0
  const recommendationSignal = averageRecommendationScore ? (averageRecommendationScore - 78) * 0.3 : 0
  const riskPenalty = routeRiskPenalty(routeRisk)
  const employeeAirlineBoost = carrier !== 'all' && input.carrierProfile.label === input.travelerProfile.employeeAirline ? 3 : 0
  const preferredAirportBoost = input.routeRecommendations.some((recommendation) =>
    [input.travelerProfile.homeAirport, ...input.travelerProfile.preferredAirports].some((airport) => recommendation.route.includes(airport))
  ) ? 2 : 0
  const travelerTypePenalty = input.travelerProfile.travelerType === 'Buddy Pass' ? 5 : input.travelerProfile.travelerType === 'Companion' ? 3 : 0
  const priorityBoost = input.travelerProfile.passPriority.toUpperCase().includes('SA1') ? 3 : input.travelerProfile.passPriority.toUpperCase().includes('SA2') ? 1 : 0
  const rawProbability =
    defaultProbability * 0.52 +
    averageRecommendationScore * 0.18 +
    input.historicalStats.averageSuccessRate * 0.18 +
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
  const dataSignals = [
    input.travelerProfile.homeAirport,
    input.carrierProfile.label,
    routeRisk,
    input.historicalStats.routes.length > 0 ? 'historical-routes' : '',
    loadStats.totalReports > 0 ? 'community-load-reports' : '',
    outcomeStats.outcomeCount > 0 ? 'outcome-history' : '',
    input.routeRecommendations.length > 0 ? 'route-recommendations' : ''
  ].filter(Boolean).length

  return {
    successProbability,
    confidenceLevel: confidenceLevel(dataSignals, outcomeStats.outcomeCount),
    riskCategory: riskCategoryFromProbability(successProbability),
    explanationBullets: [
      `Base carrier profile starts at ${defaultProbability}% for ${input.recommendationScope}.`,
      `Route intelligence risk is ${routeRisk}, applying a ${riskPenalty >= 0 ? '-' : '+'}${Math.abs(riskPenalty)} point placeholder risk adjustment.`,
      `Historical route stats add ${input.historicalStats.averageScore} average score, ${input.historicalStats.averageSuccessRate}% success rate, and ${input.historicalStats.reportCount} reports.`,
      `Community load reports contribute ${loadStats.verifiedReportsCount} verified reports with ${loadStats.trustedSignal}x trusted signal and a ${communityLoadSignal >= 0 ? '+' : ''}${communityLoadSignal.toFixed(1)} point load adjustment.`,
      `Outcome history contributes ${outcomeStats.outcomeCount} outcomes at ${outcomeStats.successRate}% success for a ${outcomeSignal >= 0 ? '+' : ''}${outcomeSignal.toFixed(1)} point calibration.`,
      `Traveler profile applies ${input.travelerProfile.travelerType} / ${input.travelerProfile.passPriority} assumptions from ${input.travelerProfile.homeAirport}.`
    ],
    inputSummary: {
      travelerProfileSignals: travelerProfileAssumptions(input.travelerProfile),
      carrierDefaultProbability: defaultProbability,
      routeRisk,
      historicalAverageScore: input.historicalStats.averageScore,
      historicalSuccessRate: input.historicalStats.averageSuccessRate,
      communityReportCount: loadStats.verifiedReportsCount,
      weightedLoadSignal: loadStats.trustedSignal,
      outcomeCount: outcomeStats.outcomeCount,
      outcomeSuccessRate: outcomeStats.successRate
    }
  }
}

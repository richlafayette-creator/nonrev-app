import { airportCodesFromRoute } from './airportMapScaffold'
import type { DisruptionIntelligence } from './disruptionIntelligence'
import type { TravelerProfileScaffold } from './travelerProfile'
import { getRouteWeatherRisk, type WeatherRisk, type WeatherRiskCategory } from './weatherIntelligence'

export type ConfidenceBadge = 'Excellent' | 'Good' | 'Fair' | 'Poor'
export type ConfidenceTrend = 'Improving' | 'Stable' | 'Softening' | 'Volatile'

export type WeatherImpact = {
  scoreImpact: number
  label: WeatherRiskCategory
  details: string[]
  source: string
  status: WeatherRisk['status']
  successProbabilityImpact: number
  routeRankingImpact: number
  diagnostics: string[]
}

export type RouteConfidence = {
  score: number
  badge: ConfidenceBadge
  trend: ConfidenceTrend
  trendDelta: number
  weatherImpact: WeatherImpact
  explanation: string[]
  components: {
    successProbability: number
    historicalRouteData: number
    communityLoadReports: number
    travelerProfile: number
    disruptionIntelligence: number
    weatherImpact: number
  }
}

type RouteConfidenceInput = {
  route: string
  successProbability: number
  historicalScore?: number
  historicalSuccessRate?: number
  historicalReportCount?: number
  communityReportCount?: number
  communityLoadAdjustment?: number
  travelerProfile: TravelerProfileScaffold
  disruption: DisruptionIntelligence
  previousConfidenceScore?: number
  trustedLoadSignal?: number
  weatherRisk?: WeatherRisk
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function calculateWeatherImpact(route: string, weatherRisk = getRouteWeatherRisk(route)): WeatherImpact {
  return {
    scoreImpact: weatherRisk.scoreImpact,
    label: weatherRisk.category,
    details: weatherRisk.details,
    source: weatherRisk.source,
    status: weatherRisk.status,
    successProbabilityImpact: weatherRisk.successProbabilityImpact,
    routeRankingImpact: weatherRisk.routeRankingImpact,
    diagnostics: weatherRisk.diagnostics
  }
}

export function confidenceBadge(score: number): ConfidenceBadge {
  if (score >= 85) return 'Excellent'
  if (score >= 72) return 'Good'
  if (score >= 58) return 'Fair'
  return 'Poor'
}

export function confidenceBadgeColor(badge: ConfidenceBadge) {
  if (badge === 'Excellent') return '#22c55e'
  if (badge === 'Good') return '#38bdf8'
  if (badge === 'Fair') return '#facc15'
  return '#f87171'
}

export function confidenceTrendColor(trend: ConfidenceTrend) {
  if (trend === 'Improving') return '#22c55e'
  if (trend === 'Stable') return '#38bdf8'
  if (trend === 'Softening') return '#facc15'
  return '#f87171'
}

function travelerProfileScore(route: string, profile: TravelerProfileScaffold) {
  const routeAirports = airportCodesFromRoute(route)
  const typeBase = profile.travelerType === 'Employee' ? 84 : profile.travelerType === 'Retiree' ? 74 : profile.travelerType === 'Companion' ? 64 : 54
  const priorityBonus = /SA1|SA2|A1|A2|D1|D2/i.test(profile.passPriority) ? 8 : /SA3|D3/i.test(profile.passPriority) ? 3 : 0
  const homeBonus = routeAirports.includes(profile.homeAirport.toUpperCase()) ? 5 : 0
  const preferredBonus = Math.min(6, routeAirports.filter((airport) => profile.preferredAirports.includes(airport)).length * 3)
  return clamp(typeBase + priorityBonus + homeBonus + preferredBonus)
}

function historicalComponent(input: RouteConfidenceInput) {
  const success = input.historicalSuccessRate ?? input.successProbability
  const score = input.historicalScore ?? input.successProbability
  const reportBonus = Math.min(8, (input.historicalReportCount || 0) * 0.8)
  return clamp(success * 0.56 + score * 0.36 + reportBonus)
}

function communityComponent(input: RouteConfidenceInput) {
  const reportCount = input.communityReportCount || 0
  const loadAdjustment = input.communityLoadAdjustment ?? input.trustedLoadSignal ?? 0
  const reportBase = reportCount ? 66 + Math.min(14, reportCount * 3) : 58
  return clamp(reportBase + loadAdjustment * 1.6)
}

function trendFor(score: number, input: RouteConfidenceInput) {
  const previous = input.previousConfidenceScore
  const delta = Number.isFinite(previous) ? score - Math.round(previous || score) : Math.round((input.communityLoadAdjustment || 0) - input.disruption.disruptionImpactScore * 0.08 - calculateWeatherImpact(input.route, input.weatherRisk).scoreImpact * 0.05)
  const trend: ConfidenceTrend = delta >= 5 ? 'Improving' : delta <= -8 ? 'Volatile' : delta <= -3 ? 'Softening' : 'Stable'
  return { trend, trendDelta: delta }
}

export function calculateRouteConfidence(input: RouteConfidenceInput): RouteConfidence {
  const weatherImpact = calculateWeatherImpact(input.route, input.weatherRisk)
  const components = {
    successProbability: clamp(input.successProbability),
    historicalRouteData: historicalComponent(input),
    communityLoadReports: communityComponent(input),
    travelerProfile: travelerProfileScore(input.route, input.travelerProfile),
    disruptionIntelligence: clamp(100 - input.disruption.disruptionImpactScore),
    weatherImpact: clamp(100 - weatherImpact.scoreImpact)
  }
  const score = clamp(
    components.successProbability * 0.3 +
    components.historicalRouteData * 0.2 +
    components.communityLoadReports * 0.14 +
    components.travelerProfile * 0.13 +
    components.disruptionIntelligence * 0.13 +
    components.weatherImpact * 0.1
  )
  const { trend, trendDelta } = trendFor(score, input)
  const badge = confidenceBadge(score)

  return {
    score,
    badge,
    trend,
    trendDelta,
    weatherImpact,
    components,
    explanation: [
      `Route Confidence Score is ${score}/100 (${badge}) from success probability, historical route data, community load reports, traveler profile, disruption intelligence, and weather impact.`,
      `Weights: success probability 30%, historical route data 20%, community load reports 14%, traveler profile 13%, disruption intelligence 13%, weather impact 10%.`,
      `Weather risk is ${weatherImpact.label.toLowerCase()} (${weatherImpact.scoreImpact} point risk, ${weatherImpact.successProbabilityImpact} probability points) from ${weatherImpact.source} (${weatherImpact.status}).`,
      `Disruption component is ${components.disruptionIntelligence}/100 after ${input.disruption.disruptionImpactScore}/99 disruption impact.`,
      `Confidence trend is ${trend}${trendDelta === 0 ? '' : ` (${trendDelta > 0 ? '+' : ''}${trendDelta})`} based on previous score when available, otherwise current load/disruption/weather movement.`
    ]
  }
}

import { airportCodesFromRoute } from './airportMapScaffold'
import type { DisruptionIntelligence } from './disruptionIntelligence'
import type { TravelerProfileScaffold } from './travelerProfile'

export type ConfidenceBadge = 'Excellent' | 'Good' | 'Fair' | 'Poor'
export type ConfidenceTrend = 'Improving' | 'Stable' | 'Softening' | 'Volatile'

export type WeatherImpact = {
  scoreImpact: number
  label: 'Low' | 'Moderate' | 'Elevated' | 'High'
  details: string[]
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
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function airportWeatherImpact(code: string) {
  const impacts: Record<string, { impact: number; detail: string }> = {
    SFO: { impact: 12, detail: 'SFO weather sensitivity: marine layer/low ceilings can reduce arrival rates.' },
    JFK: { impact: 10, detail: 'JFK weather sensitivity: Northeast convective and winter ops can cascade into banks.' },
    LGA: { impact: 10, detail: 'LGA weather sensitivity: short-haul flow programs can tighten recovery options.' },
    EWR: { impact: 11, detail: 'EWR weather sensitivity: congestion and flow control can compound delay risk.' },
    ORD: { impact: 12, detail: 'ORD weather sensitivity: storms, winter ops, and banked connections raise variance.' },
    DEN: { impact: 9, detail: 'DEN weather sensitivity: thunderstorms, wind, or deicing windows can affect turns.' },
    DFW: { impact: 9, detail: 'DFW weather sensitivity: storm cells can create rolling delay programs.' },
    ATL: { impact: 7, detail: 'ATL weather sensitivity: high-volume banks can amplify late inbound aircraft.' },
    SEA: { impact: 7, detail: 'SEA weather sensitivity: low ceilings and rain can slow turns.' },
    HNL: { impact: 4, detail: 'HNL weather sensitivity: island operations are usually stable but backup frequencies matter.' },
    OGG: { impact: 5, detail: 'OGG weather sensitivity: fewer long-haul frequencies increase recovery exposure.' }
  }
  return impacts[code]
}

export function calculateWeatherImpact(route: string): WeatherImpact {
  const impacts = airportCodesFromRoute(route)
    .map((code) => airportWeatherImpact(code))
    .filter(Boolean) as Array<{ impact: number; detail: string }>
  const scoreImpact = clamp(impacts.reduce((total, item) => total + item.impact, 0), 0, 35)
  const label = scoreImpact >= 24 ? 'High' : scoreImpact >= 15 ? 'Elevated' : scoreImpact >= 7 ? 'Moderate' : 'Low'
  return {
    scoreImpact,
    label,
    details: impacts.length ? impacts.map((item) => item.detail) : ['No route-specific weather sensitivity matched in the local scaffold.']
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
  const delta = Number.isFinite(previous) ? score - Math.round(previous || score) : Math.round((input.communityLoadAdjustment || 0) - input.disruption.disruptionImpactScore * 0.08 - calculateWeatherImpact(input.route).scoreImpact * 0.05)
  const trend: ConfidenceTrend = delta >= 5 ? 'Improving' : delta <= -8 ? 'Volatile' : delta <= -3 ? 'Softening' : 'Stable'
  return { trend, trendDelta: delta }
}

export function calculateRouteConfidence(input: RouteConfidenceInput): RouteConfidence {
  const weatherImpact = calculateWeatherImpact(input.route)
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
      `Weather impact is ${weatherImpact.label.toLowerCase()} (${weatherImpact.scoreImpact} point risk) from local airport weather-sensitivity scaffolds.`,
      `Disruption component is ${components.disruptionIntelligence}/100 after ${input.disruption.disruptionImpactScore}/99 disruption impact.`,
      `Confidence trend is ${trend}${trendDelta === 0 ? '' : ` (${trendDelta > 0 ? '+' : ''}${trendDelta})`} based on previous score when available, otherwise current load/disruption/weather movement.`
    ]
  }
}

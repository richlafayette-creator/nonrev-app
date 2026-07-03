import { airportCodesFromRoute } from './airportMapScaffold'
import type { DecisionFactors, DecisionScore, DecisionStatus } from './decisionEngine'
import type { DisruptionIntelligence } from './disruptionIntelligence'
import { communitySignalLabel, communitySignalScoreAdjustment, type FlightCommunitySummary } from './communityIntelligence'
import { historicalReliabilityDisplayLabel, historicalReliabilityScoreAdjustment, type HistoricalReliability } from './historicalReliability'
import type { RecoveryAnalysis } from './recoveryEngine'
import type { SellableSeatSignal } from './sellableSeatSignal'
import type { TravelerProfileScaffold } from './travelerProfile'
import { getRouteWeatherRisk, type WeatherRisk, type WeatherRiskCategory } from './weatherIntelligence'

export type ConfidenceBadge = 'Excellent' | 'Good' | 'Fair' | 'Poor'
export type ConfidenceTrend = 'Improving' | 'Stable' | 'Declining'
export type ConfidenceLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
export type ConfidenceSignalSource =
  | 'decision-engine'
  | 'recovery-engine'
  | 'sellable-seat-signal'
  | 'community-intelligence'
  | 'historical-reliability'
  | 'weather'
  | 'delay-history'
  | 'provider-reliability'

export type ConfidenceUpdateTrigger =
  | 'watchlist-viewed'
  | 'itinerary-search-run'
  | 'weather-risk-changed'
  | 'disruption-status-changed'
  | 'community-load-report-updated'
  | 'outcome-history-changed'
  | 'local-signal-refresh'

export type ConfidenceFactor = {
  source: ConfidenceSignalSource
  label: string
  detail: string
  impact: number
  available: boolean
}

export type ConfidenceSourceBreakdown = Record<ConfidenceSignalSource, {
  available: boolean
  scoreImpact: number
  summary: string
}>

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
  overallScore: number
  level: ConfidenceLevel
  summary: string
  positiveFactors: ConfidenceFactor[]
  cautionFactors: ConfidenceFactor[]
  missingSignals: ConfidenceSignalSource[]
  sourceBreakdown: ConfidenceSourceBreakdown
  observedAt: string

  /** Backward-compatible fields used by existing UI/alerts. */
  score: number
  badge: ConfidenceBadge
  trend: ConfidenceTrend
  trendDelta: number
  lastUpdated: string
  updateTrigger: ConfidenceUpdateTrigger
  updateExplanation: string
  weatherImpact: WeatherImpact
  explanation: string[]
  components: {
    successProbability: number
    historicalRouteData: number
    communityLoadReports: number
    historicalReliability: number
    travelerProfile: number
    disruptionIntelligence: number
    weatherImpact: number
  }
}

export type ProviderDataStatus = 'available' | 'rate-limited' | 'missing' | 'unknown'

type RouteConfidenceInput = {
  route: string
  successProbability: number
  historicalScore?: number
  historicalSuccessRate?: number
  historicalReportCount?: number
  communityReportCount?: number
  communityLoadAdjustment?: number
  travelerProfile?: TravelerProfileScaffold
  disruption?: DisruptionIntelligence
  previousConfidenceScore?: number
  trustedLoadSignal?: number
  weatherRisk?: WeatherRisk
  updateTrigger?: ConfidenceUpdateTrigger
  decisionScore?: DecisionScore
  decisionFactors?: DecisionFactors
  decisionStatus?: DecisionStatus
  recovery?: RecoveryAnalysis
  sellableSeatSignal?: SellableSeatSignal
  communityIntelligence?: FlightCommunitySummary
  historicalReliability?: HistoricalReliability
  providerDataStatus?: ProviderDataStatus
  providerReliabilityScore?: number
  delayHistoryScore?: number
}

const confidenceSources: ConfidenceSignalSource[] = [
  'decision-engine',
  'recovery-engine',
  'sellable-seat-signal',
  'community-intelligence',
  'historical-reliability',
  'weather',
  'delay-history',
  'provider-reliability'
]

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function confidenceLevel(score: number, incomplete: boolean): ConfidenceLevel {
  if (incomplete && score < 35) return 'unknown'
  if (score >= 85) return 'excellent'
  if (score >= 72) return 'good'
  if (score >= 58) return 'fair'
  return 'poor'
}

export function routeConfidenceLabel(level: ConfidenceLevel) {
  if (level === 'excellent') return '🟢 Excellent'
  if (level === 'good') return '🟡 Good'
  if (level === 'fair') return '🟠 Fair'
  if (level === 'poor') return '🔴 Poor'
  return 'Unknown'
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

export function confidenceBadgeColor(badge: ConfidenceBadge | ConfidenceLevel) {
  const normalized = badge.toLowerCase()
  if (normalized === 'excellent') return '#22c55e'
  if (normalized === 'good') return '#38bdf8'
  if (normalized === 'fair') return '#facc15'
  if (normalized === 'unknown') return '#94a3b8'
  return '#f87171'
}

export function confidenceTrendColor(trend: ConfidenceTrend) {
  if (trend === 'Improving') return '#22c55e'
  if (trend === 'Stable') return '#38bdf8'
  return '#f87171'
}

export function confidenceUpdateTriggerLabel(trigger: ConfidenceUpdateTrigger) {
  if (trigger === 'watchlist-viewed') return 'watchlist route viewed'
  if (trigger === 'itinerary-search-run') return 'itinerary search run'
  if (trigger === 'weather-risk-changed') return 'weather risk changed'
  if (trigger === 'disruption-status-changed') return 'disruption status changed'
  if (trigger === 'community-load-report-updated') return 'community load reports updated'
  if (trigger === 'outcome-history-changed') return 'outcome history changed'
  return 'local signal refresh'
}

function confidenceUpdateExplanation(input: RouteConfidenceInput, score: number, trend: ConfidenceTrend, weatherImpact: WeatherImpact) {
  const trigger = input.updateTrigger || 'local-signal-refresh'
  const signals = [
    `${Math.round(input.successProbability)}% success probability`,
    input.decisionScore ? `Decision Engine ${Math.round(input.decisionScore.overallScore)}/100` : 'Decision Engine unavailable',
    input.recovery ? `${input.recovery.strength} recovery` : 'Recovery Engine unavailable',
    input.sellableSeatSignal ? `${input.sellableSeatSignal.sellableStatus} commercial availability proxy` : 'commercial availability proxy missing',
    input.communityIntelligence ? `${communitySignalLabel(input.communityIntelligence.status)} community intelligence` : `${input.communityReportCount || 0} community load report${(input.communityReportCount || 0) === 1 ? '' : 's'}`,
    input.historicalReliability ? `${historicalReliabilityDisplayLabel(input.historicalReliability.signal.level)} historical reliability` : 'historical reliability unknown',
    `${input.disruption?.routeHealth || 'unknown'} disruption status`,
    `${weatherImpact.label} weather risk`,
    `${input.previousConfidenceScore ? `previous score ${Math.round(input.previousConfidenceScore)}` : 'no prior score baseline'}`
  ]
  return `Recalculated after ${confidenceUpdateTriggerLabel(trigger)} using route confidence inputs: ${signals.join(', ')}. Result: ${score}/100 and ${trend.toLowerCase()} trend.`
}

function travelerProfileScore(route: string, profile?: TravelerProfileScaffold) {
  if (!profile) return 62
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

function historicalReliabilityComponent(input: RouteConfidenceInput) {
  if (!input.historicalReliability) return 62
  return clamp(input.historicalReliability.reliabilityScore)
}

function providerStatusFor(input: RouteConfidenceInput): ProviderDataStatus {
  if (input.providerDataStatus) return input.providerDataStatus
  if (input.decisionFactors?.completionState === 'framework' || input.decisionFactors?.completionState === 'incomplete') return 'missing'
  return 'unknown'
}

function sourceBreakdownFromFactors(factors: ConfidenceFactor[]): ConfidenceSourceBreakdown {
  return confidenceSources.reduce((breakdown, source) => {
    const sourceFactors = factors.filter((factor) => factor.source === source)
    const available = sourceFactors.some((factor) => factor.available)
    breakdown[source] = {
      available,
      scoreImpact: sourceFactors.reduce((sum, factor) => sum + factor.impact, 0),
      summary: sourceFactors.map((factor) => factor.label).join('; ') || 'Signal not available yet.'
    }
    return breakdown
  }, {} as ConfidenceSourceBreakdown)
}

function confidenceFactors(input: RouteConfidenceInput, weatherImpact: WeatherImpact) {
  const providerStatus = providerStatusFor(input)
  const factors: ConfidenceFactor[] = []

  if (input.decisionScore) {
    const score = input.decisionScore.overallScore
    factors.push({
      source: 'decision-engine',
      label: `Decision Engine ${Math.round(score)}/100`,
      detail: `Recommendation status ${input.decisionStatus || 'unknown'}.`,
      impact: score >= 80 ? 5 : score >= 65 ? 2 : score < 50 ? -5 : 0,
      available: true
    })
  } else {
    factors.push({ source: 'decision-engine', label: 'Decision Engine missing', detail: 'Route ranking score was not provided.', impact: 0, available: false })
  }

  if (input.recovery) {
    const impact = input.recovery.strength === 'Excellent' ? 5 : input.recovery.strength === 'Good' ? 3 : input.recovery.strength === 'Poor' ? -7 : 0
    factors.push({
      source: 'recovery-engine',
      label: `${input.recovery.strength} recovery profile`,
      detail: input.recovery.summary,
      impact,
      available: true
    })
  } else {
    factors.push({ source: 'recovery-engine', label: 'Recovery signal missing', detail: 'Recovery Engine result was not attached.', impact: 0, available: false })
  }

  if (input.sellableSeatSignal) {
    const status = input.sellableSeatSignal.sellableStatus
    const impact = status === 'available' ? 3 : status === 'unavailable' ? -6 : 0
    factors.push({
      source: 'sellable-seat-signal',
      label: `Commercial availability proxy ${status}`,
      detail: 'Proxy only; this is not confirmed non-rev or standby seat availability.',
      impact,
      available: true
    })
  } else {
    factors.push({ source: 'sellable-seat-signal', label: 'Commercial availability proxy missing', detail: 'No sellable seat signal has been supplied.', impact: 0, available: false })
  }

  if (input.communityIntelligence) {
    const community = input.communityIntelligence
    factors.push({
      source: 'community-intelligence',
      label: `Community signal: ${communitySignalLabel(community.status)}`,
      detail: `${community.summary} This is not confirmed standby clearance.`,
      impact: communitySignalScoreAdjustment(community),
      available: community.activeReportCount > 0
    })
  } else {
    const communityReports = input.communityReportCount || 0
    factors.push({
      source: 'community-intelligence',
      label: communityReports ? `${communityReports} legacy community load report${communityReports === 1 ? '' : 's'}` : 'Community intelligence pending',
      detail: communityReports ? 'Legacy community load count is present; structured community intelligence is not attached yet.' : 'No community intelligence signal is available yet.',
      impact: communityReports ? Math.min(2, communityReports * 0.5) : 0,
      available: communityReports > 0
    })
  }

  if (input.historicalReliability) {
    const reliability = input.historicalReliability
    factors.push({
      source: 'historical-reliability',
      label: `Historical reliability: ${historicalReliabilityDisplayLabel(reliability.signal.level)}`,
      detail: `${reliability.signal.summary} Average delay ${Math.round(reliability.averageDelayMinutes || 0)} min; cancellation ${Number(reliability.cancellationRate || 0).toFixed(1)}%.`,
      impact: historicalReliabilityScoreAdjustment(reliability),
      available: reliability.signal.level !== 'unknown'
    })
  } else {
    factors.push({ source: 'historical-reliability', label: 'Historical reliability: Unknown', detail: 'No historical reliability signal is available yet.', impact: 0, available: false })
  }

  factors.push({
    source: 'weather',
    label: `${weatherImpact.label} weather signal`,
    detail: `${weatherImpact.source} · ${weatherImpact.status}`,
    impact: -Math.min(8, Math.max(0, weatherImpact.scoreImpact * 0.12)),
    available: weatherImpact.status !== 'placeholder'
  })

  if (typeof input.delayHistoryScore === 'number') {
    factors.push({ source: 'delay-history', label: `Delay history ${input.delayHistoryScore}/100`, detail: 'Future delay-history signal supplied.', impact: input.delayHistoryScore >= 75 ? 2 : input.delayHistoryScore < 45 ? -3 : 0, available: true })
  } else {
    factors.push({ source: 'delay-history', label: 'Delay history pending', detail: 'Future delay-history input is not wired yet.', impact: 0, available: false })
  }

  if (providerStatus === 'available') {
    factors.push({ source: 'provider-reliability', label: 'Provider data available', detail: 'Provider data is present for this route.', impact: input.providerReliabilityScore ? Math.max(-3, Math.min(3, (input.providerReliabilityScore - 70) / 10)) : 1, available: true })
  } else if (providerStatus === 'rate-limited') {
    factors.push({ source: 'provider-reliability', label: 'Provider data rate-limited', detail: 'Confidence is incomplete because a provider was rate-limited.', impact: -2, available: false })
  } else if (providerStatus === 'missing') {
    factors.push({ source: 'provider-reliability', label: 'Provider data missing', detail: 'Confidence is incomplete because live provider data is missing.', impact: -2, available: false })
  } else {
    factors.push({ source: 'provider-reliability', label: 'Provider reliability unknown', detail: 'Provider reliability has no confirmed signal yet.', impact: 0, available: false })
  }

  return factors
}

function trendFor(score: number, input: RouteConfidenceInput) {
  const previous = input.previousConfidenceScore
  const disruptionImpact = input.disruption?.disruptionImpactScore || 0
  const delta = Number.isFinite(previous) ? score - Math.round(previous || score) : Math.round((input.communityLoadAdjustment || 0) - disruptionImpact * 0.08 - calculateWeatherImpact(input.route, input.weatherRisk).scoreImpact * 0.05)
  const trend: ConfidenceTrend = delta >= 3 ? 'Improving' : delta <= -3 ? 'Declining' : 'Stable'
  return { trend, trendDelta: delta }
}

export function calculateRouteConfidence(input: RouteConfidenceInput): RouteConfidence {
  const weatherImpact = calculateWeatherImpact(input.route, input.weatherRisk)
  const disruptionImpactScore = input.disruption?.disruptionImpactScore || 35
  const components = {
    successProbability: clamp(input.successProbability),
    historicalRouteData: historicalComponent(input),
    communityLoadReports: communityComponent(input),
    historicalReliability: historicalReliabilityComponent(input),
    travelerProfile: travelerProfileScore(input.route, input.travelerProfile),
    disruptionIntelligence: clamp(100 - disruptionImpactScore),
    weatherImpact: clamp(100 - weatherImpact.scoreImpact)
  }
  const baseScore = clamp(
    components.successProbability * 0.3 +
    components.historicalRouteData * 0.16 +
    components.communityLoadReports * 0.14 +
    components.historicalReliability * 0.04 +
    components.travelerProfile * 0.13 +
    components.disruptionIntelligence * 0.13 +
    components.weatherImpact * 0.1
  )
  const factors = confidenceFactors(input, weatherImpact)
  const factorAdjustment = factors.reduce((sum, factor) => sum + factor.impact, 0)
  const providerStatus = providerStatusFor(input)
  const incompleteProviderData = providerStatus === 'rate-limited' || providerStatus === 'missing'
  const score = clamp(baseScore + factorAdjustment)
  const level = confidenceLevel(score, incompleteProviderData)
  const badge = confidenceBadge(score)
  const observedAt = new Date().toISOString()
  const updateTrigger = input.updateTrigger || 'local-signal-refresh'
  const { trend, trendDelta } = trendFor(score, input)
  const updateExplanation = confidenceUpdateExplanation(input, score, trend, weatherImpact)
  const positiveFactors = factors.filter((factor) => factor.available && factor.impact > 0).sort((a, b) => b.impact - a.impact)
  const cautionFactors = factors.filter((factor) => factor.impact < 0 || (!factor.available && ['provider-reliability', 'decision-engine', 'recovery-engine'].includes(factor.source))).sort((a, b) => a.impact - b.impact)
  const missingSignals = confidenceSources.filter((source) => factors.some((factor) => factor.source === source && !factor.available))
  const sourceBreakdown = sourceBreakdownFromFactors(factors)
  const summary = `${routeConfidenceLabel(level)} confidence from Decision Engine, Recovery Engine, commercial availability proxy, community intelligence, historical reliability, and future-ready weather/delay/provider inputs${incompleteProviderData ? '; provider data is incomplete' : ''}. Not guaranteed standby clearance.`

  return {
    overallScore: score,
    level,
    summary,
    positiveFactors,
    cautionFactors,
    missingSignals,
    sourceBreakdown,
    observedAt,
    score,
    badge,
    trend,
    trendDelta,
    lastUpdated: observedAt,
    updateTrigger,
    updateExplanation,
    weatherImpact,
    components,
    explanation: [
      `Route Confidence is ${score}/100 (${routeConfidenceLabel(level)}) from Decision Engine, Recovery Engine, commercial availability proxy, community intelligence, historical reliability, weather, delay history, and provider reliability signals.`,
      `Commercial availability is treated only as a proxy and never as guaranteed standby or non-rev clearance.`,
      incompleteProviderData ? 'Provider data is rate-limited or missing, so confidence is marked incomplete.' : 'Provider reliability is available or currently unknown without a heavy penalty.',
      `Unknown signals are treated as missing context rather than major penalties. Missing: ${missingSignals.length ? missingSignals.join(', ') : 'none'}.`,
      `Weather risk is ${weatherImpact.label.toLowerCase()} (${weatherImpact.scoreImpact} point risk, ${weatherImpact.successProbabilityImpact} probability points) from ${weatherImpact.source} (${weatherImpact.status}).`,
      `Last confidence update: ${observedAt}; trigger: ${confidenceUpdateTriggerLabel(updateTrigger)}.`,
      updateExplanation,
      `Confidence trend is ${trend}${trendDelta === 0 ? '' : ` (${trendDelta > 0 ? '+' : ''}${trendDelta})`}.`
    ]
  }
}

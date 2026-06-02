import { buildDisruptionIntelligence } from './disruptionIntelligence'
import { calculateRouteConfidence, type RouteConfidence } from './routeConfidence'
import { loadSavedItineraryComparisons, type SavedItineraryComparison } from './savedItineraryComparisons'
import { loadTripAlertPreferences, getTripAlertPreference, type TripAlertPreference, type TripAlertTargetType } from './tripAlertPreferences'
import { defaultTravelerProfile, loadTravelerProfileFromStorage, type TravelerProfileScaffold } from './travelerProfile'
import { loadSavedTripWatchlist, type SavedTripWatch } from './watchlist'

export const alertHistoryStorageKey = 'nonrevy.alertHistory'
export const alertSnapshotStorageKey = 'nonrevy.alertSnapshots'

export type RealTimeAlertType =
  | 'Confidence increased'
  | 'Confidence decreased'
  | 'Better route found'
  | 'New backup route available'
  | 'Disruption detected'
  | 'Weather risk increased'

export type RealTimeAlertSeverity = 'good' | 'info' | 'warning' | 'critical'

export type AlertTargetType = TripAlertTargetType

export type RealTimeAlert = {
  id: string
  eventKey: string
  type: RealTimeAlertType
  severity: RealTimeAlertSeverity
  targetId: string
  targetType: AlertTargetType
  targetLabel: string
  route: string
  carrier: string
  title: string
  body: string
  metricLabel: string
  metricValue: string
  generatedAt: string
  read: boolean
  source: 'watchlist' | 'saved-itinerary' | 'local-engine'
  details: string[]
}

type AlertSnapshot = {
  targetId: string
  targetType: AlertTargetType
  route: string
  confidenceScore: number
  successProbability: number
  disruptionImpactScore: number
  weatherImpactScore: number
  updatedAt: string
}

type AlertTarget = {
  id: string
  targetType: AlertTargetType
  targetLabel: string
  route: string
  carrier: string
  score: number
  successProbability: number
  storedConfidenceScore?: number
  source: 'watchlist' | 'saved-itinerary'
}

function nowIso() {
  return new Date().toISOString()
}

function targetKey(target: Pick<AlertTarget, 'id' | 'targetType'>) {
  return `${target.targetType}:${target.id}`
}

function routeEndpoints(route: string) {
  const airports = route.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  return {
    origin: airports[0] || 'TBD',
    destination: airports[airports.length - 1] || 'TBD'
  }
}

function sameRouteMarket(a: string, b: string) {
  const left = routeEndpoints(a)
  const right = routeEndpoints(b)
  return left.origin === right.origin && left.destination === right.destination
}

function alertTypeColor(type: RealTimeAlertType) {
  if (type === 'Confidence increased') return '#22c55e'
  if (type === 'Confidence decreased') return '#f87171'
  if (type === 'Better route found') return '#38bdf8'
  if (type === 'New backup route available') return '#c084fc'
  if (type === 'Disruption detected') return '#fb7185'
  return '#facc15'
}

export function realTimeAlertTypeColor(type: RealTimeAlertType) {
  return alertTypeColor(type)
}

export function alertSeverityColor(severity: RealTimeAlertSeverity) {
  if (severity === 'good') return '#22c55e'
  if (severity === 'info') return '#38bdf8'
  if (severity === 'warning') return '#facc15'
  return '#f87171'
}

export function loadAlertHistory() {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(alertHistoryStorageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed as RealTimeAlert[] : []
  } catch {
    return []
  }
}

function saveAlertHistory(alerts: RealTimeAlert[]) {
  if (typeof window === 'undefined') return []
  const trimmed = alerts
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))
    .slice(0, 80)
  window.localStorage.setItem(alertHistoryStorageKey, JSON.stringify(trimmed))
  window.dispatchEvent(new Event('nonrevy-alerts-updated'))
  return trimmed
}

function loadAlertSnapshots() {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(alertSnapshotStorageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed as AlertSnapshot[] : []
  } catch {
    return []
  }
}

function saveAlertSnapshots(snapshots: AlertSnapshot[]) {
  if (typeof window === 'undefined') return []
  window.localStorage.setItem(alertSnapshotStorageKey, JSON.stringify(snapshots))
  return snapshots
}

function confidenceForTarget(target: AlertTarget, travelerProfile: TravelerProfileScaffold): RouteConfidence {
  const disruption = buildDisruptionIntelligence({ route: target.route })
  return calculateRouteConfidence({
    route: target.route,
    successProbability: target.successProbability,
    historicalScore: target.score,
    historicalSuccessRate: target.successProbability,
    historicalReportCount: 0,
    communityReportCount: 0,
    communityLoadAdjustment: 0,
    travelerProfile,
    disruption,
    previousConfidenceScore: target.storedConfidenceScore
  })
}

function watchTarget(watch: SavedTripWatch): AlertTarget {
  return {
    id: watch.id,
    targetType: 'watched-route',
    targetLabel: `${watch.origin} → ${watch.destination}`,
    route: watch.selectedItinerary,
    carrier: watch.carrier,
    score: watch.score,
    successProbability: watch.successProbability,
    storedConfidenceScore: watch.routeConfidenceScore,
    source: 'watchlist'
  }
}

function itineraryTarget(itinerary: SavedItineraryComparison): AlertTarget {
  return {
    id: itinerary.id,
    targetType: 'saved-itinerary',
    targetLabel: itinerary.route,
    route: itinerary.route,
    carrier: itinerary.carrier,
    score: itinerary.score,
    successProbability: itinerary.successProbability,
    storedConfidenceScore: itinerary.routeConfidenceScore,
    source: 'saved-itinerary'
  }
}

function alertsEnabled(preference: TripAlertPreference, type: RealTimeAlertType) {
  if (type === 'Confidence increased' || type === 'Confidence decreased') return preference.flags.scoreChanges || preference.flags.successProbabilityChanges
  if (type === 'Better route found' || type === 'New backup route available') return preference.flags.betterRouteFound
  if (type === 'Disruption detected' || type === 'Weather risk increased') return preference.flags.delayCancellationUpdates
  return true
}

function buildAlert(target: AlertTarget, type: RealTimeAlertType, severity: RealTimeAlertSeverity, title: string, body: string, metricLabel: string, metricValue: string, details: string[], eventSuffix: string): RealTimeAlert {
  const generatedAt = nowIso()
  const eventKey = `${targetKey(target)}:${type}:${eventSuffix}`
  return {
    id: `${eventKey}:${Date.now()}`,
    eventKey,
    type,
    severity,
    targetId: target.id,
    targetType: target.targetType,
    targetLabel: target.targetLabel,
    route: target.route,
    carrier: target.carrier,
    title,
    body,
    metricLabel,
    metricValue,
    generatedAt,
    read: false,
    source: target.source,
    details
  }
}

function betterRouteAlert(target: AlertTarget, candidates: AlertTarget[], currentConfidence: RouteConfidence) {
  const better = candidates
    .filter((candidate) => candidate.id !== target.id && sameRouteMarket(candidate.route, target.route))
    .map((candidate) => ({ candidate, confidence: candidate.storedConfidenceScore || candidate.successProbability || candidate.score }))
    .sort((a, b) => b.confidence - a.confidence)[0]

  if (!better || better.confidence < currentConfidence.score + 6) return null

  return buildAlert(
    target,
    'Better route found',
    'info',
    `Better route found for ${target.targetLabel}`,
    `${better.candidate.route} is currently scoring ${better.confidence}/100 versus ${currentConfidence.score}/100 for ${target.route}.`,
    'Better route score',
    `${better.confidence}/100`,
    [
      `Current route confidence: ${currentConfidence.score}/100 (${currentConfidence.badge}).`,
      `Candidate route: ${better.candidate.route}.`,
      'Local comparison only; no live airline inventory is queried.'
    ],
    `${better.candidate.route}:${better.confidence}`
  )
}

function generateAlertsForTarget(target: AlertTarget, previous: AlertSnapshot | undefined, candidates: AlertTarget[], travelerProfile: TravelerProfileScaffold) {
  const disruption = buildDisruptionIntelligence({ route: target.route })
  const confidence = confidenceForTarget(target, travelerProfile)
  const alerts: RealTimeAlert[] = []
  const preference = getTripAlertPreference(target.id, target.targetType, target.targetLabel)
  const previousConfidence = previous?.confidenceScore ?? target.storedConfidenceScore
  const confidenceDelta = Number.isFinite(previousConfidence) ? confidence.score - Math.round(previousConfidence || confidence.score) : 0
  const successDelta = previous ? target.successProbability - previous.successProbability : 0
  const weatherDelta = previous ? confidence.weatherImpact.scoreImpact - previous.weatherImpactScore : 0
  const disruptionDelta = previous ? disruption.disruptionImpactScore - previous.disruptionImpactScore : 0

  if (confidenceDelta >= 4 || successDelta >= 5) {
    alerts.push(buildAlert(
      target,
      'Confidence increased',
      'good',
      `Confidence increased for ${target.targetLabel}`,
      `${target.route} is now ${confidence.score}/100 (${confidence.badge}), ${confidenceDelta >= 0 ? '+' : ''}${confidenceDelta} from the last local snapshot.`,
      'Route confidence',
      `${confidence.score}/100`,
      confidence.explanation,
      `${confidence.score}`
    ))
  }

  if (confidenceDelta <= -4 || successDelta <= -5) {
    alerts.push(buildAlert(
      target,
      'Confidence decreased',
      'warning',
      `Confidence decreased for ${target.targetLabel}`,
      `${target.route} is now ${confidence.score}/100 (${confidence.badge}), ${confidenceDelta} from the last local snapshot.`,
      'Route confidence',
      `${confidence.score}/100`,
      confidence.explanation,
      `${confidence.score}`
    ))
  }

  const better = betterRouteAlert(target, candidates, confidence)
  if (better) alerts.push(better)

  if (disruption.backupRouteRecommendations.length && (disruption.routeHealth !== 'Green' || target.successProbability < 72 || confidence.score < 72)) {
    alerts.push(buildAlert(
      target,
      'New backup route available',
      'info',
      `Backup route guidance available for ${target.targetLabel}`,
      disruption.backupRouteRecommendations[0],
      'Backup recommendations',
      `${disruption.backupRouteRecommendations.length}`,
      disruption.backupRouteRecommendations,
      `${disruption.routeHealth}:${Math.round(target.successProbability / 5) * 5}:${confidence.badge}`
    ))
  }

  if (disruption.routeHealth !== 'Green' || disruption.disruptionImpactScore >= 22 || disruptionDelta >= 8) {
    alerts.push(buildAlert(
      target,
      'Disruption detected',
      disruption.routeHealth === 'Red' ? 'critical' : 'warning',
      `Disruption detected on ${target.route}`,
      `Route health is ${disruption.routeHealth} with ${disruption.disruptionImpactScore}/99 disruption impact.`,
      'Disruption impact',
      `${disruption.disruptionImpactScore}/99`,
      disruption.explanation,
      `${disruption.routeHealth}:${disruption.disruptionImpactScore}`
    ))
  }

  if (confidence.weatherImpact.label === 'Elevated' || confidence.weatherImpact.label === 'High' || weatherDelta >= 6) {
    alerts.push(buildAlert(
      target,
      'Weather risk increased',
      confidence.weatherImpact.label === 'High' ? 'critical' : 'warning',
      `Weather risk increased for ${target.route}`,
      `Weather impact is ${confidence.weatherImpact.label} with ${confidence.weatherImpact.scoreImpact} points of route risk in the local scaffold.`,
      'Weather impact',
      confidence.weatherImpact.label,
      confidence.weatherImpact.details,
      `${confidence.weatherImpact.label}:${confidence.weatherImpact.scoreImpact}`
    ))
  }

  return alerts.filter((alert) => alertsEnabled(preference, alert.type))
}

export function refreshRealTimeAlerts() {
  if (typeof window === 'undefined') return []

  const travelerProfile = loadTravelerProfileFromStorage?.() || defaultTravelerProfile
  const targets = [
    ...loadSavedTripWatchlist().map(watchTarget),
    ...loadSavedItineraryComparisons().map(itineraryTarget)
  ]
  const previousSnapshots = loadAlertSnapshots()
  const previousByTarget = new Map(previousSnapshots.map((snapshot) => [`${snapshot.targetType}:${snapshot.targetId}`, snapshot]))
  const existingHistory = loadAlertHistory()
  const existingEventKeys = new Set(existingHistory.map((alert) => alert.eventKey))
  const generated = targets.flatMap((target) => generateAlertsForTarget(target, previousByTarget.get(targetKey(target)), targets, travelerProfile))
  const newAlerts = generated.filter((alert) => !existingEventKeys.has(alert.eventKey))
  const history = newAlerts.length ? saveAlertHistory([...newAlerts, ...existingHistory]) : existingHistory

  const nextSnapshots = targets.map((target) => {
    const disruption = buildDisruptionIntelligence({ route: target.route })
    const confidence = confidenceForTarget(target, travelerProfile)
    return {
      targetId: target.id,
      targetType: target.targetType,
      route: target.route,
      confidenceScore: confidence.score,
      successProbability: target.successProbability,
      disruptionImpactScore: disruption.disruptionImpactScore,
      weatherImpactScore: confidence.weatherImpact.scoreImpact,
      updatedAt: nowIso()
    }
  })
  saveAlertSnapshots(nextSnapshots)
  return history
}

export function markAlertRead(alertId: string) {
  if (typeof window === 'undefined') return []
  return saveAlertHistory(loadAlertHistory().map((alert) => alert.id === alertId ? { ...alert, read: true } : alert))
}

export function markAllAlertsRead() {
  if (typeof window === 'undefined') return []
  return saveAlertHistory(loadAlertHistory().map((alert) => ({ ...alert, read: true })))
}

export function clearAlertHistory() {
  if (typeof window === 'undefined') return []
  window.localStorage.setItem(alertHistoryStorageKey, JSON.stringify([]))
  window.dispatchEvent(new Event('nonrevy-alerts-updated'))
  return []
}

export function alertSummary(alerts: RealTimeAlert[]) {
  const unread = alerts.filter((alert) => !alert.read).length
  const critical = alerts.filter((alert) => alert.severity === 'critical').length
  const warning = alerts.filter((alert) => alert.severity === 'warning').length
  const byType = alerts.reduce<Record<RealTimeAlertType, number>>((counts, alert) => {
    counts[alert.type] = (counts[alert.type] || 0) + 1
    return counts
  }, {} as Record<RealTimeAlertType, number>)
  return { unread, critical, warning, byType }
}

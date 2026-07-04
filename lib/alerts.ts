import { buildDisruptionIntelligence } from './disruptionIntelligence'
import { effectiveLoadReportWeight, loadLoadReports, loadReportSignal } from './loadReports'
import { loadCommunityLoads, relativeCommunityLoadTime, type CommunityLoadReport } from './communityLoads'
import { calculateRouteConfidence, type RouteConfidence } from './routeConfidence'
import { loadSavedItineraryComparisons, type SavedItineraryComparison } from './savedItineraryComparisons'
import { deliverNotification, eventTypeEnabled, type NotificationEventType } from './notificationDelivery'
import { loadTripAlertPreferences, getTripAlertPreference, type TripAlertPreference, type TripAlertTargetType } from './tripAlertPreferences'
import { loadTripOutcomes, tripOutcomeStats } from './tripOutcomes'
import { defaultTravelerProfile, loadTravelerProfileFromStorage, type TravelerProfileScaffold } from './travelerProfile'
import { loadSavedTripWatchlist, watchMatchesText, type SavedTripWatch } from './watchlist'
import { clearPersistentAlertHistory, markAllPersistentAlertsRead, markPersistentAlertRead, persistAlertSnapshots, persistAlerts } from './persistentTripClient'

export const alertHistoryStorageKey = 'nonrevy.alertHistory'
export const alertSnapshotStorageKey = 'nonrevy.alertSnapshots'

export type RealTimeAlertType =
  | 'Confidence increased'
  | 'Confidence decreased'
  | 'New community load'
  | 'Seat availability changed'
  | 'Better route found'
  | 'New backup route available'
  | 'Watchlist activity'
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

export type AlertSnapshot = {
  targetId: string
  targetType: AlertTargetType
  route: string
  confidenceScore: number
  successProbability: number
  disruptionImpactScore: number
  weatherImpactScore: number
  latestCommunityLoadId?: string
  availableSeats?: number
  standbyCount?: number
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

function reportsForRoute(route: string) {
  const endpoints = routeEndpoints(route)
  return loadLoadReports().filter((report) => report.origin === endpoints.origin && report.destination === endpoints.destination)
}

function alertTypeColor(type: RealTimeAlertType) {
  if (type === 'Confidence increased') return '#22c55e'
  if (type === 'Confidence decreased') return '#f87171'
  if (type === 'New community load') return '#22c55e'
  if (type === 'Seat availability changed') return '#14b8a6'
  if (type === 'Better route found') return '#38bdf8'
  if (type === 'New backup route available') return '#c084fc'
  if (type === 'Watchlist activity') return '#f472b6'
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
  void persistAlerts(trimmed)
  window.dispatchEvent(new Event('nonrevy-alerts-updated'))
  return trimmed
}

export function loadAlertSnapshots() {
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
  void persistAlertSnapshots(snapshots)
  return snapshots
}

function confidenceForTarget(target: AlertTarget, travelerProfile: TravelerProfileScaffold): RouteConfidence {
  const disruption = buildDisruptionIntelligence({ route: target.route })
  const matchingReports = reportsForRoute(target.route)
  const matchingOutcomes = loadTripOutcomes().filter((outcome) => sameRouteMarket(outcome.route, target.route))
  const outcomeStats = tripOutcomeStats(matchingOutcomes)
  const storedSuccessProbability = outcomeStats.probabilityOutcomeCount
    ? Math.round(target.successProbability * 0.64 + outcomeStats.successRate * 0.36)
    : target.successProbability
  const communityLoadAdjustment = Math.round(matchingReports.reduce((total, report) => total + loadReportSignal(report), 0))
  const weightedReportCount = Math.round(matchingReports.reduce((total, report) => total + effectiveLoadReportWeight(report), 0))
  return calculateRouteConfidence({
    route: target.route,
    successProbability: storedSuccessProbability,
    historicalScore: target.score,
    historicalSuccessRate: outcomeStats.probabilityOutcomeCount ? outcomeStats.successRate : target.successProbability,
    historicalReportCount: matchingReports.length + outcomeStats.probabilityOutcomeCount,
    communityReportCount: weightedReportCount,
    communityLoadAdjustment,
    travelerProfile,
    disruption,
    previousConfidenceScore: target.storedConfidenceScore,
    updateTrigger: outcomeStats.probabilityOutcomeCount ? 'outcome-history-changed' : undefined
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
  if (type === 'New community load' || type === 'Seat availability changed') return preference.flags.communityLoadReports
  if (type === 'Better route found' || type === 'New backup route available') return preference.flags.betterRouteFound
  if (type === 'Watchlist activity') return true
  if (type === 'Disruption detected') return preference.flags.delayCancellationUpdates || preference.flags.disruptionAlerts
  if (type === 'Weather risk increased') return preference.flags.weatherAlerts
  return true
}

function notificationEventTypeForAlert(type: RealTimeAlertType): NotificationEventType {
  if (type === 'Confidence increased' || type === 'Confidence decreased') return 'route-confidence-changes'
  if (type === 'New community load' || type === 'Seat availability changed') return 'community-load-reports'
  if (type === 'Better route found' || type === 'New backup route available') return 'better-route-found'
  if (type === 'Watchlist activity') return 'watchlist'
  if (type === 'Disruption detected') return 'disruption-alerts'
  return 'weather-alerts'
}

function notificationSourceForAlert(type: RealTimeAlertType) {
  if (type === 'Confidence increased' || type === 'Confidence decreased') return 'route-confidence' as const
  if (type === 'New community load' || type === 'Seat availability changed') return 'community-load-report' as const
  if (type === 'Better route found' || type === 'New backup route available') return 'better-route' as const
  if (type === 'Watchlist activity') return 'watchlist' as const
  if (type === 'Disruption detected') return 'disruption' as const
  return 'weather' as const
}

function deliverAlertNotifications(alerts: RealTimeAlert[]) {
  if (typeof window === 'undefined') return

  alerts.forEach((alert) => {
    const eventType = notificationEventTypeForAlert(alert.type)
    if (!eventTypeEnabled(eventType)) return
    deliverNotification({
      eventType,
      title: alert.title,
      body: alert.body,
      targetId: alert.targetId,
      targetLabel: alert.targetLabel,
      source: notificationSourceForAlert(alert.type),
      eventKey: alert.eventKey,
      details: alert.details
    })

    if (alert.source === 'watchlist') {
      deliverNotification({
        eventType: 'watchlist',
        title: alert.title,
        body: alert.body,
        targetId: alert.targetId,
        targetLabel: alert.targetLabel,
        source: 'watchlist',
        eventKey: `watchlist:${alert.eventKey}`,
        details: alert.details
      })
    }
  })
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


function latestCommunityLoadForTarget(target: AlertTarget) {
  const reports = loadCommunityLoads()
    .filter((report) => watchMatchesText({
      id: target.id,
      watchType: target.source === 'watchlist' ? undefined : 'route',
      watchQuery: target.route,
      watchLabel: target.targetLabel,
      origin: routeEndpoints(target.route).origin,
      destination: routeEndpoints(target.route).destination,
      travelDate: 'Flexible',
      carrier: target.carrier,
      selectedItinerary: target.route,
      score: target.score,
      successProbability: target.successProbability,
      riskLevel: 'Medium',
      connections: 0,
      totalTravelTime: 'Pending',
      lastUpdated: nowIso()
    }, `${report.flightNumber} ${report.route} ${report.origin} ${report.destination} ${report.cabin || ''} ${report.notes || ''}`))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return reports[0] || null
}

function communityLoadAlerts(target: AlertTarget, previous: AlertSnapshot | undefined) {
  const report = latestCommunityLoadForTarget(target)
  if (!report) return []
  const alerts: RealTimeAlert[] = []
  if (previous?.latestCommunityLoadId !== report.id) {
    alerts.push(buildAlert(
      target,
      'New community load',
      'info',
      `${report.flightNumber} community load updated`,
      `${report.route} now has ${report.availableSeats} seats available and ${report.standbyCount} listed standby.`,
      'Open seats',
      `${report.availableSeats}`,
      [
        `${report.flightNumber} · ${report.route} · ${report.cabin || 'Any cabin'}`,
        `${report.availableSeats} available seats, ${report.standbyCount} standby.`,
        `Updated ${relativeCommunityLoadTime(report.createdAt)}.`
      ],
      `${report.id}`
    ))
  }
  if (previous && (previous.availableSeats !== undefined || previous.standbyCount !== undefined)) {
    const seatDelta = report.availableSeats - (previous.availableSeats ?? report.availableSeats)
    const standbyDelta = report.standbyCount - (previous.standbyCount ?? report.standbyCount)
    if (Math.abs(seatDelta) >= 2 || Math.abs(standbyDelta) >= 2) {
      alerts.push(buildAlert(
        target,
        'Seat availability changed',
        seatDelta >= 0 && standbyDelta <= 1 ? 'good' : 'warning',
        `Seat availability changed for ${target.targetLabel}`,
        `${report.flightNumber} moved to ${report.availableSeats} open / ${report.standbyCount} standby (${seatDelta >= 0 ? '+' : ''}${seatDelta} seats, ${standbyDelta >= 0 ? '+' : ''}${standbyDelta} standby).`,
        'Seat movement',
        `${seatDelta >= 0 ? '+' : ''}${seatDelta}`,
        [
          `Previous local snapshot: ${previous.availableSeats ?? '—'} open / ${previous.standbyCount ?? '—'} standby.`,
          `Latest community report: ${report.availableSeats} open / ${report.standbyCount} standby.`,
          `Updated ${relativeCommunityLoadTime(report.createdAt)}.`
        ],
        `${report.id}:${report.availableSeats}:${report.standbyCount}`
      ))
    }
  }
  return alerts
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

  if (confidence.weatherImpact.level === 'watch' || confidence.weatherImpact.level === 'risky' || weatherDelta >= 6) {
    alerts.push(buildAlert(
      target,
      'Weather risk increased',
      confidence.weatherImpact.level === 'risky' ? 'critical' : 'warning',
      `Weather risk increased for ${target.route}`,
      `Weather impact is ${confidence.weatherImpact.label} with ${confidence.weatherImpact.scoreImpact} points of route risk from ${confidence.weatherImpact.source}.`,
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
  if (newAlerts.length) deliverAlertNotifications(newAlerts)
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
      latestCommunityLoadId: latestCommunityLoadForTarget(target)?.id,
      availableSeats: latestCommunityLoadForTarget(target)?.availableSeats,
      standbyCount: latestCommunityLoadForTarget(target)?.standbyCount,
      updatedAt: nowIso()
    }
  })
  saveAlertSnapshots(nextSnapshots)
  return history
}

export function markAlertRead(alertId: string) {
  if (typeof window === 'undefined') return []
  void markPersistentAlertRead(alertId)
  return saveAlertHistory(loadAlertHistory().map((alert) => alert.id === alertId ? { ...alert, read: true } : alert))
}

export function markAllAlertsRead() {
  if (typeof window === 'undefined') return []
  void markAllPersistentAlertsRead()
  return saveAlertHistory(loadAlertHistory().map((alert) => ({ ...alert, read: true })))
}

export function clearAlertHistory() {
  if (typeof window === 'undefined') return []
  window.localStorage.setItem(alertHistoryStorageKey, JSON.stringify([]))
  void clearPersistentAlertHistory()
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


export type RouteActivityItem = {
  id: string
  title: string
  body: string
  route: string
  occurredAt: string
  tone: 'green' | 'blue' | 'yellow' | 'pink'
}

export function buildRouteActivityFeed(limit = 24): RouteActivityItem[] {
  if (typeof window === 'undefined') return []
  const alertItems = loadAlertHistory().map((alert) => ({
    id: `alert-${alert.id}`,
    title: alert.title,
    body: alert.body,
    route: alert.route,
    occurredAt: alert.generatedAt,
    tone: alert.severity === 'good' ? 'green' as const : alert.severity === 'warning' ? 'yellow' as const : alert.type === 'Watchlist activity' ? 'pink' as const : 'blue' as const
  }))
  const communityItems = loadCommunityLoads().map((report: CommunityLoadReport) => ({
    id: `community-${report.id}`,
    title: `${report.flightNumber} Community load updated`,
    body: `${report.availableSeats} seats available · ${report.standbyCount} standby · ${relativeCommunityLoadTime(report.createdAt)}`,
    route: report.route,
    occurredAt: report.createdAt,
    tone: 'green' as const
  }))
  const watchItems = loadSavedTripWatchlist().map((watch) => ({
    id: `watch-${watch.id}`,
    title: `Watching ${watch.watchLabel || watch.selectedItinerary}`,
    body: `${watch.watchType || 'route'} watch · ${watch.carrier} · ${watch.travelDate}`,
    route: watch.selectedItinerary,
    occurredAt: watch.lastUpdated,
    tone: 'pink' as const
  }))
  return [...alertItems, ...communityItems, ...watchItems]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, limit)
}

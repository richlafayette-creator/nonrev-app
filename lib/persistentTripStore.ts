import { buildDisruptionIntelligence } from './disruptionIntelligence'
import { calculateRouteConfidence } from './routeConfidence'
import { defaultTravelerProfile } from './travelerProfile'
import { type RealTimeAlert, type AlertSnapshot } from './alerts'
import { type SavedTripWatch } from './watchlist'

export const persistentWatchlistTableName = 'nonrevy_watchlist_items'
export const persistentAlertHistoryTableName = 'nonrevy_alert_history'
export const persistentAlertSnapshotTableName = 'nonrevy_alert_snapshots'

export type PersistentStoreStatus = 'ready' | 'missing-config' | 'unreachable'

export type PersistentStoreResult<T> = {
  status: PersistentStoreStatus
  storageMode: 'supabase' | 'local-fallback'
  data: T
  detail: string
}

type SupabaseConfig = {
  supabaseUrl: string
  serviceRoleKey: string
}

type WatchRow = {
  id: string
  user_id: string
  payload: SavedTripWatch
  created_at?: string
  updated_at?: string
}

type AlertRow = {
  id: string
  user_id: string
  event_key?: string
  read?: boolean
  payload: RealTimeAlert
  created_at?: string
  updated_at?: string
}

type SnapshotRow = {
  id: string
  user_id: string
  target_id?: string
  target_type?: string
  payload: AlertSnapshot
  updated_at?: string
}

function supabaseConfig(): SupabaseConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceRoleKey) return null
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), serviceRoleKey }
}

function headers(config: SupabaseConfig, extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra
  }
}

function safeMessage(value: unknown) {
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : 'Request failed'
  return raw
    .replace(/apikey[=:]\s*[^&\s]+/gi, 'apikey=[hidden]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [hidden]')
    .slice(0, 180)
}

function missingConfig<T>(data: T): PersistentStoreResult<T> {
  return {
    status: 'missing-config',
    storageMode: 'local-fallback',
    data,
    detail: 'Server-side Supabase persistence is not configured; local browser storage remains active.'
  }
}

function rowId(userId: string, id: string) {
  return `${userId}:${id}`
}

function snapshotId(userId: string, snapshot: Pick<AlertSnapshot, 'targetType' | 'targetId'>) {
  return `${userId}:${snapshot.targetType}:${snapshot.targetId}`
}

function encodeFilterValue(value: string) {
  return encodeURIComponent(value)
}

async function readJsonSafely(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function supabaseFetch(config: SupabaseConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: headers(config, init.headers || {}),
    cache: 'no-store'
  })
  const data = await readJsonSafely(response)
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : `Supabase returned ${response.status}`
    throw new Error(message)
  }
  return data
}

export async function listPersistentWatches(userId: string): Promise<PersistentStoreResult<SavedTripWatch[]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  try {
    const rows = await supabaseFetch(config, `${persistentWatchlistTableName}?select=payload&user_id=eq.${encodeFilterValue(userId)}&order=updated_at.desc`) as Array<{ payload?: SavedTripWatch }>
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: rows.map((row) => row.payload).filter((watch): watch is SavedTripWatch => Boolean(watch?.id)),
      detail: 'Persistent watchlist loaded from Supabase.'
    }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: [], detail: `Persistent watchlist unavailable. ${safeMessage(error)}` }
  }
}

export async function upsertPersistentWatch(userId: string, watch: SavedTripWatch): Promise<PersistentStoreResult<SavedTripWatch | null>> {
  const config = supabaseConfig()
  if (!config) return missingConfig(null)
  try {
    const now = new Date().toISOString()
    const row: WatchRow = {
      id: rowId(userId, watch.id),
      user_id: userId,
      payload: watch,
      created_at: watch.lastUpdated || now,
      updated_at: now
    }
    const rows = await supabaseFetch(config, `${persistentWatchlistTableName}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row)
    }) as WatchRow[]
    return { status: 'ready', storageMode: 'supabase', data: rows[0]?.payload || watch, detail: 'Watch persisted to Supabase.' }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: null, detail: `Watch persistence unavailable. ${safeMessage(error)}` }
  }
}

export async function upsertPersistentWatches(userId: string, watches: SavedTripWatch[]): Promise<PersistentStoreResult<SavedTripWatch[]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  if (!watches.length) return { status: 'ready', storageMode: 'supabase', data: [], detail: 'No watches to persist.' }
  try {
    const now = new Date().toISOString()
    const rows: WatchRow[] = watches.map((watch) => ({
      id: rowId(userId, watch.id),
      user_id: userId,
      payload: watch,
      created_at: watch.lastUpdated || now,
      updated_at: now
    }))
    const savedRows = await supabaseFetch(config, `${persistentWatchlistTableName}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows)
    }) as WatchRow[]
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: savedRows.map((row) => row.payload).filter((watch): watch is SavedTripWatch => Boolean(watch?.id)),
      detail: 'Watches persisted to Supabase.'
    }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: [], detail: `Watch persistence unavailable. ${safeMessage(error)}` }
  }
}

export async function deletePersistentWatch(userId: string, watchId: string): Promise<PersistentStoreResult<boolean>> {
  const config = supabaseConfig()
  if (!config) return missingConfig(false)
  try {
    await supabaseFetch(config, `${persistentWatchlistTableName}?id=eq.${encodeFilterValue(rowId(userId, watchId))}`, { method: 'DELETE' })
    return { status: 'ready', storageMode: 'supabase', data: true, detail: 'Watch removed from Supabase.' }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: false, detail: `Watch removal unavailable. ${safeMessage(error)}` }
  }
}

export async function listPersistentAlerts(userId: string): Promise<PersistentStoreResult<RealTimeAlert[]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  try {
    const rows = await supabaseFetch(config, `${persistentAlertHistoryTableName}?select=payload,read&user_id=eq.${encodeFilterValue(userId)}&order=created_at.desc&limit=120`) as Array<{ payload?: RealTimeAlert; read?: boolean }>
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: rows.map((row) => row.payload ? { ...row.payload, read: row.read ?? row.payload.read } : null).filter((alert): alert is RealTimeAlert => Boolean(alert?.id)),
      detail: 'Persistent alerts loaded from Supabase.'
    }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: [], detail: `Persistent alerts unavailable. ${safeMessage(error)}` }
  }
}

export async function upsertPersistentAlerts(userId: string, alerts: RealTimeAlert[]): Promise<PersistentStoreResult<RealTimeAlert[]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  if (!alerts.length) return { status: 'ready', storageMode: 'supabase', data: [], detail: 'No alerts to persist.' }
  try {
    const rows: AlertRow[] = alerts.slice(0, 120).map((alert) => ({
      id: rowId(userId, alert.id),
      user_id: userId,
      event_key: alert.eventKey,
      read: alert.read,
      payload: alert,
      created_at: alert.generatedAt,
      updated_at: new Date().toISOString()
    }))
    const savedRows = await supabaseFetch(config, `${persistentAlertHistoryTableName}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows)
    }) as AlertRow[]
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: savedRows.map((row) => row.payload).filter((alert): alert is RealTimeAlert => Boolean(alert?.id)),
      detail: 'Alerts persisted to Supabase.'
    }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: [], detail: `Alert persistence unavailable. ${safeMessage(error)}` }
  }
}

export async function setPersistentAlertRead(userId: string, alertId: string, read: boolean): Promise<PersistentStoreResult<boolean>> {
  const config = supabaseConfig()
  if (!config) return missingConfig(false)
  try {
    const rows = await supabaseFetch(config, `${persistentAlertHistoryTableName}?select=payload&id=eq.${encodeFilterValue(rowId(userId, alertId))}&limit=1`) as Array<{ payload?: RealTimeAlert }>
    const payload = rows[0]?.payload ? { ...rows[0].payload, read } : undefined
    await supabaseFetch(config, `${persistentAlertHistoryTableName}?id=eq.${encodeFilterValue(rowId(userId, alertId))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload ? { read, payload, updated_at: new Date().toISOString() } : { read, updated_at: new Date().toISOString() })
    })
    return { status: 'ready', storageMode: 'supabase', data: true, detail: 'Alert read state persisted.' }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: false, detail: `Alert read persistence unavailable. ${safeMessage(error)}` }
  }
}

export async function markAllPersistentAlertsRead(userId: string): Promise<PersistentStoreResult<boolean>> {
  const config = supabaseConfig()
  if (!config) return missingConfig(false)
  try {
    const alerts = await listPersistentAlerts(userId)
    await upsertPersistentAlerts(userId, alerts.data.map((alert) => ({ ...alert, read: true })))
    return { status: 'ready', storageMode: 'supabase', data: true, detail: 'All alert read states persisted.' }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: false, detail: `Alert read persistence unavailable. ${safeMessage(error)}` }
  }
}

export async function clearPersistentAlerts(userId: string): Promise<PersistentStoreResult<boolean>> {
  const config = supabaseConfig()
  if (!config) return missingConfig(false)
  try {
    await supabaseFetch(config, `${persistentAlertHistoryTableName}?user_id=eq.${encodeFilterValue(userId)}`, { method: 'DELETE' })
    return { status: 'ready', storageMode: 'supabase', data: true, detail: 'Persistent alert history cleared.' }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: false, detail: `Persistent alert clear unavailable. ${safeMessage(error)}` }
  }
}

export async function listPersistentAlertSnapshots(userId: string): Promise<PersistentStoreResult<AlertSnapshot[]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  try {
    const rows = await supabaseFetch(config, `${persistentAlertSnapshotTableName}?select=payload&user_id=eq.${encodeFilterValue(userId)}&order=updated_at.desc`) as Array<{ payload?: AlertSnapshot }>
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: rows.map((row) => row.payload).filter((snapshot): snapshot is AlertSnapshot => Boolean(snapshot?.targetId)),
      detail: 'Persistent alert snapshots loaded from Supabase.'
    }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: [], detail: `Persistent alert snapshots unavailable. ${safeMessage(error)}` }
  }
}

export async function upsertPersistentAlertSnapshots(userId: string, snapshots: AlertSnapshot[]): Promise<PersistentStoreResult<AlertSnapshot[]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  if (!snapshots.length) return { status: 'ready', storageMode: 'supabase', data: [], detail: 'No alert snapshots to persist.' }
  try {
    const rows: SnapshotRow[] = snapshots.map((snapshot) => ({
      id: snapshotId(userId, snapshot),
      user_id: userId,
      target_id: snapshot.targetId,
      target_type: snapshot.targetType,
      payload: snapshot,
      updated_at: snapshot.updatedAt || new Date().toISOString()
    }))
    const savedRows = await supabaseFetch(config, `${persistentAlertSnapshotTableName}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows)
    }) as SnapshotRow[]
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: savedRows.map((row) => row.payload).filter((snapshot): snapshot is AlertSnapshot => Boolean(snapshot?.targetId)),
      detail: 'Alert snapshots persisted to Supabase.'
    }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: [], detail: `Alert snapshot persistence unavailable. ${safeMessage(error)}` }
  }
}

function targetLabel(watch: SavedTripWatch) {
  return watch.watchLabel || `${watch.origin} → ${watch.destination}`
}

function buildWatchAlert(watch: SavedTripWatch, previous: AlertSnapshot | undefined): { alert: RealTimeAlert | null; snapshot: AlertSnapshot } {
  const disruption = buildDisruptionIntelligence({ route: watch.selectedItinerary })
  const confidence = calculateRouteConfidence({
    route: watch.selectedItinerary,
    successProbability: watch.successProbability,
    historicalScore: watch.score,
    historicalSuccessRate: watch.successProbability,
    historicalReportCount: 0,
    communityReportCount: 0,
    travelerProfile: defaultTravelerProfile,
    disruption,
    communityLoadAdjustment: 0,
    previousConfidenceScore: previous?.confidenceScore ?? watch.routeConfidenceScore,
    updateTrigger: 'watchlist-viewed'
  })
  const snapshot: AlertSnapshot = {
    targetId: watch.id,
    targetType: 'watched-route',
    route: watch.selectedItinerary,
    confidenceScore: confidence.score,
    successProbability: watch.successProbability,
    disruptionImpactScore: disruption.disruptionImpactScore,
    weatherImpactScore: confidence.weatherImpact.scoreImpact,
    updatedAt: new Date().toISOString()
  }

  const previousConfidence = previous?.confidenceScore ?? watch.routeConfidenceScore
  const confidenceDelta = Number.isFinite(previousConfidence) ? confidence.score - Math.round(previousConfidence || confidence.score) : 0
  const disruptionDelta = previous ? disruption.disruptionImpactScore - previous.disruptionImpactScore : 0
  let type: RealTimeAlert['type'] | null = null
  let severity: RealTimeAlert['severity'] = 'info'
  let title = ''
  let body = ''
  let metricLabel = 'Route confidence'
  let metricValue = `${confidence.score}/100`
  let details = confidence.explanation
  let eventSuffix = `${confidence.score}`

  if (confidenceDelta >= 4) {
    type = 'Confidence increased'
    severity = 'good'
    title = `Confidence increased for ${targetLabel(watch)}`
    body = `${watch.selectedItinerary} is now ${confidence.score}/100 (${confidence.badge}), +${confidenceDelta} from the last persistent snapshot.`
  } else if (confidenceDelta <= -4) {
    type = 'Confidence decreased'
    severity = 'warning'
    title = `Confidence decreased for ${targetLabel(watch)}`
    body = `${watch.selectedItinerary} is now ${confidence.score}/100 (${confidence.badge}), ${confidenceDelta} from the last persistent snapshot.`
  } else if (disruption.routeHealth !== 'Green' || disruption.disruptionImpactScore >= 22 || disruptionDelta >= 8) {
    type = 'Disruption detected'
    severity = disruption.routeHealth === 'Red' ? 'critical' : 'warning'
    title = `Disruption detected on ${watch.selectedItinerary}`
    body = `Route health is ${disruption.routeHealth} with ${disruption.disruptionImpactScore}/99 disruption impact.`
    metricLabel = 'Disruption impact'
    metricValue = `${disruption.disruptionImpactScore}/99`
    details = disruption.explanation
    eventSuffix = `${disruption.routeHealth}:${disruption.disruptionImpactScore}`
  }

  if (!type) return { alert: null, snapshot }

  const eventKey = `watched-route:${watch.id}:${type}:${eventSuffix}`
  return {
    snapshot,
    alert: {
      id: `${eventKey}:${Date.now()}`,
      eventKey,
      type,
      severity,
      targetId: watch.id,
      targetType: 'watched-route',
      targetLabel: targetLabel(watch),
      route: watch.selectedItinerary,
      carrier: watch.carrier,
      title,
      body,
      metricLabel,
      metricValue,
      generatedAt: new Date().toISOString(),
      read: false,
      source: 'watchlist',
      details
    }
  }
}

export async function refreshPersistentWatchAlerts(userId: string, watches: SavedTripWatch[], existingAlerts: RealTimeAlert[] = []): Promise<PersistentStoreResult<{ alerts: RealTimeAlert[]; snapshots: AlertSnapshot[] }>> {
  const config = supabaseConfig()
  if (!config) return missingConfig({ alerts: existingAlerts, snapshots: [] })

  const remoteSnapshots = await listPersistentAlertSnapshots(userId)
  const previousByTarget = new Map(remoteSnapshots.data.map((snapshot) => [`${snapshot.targetType}:${snapshot.targetId}`, snapshot]))
  const existingEventKeys = new Set(existingAlerts.map((alert) => alert.eventKey))
  const built = watches.map((watch) => buildWatchAlert(watch, previousByTarget.get(`watched-route:${watch.id}`)))
  const snapshots = built.map((item) => item.snapshot)
  const newAlerts = built.map((item) => item.alert).filter((alert): alert is RealTimeAlert => Boolean(alert && !existingEventKeys.has(alert.eventKey)))
  const history = [...newAlerts, ...existingAlerts]
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))
    .slice(0, 120)

  await upsertPersistentAlertSnapshots(userId, snapshots)
  if (newAlerts.length) await upsertPersistentAlerts(userId, history)
  const remoteAlerts = await listPersistentAlerts(userId)
  return {
    status: remoteAlerts.status === 'ready' ? 'ready' : remoteAlerts.status,
    storageMode: remoteAlerts.storageMode,
    data: { alerts: remoteAlerts.data.length ? remoteAlerts.data : history, snapshots },
    detail: remoteAlerts.detail
  }
}

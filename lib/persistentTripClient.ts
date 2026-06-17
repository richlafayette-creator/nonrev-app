import type { AlertSnapshot, RealTimeAlert } from './alerts'
import type { SavedTripWatch } from './watchlist'

const alertHistoryStorageKey = 'nonrevy.alertHistory'
const alertSnapshotStorageKey = 'nonrevy.alertSnapshots'
const savedTripWatchlistStorageKey = 'nonrevy.savedTripWatchlist'
const deviceIdStorageKey = 'nonrevy.persistentDeviceId'

function isBrowser() {
  return typeof window !== 'undefined'
}

function persistentDeviceId() {
  if (!isBrowser()) return 'server'
  try {
    const existing = window.localStorage.getItem(deviceIdStorageKey)
    if (existing) return existing
    const created = `device-${crypto.randomUUID?.() || Date.now()}`
    window.localStorage.setItem(deviceIdStorageKey, created)
    return created
  } catch {
    return 'device-local-fallback'
  }
}

async function authHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-nonrevy-device-id': persistentDeviceId()
  }

  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    // Supabase auth is optional for local/dev fallback; API will use the device id.
  }

  return headers
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!isBrowser()) return null
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(await authHeaders()),
        ...(init.headers || {})
      },
      cache: 'no-store'
    })
    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}

function uniqueWatches(watches: SavedTripWatch[]) {
  const merged = new Map<string, SavedTripWatch>()
  watches
    .sort((a, b) => Date.parse(b.lastUpdated || '') - Date.parse(a.lastUpdated || ''))
    .forEach((watch) => {
      if (!merged.has(watch.id)) merged.set(watch.id, watch)
    })
  return [...merged.values()]
}

function uniqueAlerts(alerts: RealTimeAlert[]) {
  const merged = new Map<string, RealTimeAlert>()
  alerts
    .sort((a, b) => Date.parse(b.generatedAt || '') - Date.parse(a.generatedAt || ''))
    .forEach((alert) => {
      const existing = merged.get(alert.eventKey)
      if (!existing) merged.set(alert.eventKey, alert)
      else merged.set(alert.eventKey, { ...alert, read: existing.read && alert.read })
    })
  return [...merged.values()].slice(0, 120)
}

function uniqueSnapshots(snapshots: AlertSnapshot[]) {
  const merged = new Map<string, AlertSnapshot>()
  snapshots
    .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
    .forEach((snapshot) => {
      const key = `${snapshot.targetType}:${snapshot.targetId}`
      if (!merged.has(key)) merged.set(key, snapshot)
    })
  return [...merged.values()]
}

export async function syncPersistentWatchlist(localWatches: SavedTripWatch[] = []) {
  const result = await apiFetch<{ watches?: SavedTripWatch[] }>('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ watches: localWatches })
  })
  const merged = uniqueWatches([...(result?.watches || []), ...localWatches])
  if (isBrowser()) {
    window.localStorage.setItem(savedTripWatchlistStorageKey, JSON.stringify(merged))
  }
  return merged
}

export async function persistWatch(watch: SavedTripWatch) {
  return apiFetch<{ watch?: SavedTripWatch }>('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ watch })
  })
}

export async function removePersistentWatch(watchId: string) {
  return apiFetch<{ removed?: boolean }>(`/api/watchlist/${encodeURIComponent(watchId)}`, { method: 'DELETE' })
}

export async function syncPersistentAlerts(localAlerts: RealTimeAlert[] = [], localSnapshots: AlertSnapshot[] = []) {
  const result = await apiFetch<{ alerts?: RealTimeAlert[]; snapshots?: AlertSnapshot[] }>('/api/alerts/refresh', {
    method: 'POST',
    body: JSON.stringify({ alerts: localAlerts, snapshots: localSnapshots })
  })
  const mergedAlerts = uniqueAlerts([...(result?.alerts || []), ...localAlerts])
  const mergedSnapshots = uniqueSnapshots([...(result?.snapshots || []), ...localSnapshots])
  if (isBrowser()) {
    window.localStorage.setItem(alertHistoryStorageKey, JSON.stringify(mergedAlerts))
    window.localStorage.setItem(alertSnapshotStorageKey, JSON.stringify(mergedSnapshots))
  }
  return { alerts: mergedAlerts, snapshots: mergedSnapshots }
}

export async function persistAlerts(alerts: RealTimeAlert[]) {
  return apiFetch<{ alerts?: RealTimeAlert[] }>('/api/alerts', {
    method: 'POST',
    body: JSON.stringify({ alerts })
  })
}

export async function persistAlertSnapshots(snapshots: AlertSnapshot[]) {
  return apiFetch<{ snapshots?: AlertSnapshot[] }>('/api/alerts/snapshots', {
    method: 'POST',
    body: JSON.stringify({ snapshots })
  })
}

export async function markPersistentAlertRead(alertId: string) {
  return apiFetch<{ updated?: boolean }>(`/api/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ read: true })
  })
}

export async function markAllPersistentAlertsRead() {
  return apiFetch<{ updated?: boolean }>('/api/alerts', {
    method: 'PATCH',
    body: JSON.stringify({ read: true })
  })
}

export async function clearPersistentAlertHistory() {
  return apiFetch<{ cleared?: boolean }>('/api/alerts', { method: 'DELETE' })
}

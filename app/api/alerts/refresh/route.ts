import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../../lib/apiIdentity'
import { listPersistentWatches, refreshPersistentWatchAlerts, upsertPersistentAlertSnapshots, upsertPersistentAlerts, upsertPersistentWatches } from '../../../../lib/persistentTripStore'
import type { AlertSnapshot, RealTimeAlert } from '../../../../lib/alerts'
import type { SavedTripWatch } from '../../../../lib/watchlist'

export const dynamic = 'force-dynamic'

type RefreshBody = {
  watches?: SavedTripWatch[]
  alerts?: RealTimeAlert[]
  snapshots?: AlertSnapshot[]
}

function validWatch(value: unknown): value is SavedTripWatch {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'selectedItinerary' in value)
}

function validAlert(value: unknown): value is RealTimeAlert {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'eventKey' in value && 'generatedAt' in value)
}

function validSnapshot(value: unknown): value is AlertSnapshot {
  return Boolean(value && typeof value === 'object' && 'targetId' in value && 'targetType' in value && 'updatedAt' in value)
}

export async function POST(request: Request) {
  let body: RefreshBody = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const userId = persistentUserId(request)
  const localWatches = Array.isArray(body.watches) ? body.watches.filter(validWatch) : []
  const localAlerts = Array.isArray(body.alerts) ? body.alerts.filter(validAlert) : []
  const localSnapshots = Array.isArray(body.snapshots) ? body.snapshots.filter(validSnapshot) : []

  if (localWatches.length) await upsertPersistentWatches(userId, localWatches)
  if (localAlerts.length) await upsertPersistentAlerts(userId, localAlerts)
  if (localSnapshots.length) await upsertPersistentAlertSnapshots(userId, localSnapshots)

  const watches = await listPersistentWatches(userId)
  const effectiveWatches = watches.data.length ? watches.data : localWatches
  const refreshed = await refreshPersistentWatchAlerts(userId, effectiveWatches, localAlerts)

  return NextResponse.json({
    watches: effectiveWatches,
    alerts: refreshed.data.alerts,
    snapshots: refreshed.data.snapshots,
    storageMode: refreshed.storageMode,
    status: refreshed.status,
    detail: refreshed.detail
  })
}

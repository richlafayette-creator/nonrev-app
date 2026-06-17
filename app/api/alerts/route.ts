import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../lib/apiIdentity'
import { clearPersistentAlerts, listPersistentAlerts, markAllPersistentAlertsRead, upsertPersistentAlerts } from '../../../lib/persistentTripStore'
import type { RealTimeAlert } from '../../../lib/alerts'

export const dynamic = 'force-dynamic'

type AlertsBody = {
  alerts?: RealTimeAlert[]
  read?: boolean
}

function validAlert(value: unknown): value is RealTimeAlert {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'eventKey' in value && 'generatedAt' in value)
}

export async function GET(request: Request) {
  const result = await listPersistentAlerts(persistentUserId(request))
  return NextResponse.json({ alerts: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function POST(request: Request) {
  let body: AlertsBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const alerts = Array.isArray(body.alerts) ? body.alerts.filter(validAlert) : []
  const result = await upsertPersistentAlerts(persistentUserId(request), alerts)
  return NextResponse.json({ alerts: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function PATCH(request: Request) {
  let body: AlertsBody = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  if (body.read !== true) return NextResponse.json({ error: 'Only read=true bulk updates are supported.' }, { status: 400 })
  const result = await markAllPersistentAlertsRead(persistentUserId(request))
  return NextResponse.json({ updated: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function DELETE(request: Request) {
  const result = await clearPersistentAlerts(persistentUserId(request))
  return NextResponse.json({ cleared: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

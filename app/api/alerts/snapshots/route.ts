import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../../lib/apiIdentity'
import { listPersistentAlertSnapshots, upsertPersistentAlertSnapshots } from '../../../../lib/persistentTripStore'
import type { AlertSnapshot } from '../../../../lib/alerts'

export const dynamic = 'force-dynamic'

type SnapshotBody = {
  snapshots?: AlertSnapshot[]
}

function validSnapshot(value: unknown): value is AlertSnapshot {
  return Boolean(value && typeof value === 'object' && 'targetId' in value && 'targetType' in value && 'updatedAt' in value)
}

export async function GET(request: Request) {
  const result = await listPersistentAlertSnapshots(persistentUserId(request))
  return NextResponse.json({ snapshots: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function POST(request: Request) {
  let body: SnapshotBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const snapshots = Array.isArray(body.snapshots) ? body.snapshots.filter(validSnapshot) : []
  const result = await upsertPersistentAlertSnapshots(persistentUserId(request), snapshots)
  return NextResponse.json({ snapshots: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../../lib/apiIdentity'
import { setPersistentAlertRead } from '../../../../lib/persistentTripStore'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let body: { read?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  if (!id) return NextResponse.json({ error: 'Alert id is required.' }, { status: 400 })
  const result = await setPersistentAlertRead(persistentUserId(request), decodeURIComponent(id), body.read !== false)
  return NextResponse.json({ updated: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

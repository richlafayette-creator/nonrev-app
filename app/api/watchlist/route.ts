import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../lib/apiIdentity'
import { listPersistentWatches, upsertPersistentWatch, upsertPersistentWatches } from '../../../lib/persistentTripStore'
import type { SavedTripWatch } from '../../../lib/watchlist'

export const dynamic = 'force-dynamic'

type WatchlistBody = {
  watch?: SavedTripWatch
  watches?: SavedTripWatch[]
}

function validWatch(value: unknown): value is SavedTripWatch {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'selectedItinerary' in value)
}

export async function GET(request: Request) {
  const userId = persistentUserId(request)
  const result = await listPersistentWatches(userId)
  return NextResponse.json({ watches: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function POST(request: Request) {
  const userId = persistentUserId(request)
  let body: WatchlistBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (validWatch(body.watch)) {
    const result = await upsertPersistentWatch(userId, body.watch)
    const watches = await listPersistentWatches(userId)
    return NextResponse.json({ watch: result.data, watches: watches.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
  }

  const watchesToPersist = Array.isArray(body.watches) ? body.watches.filter(validWatch) : []
  if (watchesToPersist.length) await upsertPersistentWatches(userId, watchesToPersist)
  const result = await listPersistentWatches(userId)
  return NextResponse.json({ watches: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../lib/apiIdentity'
import { listAccountBetaRecords, upsertAccountBetaRecords } from '../../../lib/accountBetaStore'
import type { SavedSearch } from '../../../lib/savedSearches'

export const dynamic = 'force-dynamic'

type SavedSearchBody = {
  search?: SavedSearch
  searches?: SavedSearch[]
}

function validSavedSearch(value: unknown): value is SavedSearch {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'query' in value && 'kind' in value)
}

export async function GET(request: Request) {
  const result = await listAccountBetaRecords('saved-searches', persistentUserId(request), 200)
  return NextResponse.json({ searches: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function POST(request: Request) {
  let body: SavedSearchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const records = validSavedSearch(body.search)
    ? [body.search]
    : Array.isArray(body.searches) ? body.searches.filter(validSavedSearch) : []

  if (records.length) await upsertAccountBetaRecords('saved-searches', persistentUserId(request), records)
  const result = await listAccountBetaRecords('saved-searches', persistentUserId(request), 200)
  return NextResponse.json({ search: records[0] || null, searches: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

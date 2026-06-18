import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../lib/apiIdentity'
import { listAccountBetaRecords, upsertAccountBetaRecords } from '../../../lib/accountBetaStore'
import type { TripOutcome } from '../../../lib/outcomeRepository'

export const dynamic = 'force-dynamic'

type OutcomesBody = {
  outcome?: TripOutcome
  outcomes?: TripOutcome[]
}

function validOutcome(value: unknown): value is TripOutcome {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'route' in value && 'status' in value && 'createdAt' in value)
}

export async function GET(request: Request) {
  const result = await listAccountBetaRecords('outcomes', persistentUserId(request), 500)
  return NextResponse.json({ outcomes: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function POST(request: Request) {
  let body: OutcomesBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const outcomes = validOutcome(body.outcome)
    ? [body.outcome]
    : Array.isArray(body.outcomes) ? body.outcomes.filter(validOutcome) : []

  if (outcomes.length) await upsertAccountBetaRecords('outcomes', persistentUserId(request), outcomes)
  const result = await listAccountBetaRecords('outcomes', persistentUserId(request), 500)
  return NextResponse.json({ outcome: outcomes[0] || null, outcomes: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

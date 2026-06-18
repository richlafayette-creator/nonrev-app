import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../lib/apiIdentity'
import { clearAccountBetaRecords, listAccountBetaRecords, upsertAccountBetaRecords } from '../../../lib/accountBetaStore'
import type { BetaFeedbackRecord } from '../../../lib/betaFeedback'

export const dynamic = 'force-dynamic'

type BetaFeedbackBody = {
  record?: BetaFeedbackRecord
  records?: BetaFeedbackRecord[]
}

function validFeedback(value: unknown): value is BetaFeedbackRecord {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'message' in value && 'createdAt' in value)
}

export async function GET(request: Request) {
  const result = await listAccountBetaRecords('beta-feedback', persistentUserId(request), 200)
  return NextResponse.json({ records: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function POST(request: Request) {
  let body: BetaFeedbackBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const records = validFeedback(body.record)
    ? [body.record]
    : Array.isArray(body.records) ? body.records.filter(validFeedback) : []

  if (records.length) await upsertAccountBetaRecords('beta-feedback', persistentUserId(request), records)
  const result = await listAccountBetaRecords('beta-feedback', persistentUserId(request), 200)
  return NextResponse.json({ record: records[0] || null, records: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function DELETE(request: Request) {
  const result = await clearAccountBetaRecords('beta-feedback', persistentUserId(request))
  return NextResponse.json({ cleared: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

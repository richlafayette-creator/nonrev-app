import { NextResponse } from 'next/server'
import type { BetaFeedbackRecord } from '../../../lib/betaFeedback'

export const dynamic = 'force-dynamic'

const stubDetail = 'Beta feedback backend stub is active. Feedback remains local in this beta build.'

type BetaFeedbackBody = {
  record?: BetaFeedbackRecord
  records?: BetaFeedbackRecord[]
}

function validFeedback(value: unknown): value is BetaFeedbackRecord {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'message' in value && 'createdAt' in value)
}

function stubResponse(records: BetaFeedbackRecord[] = []) {
  return NextResponse.json({
    records,
    storageMode: 'stub',
    status: 'stubbed',
    detail: stubDetail
  })
}

export async function GET() {
  return stubResponse()
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

  return NextResponse.json({
    record: records[0] || null,
    records,
    storageMode: 'stub',
    status: 'stubbed',
    detail: stubDetail
  })
}

export async function DELETE() {
  return NextResponse.json({
    cleared: true,
    storageMode: 'stub',
    status: 'stubbed',
    detail: stubDetail
  })
}

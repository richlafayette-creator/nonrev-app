import { NextResponse } from 'next/server'
import type { BetaFeedbackRecord } from '../../../../lib/betaFeedback'

export const dynamic = 'force-dynamic'

const stubDetail = 'Beta feedback backend stub is active. Feedback remains local in this beta build.'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Feedback id is required.' }, { status: 400 })

  let body: Partial<BetaFeedbackRecord> = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const record = { ...body, id: decodeURIComponent(id) }
  return NextResponse.json({
    updated: true,
    record,
    storageMode: 'stub',
    status: 'stubbed',
    detail: stubDetail
  })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Feedback id is required.' }, { status: 400 })

  return NextResponse.json({
    removed: true,
    id: decodeURIComponent(id),
    storageMode: 'stub',
    status: 'stubbed',
    detail: stubDetail
  })
}

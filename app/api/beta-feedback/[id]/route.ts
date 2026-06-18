import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../../lib/apiIdentity'
import { deleteAccountBetaRecord, listAccountBetaRecords, upsertAccountBetaRecords } from '../../../../lib/accountBetaStore'
import type { BetaFeedbackRecord } from '../../../../lib/betaFeedback'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Feedback id is required.' }, { status: 400 })
  const userId = persistentUserId(request)
  const existing = await listAccountBetaRecords('beta-feedback', userId, 200)
  const record = existing.data.find((item) => item.id === decodeURIComponent(id))
  if (!record) return NextResponse.json({ updated: false, storageMode: existing.storageMode, status: existing.status, detail: existing.detail })
  let body: Partial<BetaFeedbackRecord> = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const next = { ...record, ...body, id: record.id }
  const result = await upsertAccountBetaRecords('beta-feedback', userId, [next])
  return NextResponse.json({ updated: Boolean(result.data[0]), record: result.data[0] || next, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Feedback id is required.' }, { status: 400 })
  const result = await deleteAccountBetaRecord('beta-feedback', persistentUserId(request), decodeURIComponent(id))
  return NextResponse.json({ removed: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

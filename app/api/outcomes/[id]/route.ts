import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../../lib/apiIdentity'
import { deleteAccountBetaRecord } from '../../../../lib/accountBetaStore'

export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Outcome id is required.' }, { status: 400 })
  const result = await deleteAccountBetaRecord('outcomes', persistentUserId(request), decodeURIComponent(id))
  return NextResponse.json({ removed: result.data, storageMode: result.storageMode, status: result.status, detail: result.detail })
}

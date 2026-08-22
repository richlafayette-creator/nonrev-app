import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../lib/apiIdentity'
import {
  answerAccountLoadRequest,
  cancelAccountLoadRequest,
  closeAccountLoadRequest,
  createAccountLoadRequest,
  listAccountLoadRequests,
  listOpenResponderLoadRequests,
  type AccountLoadResponseInput,
  type AccountLoadRequestInput
} from '../../../lib/loadRequestAccountStore'

export const dynamic = 'force-dynamic'

type LoadRequestBody = {
  action?: 'create' | 'cancel' | 'answer' | 'close'
  request?: AccountLoadRequestInput
  requestId?: string | number
  response?: Partial<AccountLoadResponseInput> & { responderToken?: string }
  responderToken?: string
}

function safeError(detail: string) {
  return detail.replace(/Supabase|SQL|PostgREST|schema cache/gi, 'account store').slice(0, 180)
}

function bodyRequest(value: unknown): AccountLoadRequestInput | null {
  if (!value || typeof value !== 'object') return null
  const maybe = value as Partial<AccountLoadRequestInput>
  return {
    carrier: String(maybe.carrier || ''),
    flightNumber: String(maybe.flightNumber || ''),
    origin: String(maybe.origin || ''),
    destination: String(maybe.destination || ''),
    scheduledDepartureUtc: String(maybe.scheduledDepartureUtc || ''),
    ...(maybe.scheduledArrivalUtc ? { scheduledArrivalUtc: String(maybe.scheduledArrivalUtc) } : {}),
    ...(maybe.travelDate ? { travelDate: String(maybe.travelDate) } : {}),
    ...(maybe.provider ? { provider: String(maybe.provider) } : {}),
    ...(maybe.provenance ? { provenance: String(maybe.provenance) } : {})
  }
}

function responderAuthorization(request: Request, body: LoadRequestBody) {
  const configured = process.env.NONREVY_RESPONDER_TOKEN || ''
  if (!configured) return { configured: false, authorized: false }
  const token = request.headers.get('x-nonrevy-responder-token') || body.responderToken || body.response?.responderToken || ''
  return { configured: true, authorized: token === configured }
}

function responseStatus(status: string) {
  if (status === 'forbidden') return 403
  if (status === 'invalid') return 400
  if (status === 'unreachable' || status === 'missing-config') return 503
  return 200
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const scope = url.searchParams.get('scope')
  const limit = Number(url.searchParams.get('limit') || 100)
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.round(limit))) : 100
  const result = scope === 'open'
    ? await listOpenResponderLoadRequests(boundedLimit)
    : await listAccountLoadRequests(persistentUserId(request), boundedLimit)

  return NextResponse.json({
    requests: result.data,
    storageMode: result.storageMode,
    status: result.status,
    detail: safeError(result.detail)
  })
}

export async function POST(request: Request) {
  let body: LoadRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const loadRequest = bodyRequest(body.request || body)
  if (body.action === 'cancel') {
    const result = await cancelAccountLoadRequest(persistentUserId(request), body.requestId || '')
    return NextResponse.json({
      request: result.data,
      storageMode: result.storageMode,
      status: result.status,
      detail: safeError(result.detail),
      ...(result.status === 'invalid' || result.status === 'forbidden' ? { error: safeError(result.detail) } : {})
    }, { status: responseStatus(result.status) })
  }

  if (body.action === 'answer' || body.action === 'close') {
    const auth = responderAuthorization(request, body)
    if (!auth.configured) {
      return NextResponse.json({
        error: 'Responder authorization is not configured.',
        status: 'missing-config',
        storageMode: 'local-fallback',
        detail: 'Responder authorization is not configured.'
      }, { status: 503 })
    }
    if (body.action === 'close') {
      const result = await closeAccountLoadRequest({
        requestId: body.requestId || '',
        responderId: persistentUserId(request),
        authorizedResponder: auth.authorized
      })
      return NextResponse.json({
        request: result.data,
        storageMode: result.storageMode,
        status: result.status,
        detail: safeError(result.detail),
        ...(result.status === 'invalid' || result.status === 'forbidden' ? { error: safeError(result.detail) } : {})
      }, { status: responseStatus(result.status) })
    }
    const result = await answerAccountLoadRequest({
      requestId: body.requestId || body.response?.requestId || '',
      intel: String(body.response?.intel || ''),
      responderId: persistentUserId(request),
      trustScore: body.response?.trustScore,
      authorizedResponder: auth.authorized
    })
    return NextResponse.json({
      request: result.data,
      storageMode: result.storageMode,
      status: result.status,
      detail: safeError(result.detail),
      ...(result.status === 'invalid' || result.status === 'forbidden' ? { error: safeError(result.detail) } : {})
    }, { status: responseStatus(result.status) })
  }

  if (!loadRequest) {
    return NextResponse.json({ error: 'Flight identity is required before requesting loads.' }, { status: 400 })
  }

  const result = await createAccountLoadRequest(persistentUserId(request), loadRequest)
  if (result.status === 'invalid') {
    return NextResponse.json({ error: result.detail }, { status: 400 })
  }
  if (result.status === 'unreachable' || result.status === 'missing-config') {
    return NextResponse.json({
      error: 'Could not save this request to your account right now.',
      request: result.data,
      storageMode: result.storageMode,
      status: result.status,
      detail: safeError(result.detail)
    }, { status: 503 })
  }

  return NextResponse.json({
    request: result.data,
    storageMode: result.storageMode,
    status: result.status,
    detail: result.status === 'duplicate' ? 'Request already submitted.' : 'Load request submitted.'
  }, { status: result.status === 'duplicate' ? 200 : 201 })
}

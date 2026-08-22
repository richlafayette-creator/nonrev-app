import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  answerAccountLoadRequest,
  cancelAccountLoadRequest,
  closeAccountLoadRequest,
  createAccountLoadRequest,
  listAccountLoadRequests,
  listOpenResponderLoadRequests,
  normalizeLoadRequestInput,
  type AccountLoadRequestInput
} from './loadRequestAccountStore.ts'

const originalFetch = globalThis.fetch
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
}

type FetchCall = {
  url: string
  init?: RequestInit
}

function flight(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flight-1',
    carrier: 'AA',
    flight_number: 'AA169',
    origin: 'LAX',
    destination: 'HND',
    departure_time: '2026-08-20T17:40:00.000Z',
    arrival_time: '2026-08-21T05:00:00.000Z',
    flight_date: '2026-08-20',
    source_provider: 'aerodatabox',
    ...overrides
  }
}

function loadRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    user_id: 'user:traveler-1',
    flight_id: 'flight-1',
    status: 'open',
    created_at: '2026-08-20T18:00:00.000Z',
    updated_at: '2026-08-20T18:00:00.000Z',
    flights: flight(),
    load_responses: [],
    ...overrides
  }
}

function requestInput(overrides: Partial<AccountLoadRequestInput> = {}): AccountLoadRequestInput {
  return {
    carrier: 'AA',
    flightNumber: 'AA169',
    origin: 'LAX',
    destination: 'HND',
    scheduledDepartureUtc: '2026-08-20T17:40:00.000Z',
    scheduledArrivalUtc: '2026-08-21T05:00:00.000Z',
    travelDate: '2026-08-20',
    provider: 'aerodatabox',
    ...overrides
  }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

function installSupabaseMock(handler: (url: string, init?: RequestInit) => unknown | Promise<unknown>, calls: FetchCall[] = []) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://nonrevy-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  delete process.env.SUPABASE_URL
  Object.defineProperty(globalThis, 'fetch', {
    value: async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const handled = await handler(url, init)
      if (handled instanceof Response) return handled
      return jsonResponse(handled)
    },
    configurable: true
  })
  return calls
}

function restoreGlobals() {
  Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true })
  process.env.SUPABASE_URL = originalEnv.SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY
}

describe('account-backed load request store', () => {
  beforeEach(() => {
    restoreGlobals()
  })

  afterEach(() => {
    restoreGlobals()
  })

  it('creates an authenticated valid load request through flights and load_requests', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes('/flights?select=*') && init?.method !== 'POST') return []
      if (url.includes('/flights?select=*') && init?.method === 'POST') return [flight()]
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&') && init?.method !== 'POST') return []
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)') && init?.method === 'POST') return [loadRequestRow()]
      return []
    })

    const result = await createAccountLoadRequest('user:traveler-1', requestInput())

    assert.equal(result.status, 'ready')
    assert.equal(result.storageMode, 'supabase')
    assert.equal(result.data?.flightNumber, 'AA169')
    assert.equal(result.data?.requesterId, 'user:traveler-1')
    const flightInsert = calls.find((call) => call.url.includes('/flights?') && call.init?.method === 'POST')
    assert.ok(flightInsert)
    assert.deepEqual(Object.keys(JSON.parse(String(flightInsert.init?.body))).sort(), [
      'departure_time',
      'destination',
      'flight_number',
      'origin',
      'score',
      'status'
    ])
    const requestInsert = calls.find((call) => call.url.includes('/load_requests?') && call.init?.method === 'POST')
    assert.ok(requestInsert)
    const requestBody = JSON.parse(String(requestInsert.init?.body))
    assert.equal(requestBody.user_id, 'user:traveler-1')
    assert.equal('updated_at' in requestBody, false)
  })

  it('derives carrier from flight number when the live flights table has no carrier column', async () => {
    installSupabaseMock((url) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)')) {
        return [loadRequestRow({ flights: flight({ carrier: undefined, arrival_time: undefined, flight_date: undefined, source_provider: undefined }) })]
      }
      return []
    })

    const result = await listAccountLoadRequests('user:traveler-1')

    assert.equal(result.status, 'ready')
    assert.equal(result.data[0].carrier, 'AA')
    assert.equal(result.data[0].travelDate, '2026-08-20')
  })

  it('loads persisted requests from the canonical backend store for My Requests', async () => {
    const calls = installSupabaseMock((url) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)')) return [loadRequestRow()]
      return []
    })

    const result = await listAccountLoadRequests('user:traveler-1')

    assert.equal(result.status, 'ready')
    assert.equal(result.data.length, 1)
    assert.equal(result.data[0].origin, 'LAX')
    assert.ok(calls[0].url.includes('user_id=eq.user%3Atraveler-1'))
  })

  it('deduplicates repeated active requests for the same requester and flight', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes('/flights?select=*') && init?.method !== 'POST') return [flight()]
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&') && init?.method !== 'POST') return [loadRequestRow()]
      return []
    })

    const result = await createAccountLoadRequest('user:traveler-1', requestInput())

    assert.equal(result.status, 'duplicate')
    assert.equal(result.data?.duplicate, true)
    assert.equal(calls.some((call) => call.url.includes('/load_requests?') && call.init?.method === 'POST'), false)
  })

  it('makes retry after a lost response idempotent when the server already committed', async () => {
    installSupabaseMock((url, init) => {
      if (url.includes('/flights?select=*') && init?.method !== 'POST') return [flight()]
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&') && init?.method !== 'POST') return [loadRequestRow()]
      return []
    })

    const retry = await createAccountLoadRequest('user:traveler-1', requestInput())

    assert.equal(retry.status, 'duplicate')
    assert.equal(retry.detail, 'Request already submitted.')
  })

  it('rejects incomplete flight identity before touching the backend', async () => {
    const calls = installSupabaseMock(() => [])

    const result = await createAccountLoadRequest('user:traveler-1', requestInput({ flightNumber: 'Flight number unavailable', scheduledDepartureUtc: '' }))

    assert.equal(result.status, 'invalid')
    assert.match(result.detail, /Flight number|Scheduled departure/)
    assert.equal(calls.length, 0)
  })

  it('keeps unknown or framework-style inputs out of real load requests', () => {
    const normalized = normalizeLoadRequestInput(requestInput({ carrier: '', flightNumber: 'Flight number unavailable' }))

    assert.equal(normalized.ok, false)
  })

  it('scopes traveler reads to the current requester so another user is not exposed', async () => {
    const calls = installSupabaseMock(() => [])

    await listAccountLoadRequests('user:traveler-2')

    assert.ok(calls[0].url.includes('user_id=eq.user%3Atraveler-2'))
    assert.doesNotMatch(calls[0].url, /traveler-1/)
  })

  it('keeps responder open-request listing compatible with the existing responder flow', async () => {
    const calls = installSupabaseMock(() => [loadRequestRow()])

    const result = await listOpenResponderLoadRequests()

    assert.equal(result.status, 'ready')
    assert.equal(result.data.length, 1)
    assert.ok(calls[0].url.includes('status=eq.open'))
    assert.doesNotMatch(calls[0].url, /user_id=eq/)
  })

  it('lets the owner cancel an open request', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1&limit=1')) return [loadRequestRow()]
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1&user_id=eq.user%3Atraveler-1') && init?.method === 'PATCH') {
        return [loadRequestRow({ status: 'cancelled' })]
      }
      return []
    })

    const result = await cancelAccountLoadRequest('user:traveler-1', 'request-1')

    assert.equal(result.status, 'ready')
    assert.equal(result.data?.status, 'cancelled')
    const patch = calls.find((call) => call.init?.method === 'PATCH')
    assert.equal(JSON.parse(String(patch?.init?.body)).status, 'cancelled')
  })

  it('blocks another user from cancelling a private request', async () => {
    installSupabaseMock((url) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1&limit=1')) return [loadRequestRow()]
      return []
    })

    const result = await cancelAccountLoadRequest('user:traveler-2', 'request-1')

    assert.equal(result.status, 'forbidden')
    assert.match(result.detail, /own load requests/)
  })

  it('keeps cancelled requests in traveler history while responder open listing excludes them', async () => {
    const calls = installSupabaseMock((url) => {
      if (url.includes('user_id=eq.user%3Atraveler-1')) return [loadRequestRow({ status: 'cancelled' })]
      if (url.includes('status=eq.open')) return []
      return []
    })

    const history = await listAccountLoadRequests('user:traveler-1')
    const open = await listOpenResponderLoadRequests()

    assert.equal(history.data[0].status, 'cancelled')
    assert.equal(open.data.length, 0)
    assert.ok(calls.some((call) => call.url.includes('status=eq.open')))
  })

  it('allows an authorized responder to answer an open request and closes it as answered', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1&limit=1')) return [loadRequestRow()]
      if (url.includes('/load_responses?select=*') && init?.method !== 'POST') return []
      if (url.includes('/load_responses?select=*') && init?.method === 'POST') return [{ id: 'response-1', request_id: 'request-1', responder_id: 'responder:one', intel: 'TEST RESPONSE - not real load data', trust_score: 0, created_at: '2026-08-20T18:10:00.000Z' }]
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1') && init?.method === 'PATCH') {
        return [loadRequestRow({
          status: 'answered',
          load_responses: [{ id: 'response-1', request_id: 'request-1', responder_id: 'responder:one', intel: 'TEST RESPONSE - not real load data', trust_score: 0, created_at: '2026-08-20T18:10:00.000Z' }]
        })]
      }
      return []
    })

    const result = await answerAccountLoadRequest({
      requestId: 'request-1',
      intel: 'TEST RESPONSE - not real load data',
      responderId: 'responder:one',
      authorizedResponder: true
    })

    assert.equal(result.status, 'ready')
    assert.equal(result.data?.status, 'answered')
    assert.equal(result.data?.responses?.[0].intel, 'TEST RESPONSE - not real load data')
    const responseInsert = calls.find((call) => call.url.includes('/load_responses?') && call.init?.method === 'POST')
    assert.equal(JSON.parse(String(responseInsert?.init?.body)).responder_id, 'responder:one')
  })

  it('blocks unauthorized responders before touching Supabase', async () => {
    const calls = installSupabaseMock(() => [])

    const result = await answerAccountLoadRequest({
      requestId: 'request-1',
      intel: 'TEST RESPONSE',
      responderId: 'responder:one',
      authorizedResponder: false
    })

    assert.equal(result.status, 'forbidden')
    assert.equal(calls.length, 0)
  })

  it('blocks unauthorized responder cleanup before touching Supabase', async () => {
    const calls = installSupabaseMock(() => [])

    const result = await closeAccountLoadRequest({
      requestId: 'request-1',
      responderId: 'responder:one',
      authorizedResponder: false
    })

    assert.equal(result.status, 'forbidden')
    assert.equal(calls.length, 0)
  })

  it('blocks duplicate answers when a request already has a response', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1&limit=1')) {
        return [loadRequestRow({ load_responses: [{ id: 'response-1', request_id: 'request-1', responder_id: 'responder:one', intel: 'Existing response', trust_score: 0 }] })]
      }
      if (url.includes('/load_responses?select=*') && init?.method !== 'POST') return [{ id: 'response-1', request_id: 'request-1', responder_id: 'responder:one', intel: 'Existing response', trust_score: 0 }]
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1') && init?.method === 'PATCH') {
        return [loadRequestRow({ status: 'answered', load_responses: [{ id: 'response-1', request_id: 'request-1', responder_id: 'responder:one', intel: 'Existing response', trust_score: 0 }] })]
      }
      return []
    })

    const result = await answerAccountLoadRequest({
      requestId: 'request-1',
      intel: 'Second response',
      responderId: 'responder:two',
      authorizedResponder: true
    })

    assert.equal(result.status, 'duplicate')
    assert.equal(calls.some((call) => call.url.includes('/load_responses?') && call.init?.method === 'POST'), false)
  })

  it('does not allow cancelled requests to be answered', async () => {
    const calls = installSupabaseMock((url) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1&limit=1')) return [loadRequestRow({ status: 'cancelled' })]
      return []
    })

    const result = await answerAccountLoadRequest({
      requestId: 'request-1',
      intel: 'TEST RESPONSE',
      responderId: 'responder:one',
      authorizedResponder: true
    })

    assert.equal(result.status, 'invalid')
    assert.match(result.detail, /Cancelled/)
    assert.equal(calls.some((call) => call.url.includes('/load_responses?') && call.init?.method === 'POST'), false)
  })

  it('shows answered requests and response payloads in traveler history after refresh', async () => {
    installSupabaseMock((url) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)')) {
        return [loadRequestRow({
          status: 'answered',
          load_responses: [{ id: 'response-1', request_id: 'request-1', responder_id: 'responder:one', intel: 'TEST RESPONSE - not real load data', trust_score: 0, created_at: '2026-08-20T18:10:00.000Z' }]
        })]
      }
      return []
    })

    const result = await listAccountLoadRequests('user:traveler-1')

    assert.equal(result.data[0].status, 'answered')
    assert.equal(result.data[0].responses?.[0].intel, 'TEST RESPONSE - not real load data')
    assert.equal(result.data[0].responses?.[0].responderId, 'responder:one')
  })

  it('allows authorized beta cleanup to close an answered request without deleting history', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1&limit=1')) {
        return [loadRequestRow({ status: 'answered', load_responses: [{ id: 'response-1', request_id: 'request-1', responder_id: 'responder:one', intel: 'Existing response', trust_score: 0 }] })]
      }
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)&id=eq.request-1') && init?.method === 'PATCH') {
        return [loadRequestRow({ status: 'closed', load_responses: [{ id: 'response-1', request_id: 'request-1', responder_id: 'responder:one', intel: 'Existing response', trust_score: 0 }] })]
      }
      return []
    })

    const result = await closeAccountLoadRequest({
      requestId: 'request-1',
      responderId: 'responder:one',
      authorizedResponder: true
    })

    assert.equal(result.status, 'ready')
    assert.equal(result.data?.status, 'closed')
    assert.equal(result.data?.responses?.length, 1)
    const patch = calls.find((call) => call.init?.method === 'PATCH')
    assert.equal(JSON.parse(String(patch?.init?.body)).status, 'closed')
  })

  it('returns user-safe errors when the account database fails', async () => {
    installSupabaseMock(() => jsonResponse({ message: 'SQL schema cache relation load_requests failed with Bearer secret-value' }, 500))

    const result = await listAccountLoadRequests('user:traveler-1')

    assert.equal(result.status, 'unreachable')
    assert.doesNotMatch(result.detail, /SQL|schema cache|Bearer secret-value/)
  })

  it('preserves request identity fields needed after refresh or navigation', async () => {
    installSupabaseMock((url) => {
      if (url.includes('/load_requests?select=*,flights(*),load_responses(*)')) return [loadRequestRow()]
      return []
    })

    const loaded = await listAccountLoadRequests('user:traveler-1')

    assert.deepEqual(loaded.data.map((request) => ({
      carrier: request.carrier,
      flightNumber: request.flightNumber,
      origin: request.origin,
      destination: request.destination,
      scheduledDepartureUtc: request.scheduledDepartureUtc
    })), [{
      carrier: 'AA',
      flightNumber: 'AA169',
      origin: 'LAX',
      destination: 'HND',
      scheduledDepartureUtc: '2026-08-20T17:40:00.000Z'
    }])
  })
})

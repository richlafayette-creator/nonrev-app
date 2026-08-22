export type LoadRequestStoreStatus = 'ready' | 'duplicate' | 'invalid' | 'forbidden' | 'missing-config' | 'unreachable'

export type LoadRequestStoreResult<T> = {
  status: LoadRequestStoreStatus
  storageMode: 'supabase' | 'local-fallback'
  data: T
  detail: string
}

export type AccountLoadRequestInput = {
  carrier: string
  flightNumber: string
  origin: string
  destination: string
  scheduledDepartureUtc: string
  scheduledArrivalUtc?: string
  travelDate?: string
  provider?: string
  provenance?: string
}

export type AccountLoadResponse = {
  id: string | number
  intel?: string
  trustScore?: number
  responderId?: string
  createdAt?: string
}

export type AccountLoadRequest = {
  id: string
  requesterId: string
  carrier: string
  flightNumber: string
  origin: string
  destination: string
  scheduledDepartureUtc: string
  scheduledArrivalUtc?: string
  travelDate: string
  status: 'open' | 'awaiting_response' | 'answered' | 'cancelled' | 'closed' | 'expired'
  statusLabel: string
  createdAt: string
  updatedAt?: string
  provider?: string
  provenance?: string
  duplicate?: boolean
  flightId?: string | number
  supabaseRequestId?: string | number
  responses?: AccountLoadResponse[]
}

type SupabaseConfig = {
  supabaseUrl: string
  serviceRoleKey: string
}

type SupabaseFlightRow = {
  id?: string | number
  carrier?: string
  flight_number?: string
  origin?: string
  destination?: string
  departure_time?: string
  arrival_time?: string
  flight_date?: string
  source_provider?: string
}

type SupabaseLoadResponseRow = {
  id?: string | number
  request_id?: string | number
  responder_id?: string
  intel?: string
  trust_score?: number
  created_at?: string
}

type SupabaseLoadRequestRow = {
  id?: string | number
  user_id?: string
  requester_id?: string
  flight_id?: string | number
  status?: string
  created_at?: string
  updated_at?: string
  flights?: SupabaseFlightRow | null
  flight?: SupabaseFlightRow | null
  load_responses?: SupabaseLoadResponseRow[]
}

const activeStatuses = ['open', 'awaiting_response', 'pending']

function supabaseConfig(): SupabaseConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceRoleKey) return null
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), serviceRoleKey }
}

function headers(config: SupabaseConfig, extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra
  }
}

function safeMessage(value: unknown) {
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : 'Request failed'
  return raw
    .replace(/apikey[=:]\s*[^&\s]+/gi, 'apikey=[hidden]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [hidden]')
    .replace(/https?:\/\/[^\s]+/gi, '[url hidden]')
    .replace(/\b(SQL|PostgREST|schema cache|relation|column)\b/gi, 'account store')
    .slice(0, 180)
}

function missingConfig<T>(data: T): LoadRequestStoreResult<T> {
  return {
    status: 'missing-config',
    storageMode: 'local-fallback',
    data,
    detail: 'Account-backed load request persistence is not configured.'
  }
}

function encodeFilterValue(value: string) {
  return encodeURIComponent(value)
}

async function readJsonSafely(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function supabaseFetch(config: SupabaseConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: headers(config, init.headers || {}),
    cache: 'no-store'
  })
  const data = await readJsonSafely(response)
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : `Supabase returned ${response.status}`
    throw new Error(message)
  }
  return data
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanId(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return cleanText(value)
}

function normalizeCarrier(value: unknown) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

function normalizeFlightNumber(value: unknown) {
  return cleanText(value).toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

function carrierFromFlightNumber(value: unknown) {
  return normalizeFlightNumber(value).match(/^[A-Z]{2,3}/)?.[0] || ''
}

function normalizeAirport(value: unknown) {
  return cleanText(value).toUpperCase()
}

function isoDateFromUtc(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed).toISOString().slice(0, 10)
}

function validateIso(value: unknown) {
  const text = cleanText(value)
  return text && Number.isFinite(Date.parse(text)) ? new Date(Date.parse(text)).toISOString() : ''
}

export function loadRequestIdentity(userId: string, input: AccountLoadRequestInput) {
  const normalized = normalizeLoadRequestInput(input)
  if (!normalized.ok) return ''
  return [
    'load-request',
    userId,
    normalized.input.carrier,
    normalized.input.flightNumber,
    normalized.input.origin,
    normalized.input.destination,
    normalized.input.scheduledDepartureUtc
  ].join(':').replace(/[^a-zA-Z0-9:._-]/g, '')
}

export function normalizeLoadRequestInput(input: AccountLoadRequestInput): { ok: true; input: AccountLoadRequestInput } | { ok: false; error: string } {
  const carrier = normalizeCarrier(input.carrier)
  const flightNumber = normalizeFlightNumber(input.flightNumber)
  const origin = normalizeAirport(input.origin)
  const destination = normalizeAirport(input.destination)
  const scheduledDepartureUtc = validateIso(input.scheduledDepartureUtc)
  const scheduledArrivalUtc = input.scheduledArrivalUtc ? validateIso(input.scheduledArrivalUtc) : ''
  const travelDate = cleanText(input.travelDate) || isoDateFromUtc(scheduledDepartureUtc)

  if (!carrier) return { ok: false, error: 'Carrier is required for a load request.' }
  if (!flightNumber || /UNKNOWN|UNAVAILABLE|TBD/.test(flightNumber)) return { ok: false, error: 'Flight number is required for a load request.' }
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return { ok: false, error: 'Origin and destination airport codes are required.' }
  if (!scheduledDepartureUtc) return { ok: false, error: 'Scheduled departure time is required for a load request.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) return { ok: false, error: 'Travel date is required for a load request.' }

  return {
    ok: true,
    input: {
      carrier,
      flightNumber,
      origin,
      destination,
      scheduledDepartureUtc,
      ...(scheduledArrivalUtc ? { scheduledArrivalUtc } : {}),
      travelDate,
      ...(cleanText(input.provider) ? { provider: cleanText(input.provider) } : {}),
      ...(cleanText(input.provenance) ? { provenance: cleanText(input.provenance) } : {})
    }
  }
}

function statusLabel(status: AccountLoadRequest['status']) {
  if (status === 'answered') return 'Answered'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'closed') return 'Closed'
  if (status === 'expired') return 'Expired'
  return 'Awaiting response'
}

function normalizedStatus(value: unknown): AccountLoadRequest['status'] {
  const text = cleanText(value).toLowerCase()
  if (text === 'answered') return 'answered'
  if (text === 'cancelled' || text === 'canceled') return 'cancelled'
  if (text === 'closed') return 'closed'
  if (text === 'expired') return 'expired'
  if (text === 'awaiting_response' || text === 'waiting' || text === 'pending') return 'awaiting_response'
  return 'open'
}

function requestFromRows(userId: string, row: SupabaseLoadRequestRow, fallbackFlight?: SupabaseFlightRow): AccountLoadRequest | null {
  const flight = row.flights || row.flight || fallbackFlight
  if (!flight) return null
  const scheduledDepartureUtc = validateIso(flight.departure_time)
  if (!scheduledDepartureUtc) return null
  const status = normalizedStatus(row.status)
  const flightNumber = normalizeFlightNumber(flight.flight_number)
  const carrier = normalizeCarrier(flight.carrier) || carrierFromFlightNumber(flight.flight_number)
  const origin = normalizeAirport(flight.origin)
  const destination = normalizeAirport(flight.destination)
  if (!flightNumber || !carrier || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return null
  const createdAt = validateIso(row.created_at) || new Date().toISOString()
  return {
    id: String(row.id || loadRequestIdentity(userId, { carrier, flightNumber, origin, destination, scheduledDepartureUtc })),
    requesterId: row.user_id || row.requester_id || userId,
    carrier,
    flightNumber,
    origin,
    destination,
    scheduledDepartureUtc,
    ...(validateIso(flight.arrival_time) ? { scheduledArrivalUtc: validateIso(flight.arrival_time) } : {}),
    travelDate: cleanText(flight.flight_date) || isoDateFromUtc(scheduledDepartureUtc),
    status,
    statusLabel: statusLabel(status),
    createdAt,
    ...(validateIso(row.updated_at) ? { updatedAt: validateIso(row.updated_at) } : {}),
    ...(cleanText(flight.source_provider) ? { provider: cleanText(flight.source_provider) } : {}),
    flightId: row.flight_id || flight.id,
    supabaseRequestId: row.id,
    responses: Array.isArray(row.load_responses)
      ? row.load_responses.map((response) => ({
        id: response.id || `${row.id}-response`,
        ...(cleanText(response.responder_id) ? { responderId: cleanText(response.responder_id) } : {}),
        ...(cleanText(response.intel) ? { intel: cleanText(response.intel) } : {}),
        ...(typeof response.trust_score === 'number' ? { trustScore: response.trust_score } : {}),
        ...(validateIso(response.created_at) ? { createdAt: validateIso(response.created_at) } : {})
      }))
      : []
  }
}

async function findRequestById(config: SupabaseConfig, requestId: string | number) {
  const rows = await supabaseFetch(
    config,
    `load_requests?select=*,flights(*),load_responses(*)&id=eq.${encodeFilterValue(String(requestId))}&limit=1`
  ) as SupabaseLoadRequestRow[]
  return rows[0] || null
}

async function patchRequestStatus(config: SupabaseConfig, requestId: string | number, status: AccountLoadRequest['status'], userId?: string) {
  const userFilter = userId ? `&user_id=eq.${encodeFilterValue(userId)}` : ''
  const rows = await supabaseFetch(config, `load_requests?select=*,flights(*),load_responses(*)&id=eq.${encodeFilterValue(String(requestId))}${userFilter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status })
  }) as SupabaseLoadRequestRow[]
  return rows[0] || null
}

async function existingResponseForRequest(config: SupabaseConfig, requestId: string | number) {
  const rows = await supabaseFetch(
    config,
    `load_responses?select=*&request_id=eq.${encodeFilterValue(String(requestId))}&limit=1`
  ) as SupabaseLoadResponseRow[]
  return rows[0] || null
}

async function findFlight(config: SupabaseConfig, input: AccountLoadRequestInput) {
  const path = [
    'flights?select=*',
    `flight_number=eq.${encodeFilterValue(input.flightNumber)}`,
    `origin=eq.${encodeFilterValue(input.origin)}`,
    `destination=eq.${encodeFilterValue(input.destination)}`,
    `departure_time=eq.${encodeFilterValue(input.scheduledDepartureUtc)}`,
    'limit=1'
  ].join('&')
  const rows = await supabaseFetch(config, path) as SupabaseFlightRow[]
  return rows[0] || null
}

async function createFlight(config: SupabaseConfig, input: AccountLoadRequestInput) {
  const row = {
    flight_number: input.flightNumber,
    origin: input.origin,
    destination: input.destination,
    departure_time: input.scheduledDepartureUtc,
    status: 'scheduled',
    score: 0
  }
  const rows = await supabaseFetch(config, 'flights?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  }) as SupabaseFlightRow[]
  return rows[0] || null
}

async function ensureFlight(config: SupabaseConfig, input: AccountLoadRequestInput) {
  const existing = await findFlight(config, input)
  if (existing?.id) return existing
  try {
    const created = await createFlight(config, input)
    if (created?.id) return created
  } catch {
    const raced = await findFlight(config, input)
    if (raced?.id) return raced
    throw new Error('Could not create the request flight identity.')
  }
  throw new Error('Could not create the request flight identity.')
}

async function findActiveRequest(config: SupabaseConfig, userId: string, flightId: string | number) {
  const rows = await supabaseFetch(
    config,
    `load_requests?select=*,flights(*),load_responses(*)&user_id=eq.${encodeFilterValue(userId)}&flight_id=eq.${encodeFilterValue(String(flightId))}&status=in.(${activeStatuses.join(',')})&limit=1`
  ) as SupabaseLoadRequestRow[]
  return rows[0] || null
}

export async function createAccountLoadRequest(userId: string, input: AccountLoadRequestInput): Promise<LoadRequestStoreResult<AccountLoadRequest | null>> {
  const normalized = normalizeLoadRequestInput(input)
  if (!normalized.ok) return { status: 'invalid', storageMode: 'local-fallback', data: null, detail: normalized.error }
  const config = supabaseConfig()
  if (!config) return missingConfig(null)

  try {
    const now = new Date().toISOString()
    const flight = await ensureFlight(config, normalized.input)
    if (!flight.id) throw new Error('Flight identity was not returned by the account store.')

    const existing = await findActiveRequest(config, userId, flight.id)
    if (existing) {
      const request = requestFromRows(userId, existing, flight)
      return {
        status: 'duplicate',
        storageMode: 'supabase',
        data: request ? { ...request, duplicate: true } : null,
        detail: 'Request already submitted.'
      }
    }

    const rows = await supabaseFetch(config, 'load_requests?select=*,flights(*),load_responses(*)', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId,
        flight_id: flight.id,
        status: 'open',
        created_at: now
      })
    }) as SupabaseLoadRequestRow[]
    const request = requestFromRows(userId, rows[0] || {}, flight)
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: request,
      detail: 'Load request submitted.'
    }
  } catch (error) {
    return {
      status: 'unreachable',
      storageMode: 'local-fallback',
      data: null,
      detail: `Account load request persistence unavailable. ${safeMessage(error)}`
    }
  }
}

export async function listAccountLoadRequests(userId: string, limit = 100): Promise<LoadRequestStoreResult<AccountLoadRequest[]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  try {
    const rows = await supabaseFetch(
      config,
      `load_requests?select=*,flights(*),load_responses(*)&user_id=eq.${encodeFilterValue(userId)}&order=created_at.desc&limit=${limit}`
    ) as SupabaseLoadRequestRow[]
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: rows.map((row) => requestFromRows(userId, row)).filter((request): request is AccountLoadRequest => Boolean(request)),
      detail: 'Load requests loaded from the account store.'
    }
  } catch (error) {
    return {
      status: 'unreachable',
      storageMode: 'local-fallback',
      data: [],
      detail: `Account load requests unavailable. ${safeMessage(error)}`
    }
  }
}

export async function cancelAccountLoadRequest(userId: string, requestId: string | number): Promise<LoadRequestStoreResult<AccountLoadRequest | null>> {
  const config = supabaseConfig()
  if (!config) return missingConfig(null)
  try {
    const existing = await findRequestById(config, requestId)
    if (!existing) return { status: 'invalid', storageMode: 'supabase', data: null, detail: 'Load request was not found.' }
    if ((existing.user_id || existing.requester_id) !== userId) {
      return { status: 'forbidden', storageMode: 'supabase', data: null, detail: 'You can only cancel your own load requests.' }
    }
    const currentStatus = normalizedStatus(existing.status)
    const currentRequest = requestFromRows(userId, existing)
    if (currentStatus === 'cancelled') {
      return { status: 'ready', storageMode: 'supabase', data: currentRequest, detail: 'Request already cancelled.' }
    }
    if (currentStatus === 'answered' || currentStatus === 'closed' || currentStatus === 'expired') {
      return { status: 'invalid', storageMode: 'supabase', data: currentRequest, detail: 'This request can no longer be cancelled.' }
    }

    const row = await patchRequestStatus(config, requestId, 'cancelled', userId)
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: row ? requestFromRows(userId, row) : currentRequest ? { ...currentRequest, status: 'cancelled', statusLabel: 'Cancelled' } : null,
      detail: 'Load request cancelled.'
    }
  } catch (error) {
    return {
      status: 'unreachable',
      storageMode: 'local-fallback',
      data: null,
      detail: `Load request cancellation unavailable. ${safeMessage(error)}`
    }
  }
}

export type AccountLoadResponseInput = {
  requestId: string | number
  intel: string
  responderId: string
  trustScore?: number
  authorizedResponder: boolean
}

export type AccountLoadRequestCloseInput = {
  requestId: string | number
  responderId: string
  authorizedResponder: boolean
}

export async function answerAccountLoadRequest(input: AccountLoadResponseInput): Promise<LoadRequestStoreResult<AccountLoadRequest | null>> {
  if (!input.authorizedResponder) {
    return { status: 'forbidden', storageMode: 'local-fallback', data: null, detail: 'Responder authorization is required.' }
  }
  const requestId = cleanId(input.requestId)
  const intel = cleanText(input.intel)
  const responderId = cleanText(input.responderId) || 'responder:anonymous'
  const trustScore = Math.max(0, Math.min(100, Math.round(Number(input.trustScore ?? 0) || 0)))
  if (!requestId) return { status: 'invalid', storageMode: 'local-fallback', data: null, detail: 'Request ID is required.' }
  if (!intel) return { status: 'invalid', storageMode: 'local-fallback', data: null, detail: 'Load response notes are required.' }

  const config = supabaseConfig()
  if (!config) return missingConfig(null)
  try {
    const existing = await findRequestById(config, requestId)
    if (!existing) return { status: 'invalid', storageMode: 'supabase', data: null, detail: 'Load request was not found.' }
    const currentStatus = normalizedStatus(existing.status)
    const currentRequest = requestFromRows(existing.user_id || existing.requester_id || 'responder-visible', existing)
    if (currentStatus === 'cancelled') return { status: 'invalid', storageMode: 'supabase', data: currentRequest, detail: 'Cancelled requests cannot be answered.' }
    if (currentStatus === 'answered' || currentStatus === 'closed' || currentStatus === 'expired') {
      return { status: 'duplicate', storageMode: 'supabase', data: currentRequest, detail: 'Request already answered.' }
    }
    const previousResponse = await existingResponseForRequest(config, requestId)
    if (previousResponse) {
      const row = await patchRequestStatus(config, requestId, 'answered')
      return {
        status: 'duplicate',
        storageMode: 'supabase',
        data: row ? requestFromRows(row.user_id || row.requester_id || 'responder-visible', row) : currentRequest,
        detail: 'Request already answered.'
      }
    }

    await supabaseFetch(config, 'load_responses?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        request_id: requestId,
        responder_id: responderId,
        intel,
        trust_score: trustScore
      })
    })
    const row = await patchRequestStatus(config, requestId, 'answered')
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: row ? requestFromRows(row.user_id || row.requester_id || 'responder-visible', row) : currentRequest,
      detail: 'Load response submitted.'
    }
  } catch (error) {
    return {
      status: 'unreachable',
      storageMode: 'local-fallback',
      data: null,
      detail: `Load response unavailable. ${safeMessage(error)}`
    }
  }
}

export async function closeAccountLoadRequest(input: AccountLoadRequestCloseInput): Promise<LoadRequestStoreResult<AccountLoadRequest | null>> {
  if (!input.authorizedResponder) {
    return { status: 'forbidden', storageMode: 'local-fallback', data: null, detail: 'Responder authorization is required.' }
  }
  const requestId = cleanId(input.requestId)
  if (!requestId) return { status: 'invalid', storageMode: 'local-fallback', data: null, detail: 'Request ID is required.' }

  const config = supabaseConfig()
  if (!config) return missingConfig(null)
  try {
    const existing = await findRequestById(config, requestId)
    if (!existing) return { status: 'invalid', storageMode: 'supabase', data: null, detail: 'Load request was not found.' }
    const currentStatus = normalizedStatus(existing.status)
    const currentRequest = requestFromRows(existing.user_id || existing.requester_id || 'responder-visible', existing)
    if (currentStatus === 'closed') {
      return { status: 'ready', storageMode: 'supabase', data: currentRequest, detail: 'Request already closed.' }
    }
    if (currentStatus === 'expired') {
      return { status: 'invalid', storageMode: 'supabase', data: currentRequest, detail: 'Expired requests are already out of the active queue.' }
    }

    const row = await patchRequestStatus(config, requestId, 'closed')
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: row ? requestFromRows(row.user_id || row.requester_id || 'responder-visible', row) : currentRequest ? { ...currentRequest, status: 'closed', statusLabel: 'Closed' } : null,
      detail: 'Load request closed.'
    }
  } catch (error) {
    return {
      status: 'unreachable',
      storageMode: 'local-fallback',
      data: null,
      detail: `Load request cleanup unavailable. ${safeMessage(error)}`
    }
  }
}

export async function listOpenResponderLoadRequests(limit = 50): Promise<LoadRequestStoreResult<AccountLoadRequest[]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  try {
    const rows = await supabaseFetch(
      config,
      `load_requests?select=*,flights(*),load_responses(*)&status=eq.open&order=created_at.desc&limit=${limit}`
    ) as SupabaseLoadRequestRow[]
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: rows.map((row) => requestFromRows(row.user_id || row.requester_id || 'responder-visible', row)).filter((request): request is AccountLoadRequest => Boolean(request)),
      detail: 'Open responder requests loaded from the account store.'
    }
  } catch (error) {
    return {
      status: 'unreachable',
      storageMode: 'local-fallback',
      data: [],
      detail: `Open load requests unavailable. ${safeMessage(error)}`
    }
  }
}

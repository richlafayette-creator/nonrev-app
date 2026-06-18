import type { BetaFeedbackRecord } from './betaFeedback'
import type { SavedSearch } from './savedSearches'
import type { TripOutcome } from './outcomeRepository'

export const persistentSavedSearchesTableName = 'nonrevy_saved_searches'
export const persistentBetaFeedbackTableName = 'nonrevy_beta_feedback'
export const persistentTripOutcomesTableName = 'nonrevy_trip_outcomes'

export type AccountBetaRecordKind = 'saved-searches' | 'beta-feedback' | 'outcomes'
export type AccountBetaPayloadByKind = {
  'saved-searches': SavedSearch
  'beta-feedback': BetaFeedbackRecord
  outcomes: TripOutcome
}

export type AccountBetaStoreStatus = 'ready' | 'missing-config' | 'unreachable'
export type AccountBetaStoreResult<T> = {
  status: AccountBetaStoreStatus
  storageMode: 'supabase' | 'local-fallback'
  data: T
  detail: string
}

type SupabaseConfig = {
  supabaseUrl: string
  serviceRoleKey: string
}

type AccountBetaRow<T> = {
  id: string
  user_id: string
  payload: T
  route?: string
  category?: string
  created_at?: string
  updated_at?: string
}

const tableByKind: Record<AccountBetaRecordKind, string> = {
  'saved-searches': persistentSavedSearchesTableName,
  'beta-feedback': persistentBetaFeedbackTableName,
  outcomes: persistentTripOutcomesTableName
}

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
    .slice(0, 180)
}

function missingConfig<T>(data: T): AccountBetaStoreResult<T> {
  return {
    status: 'missing-config',
    storageMode: 'local-fallback',
    data,
    detail: 'Server-side Supabase beta persistence is not configured; local browser storage remains active.'
  }
}

function encodeFilterValue(value: string) {
  return encodeURIComponent(value)
}

function rowId(userId: string, id: string) {
  return `${userId}:${id}`
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

function recordTime(payload: { createdAt?: string; updatedAt?: string; timestamp?: string }) {
  return {
    createdAt: payload.createdAt || payload.timestamp || new Date().toISOString(),
    updatedAt: payload.updatedAt || payload.createdAt || payload.timestamp || new Date().toISOString()
  }
}

function payloadRoute(payload: unknown) {
  if (payload && typeof payload === 'object' && 'route' in payload && typeof payload.route === 'string') return payload.route
  if (payload && typeof payload === 'object' && 'query' in payload && typeof payload.query === 'string') return payload.query
  return undefined
}

function payloadCategory(payload: unknown) {
  if (payload && typeof payload === 'object' && 'category' in payload && typeof payload.category === 'string') return payload.category
  if (payload && typeof payload === 'object' && 'status' in payload && typeof payload.status === 'string') return payload.status
  if (payload && typeof payload === 'object' && 'kind' in payload && typeof payload.kind === 'string') return payload.kind
  return undefined
}

export async function listAccountBetaRecords<K extends AccountBetaRecordKind>(kind: K, userId: string, limit = 500): Promise<AccountBetaStoreResult<AccountBetaPayloadByKind[K][]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  try {
    const table = tableByKind[kind]
    const rows = await supabaseFetch(config, `${table}?select=payload&user_id=eq.${encodeFilterValue(userId)}&order=updated_at.desc&limit=${limit}`) as Array<{ payload?: AccountBetaPayloadByKind[K] }>
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: rows.map((row) => row.payload).filter((payload): payload is AccountBetaPayloadByKind[K] => Boolean(payload && typeof payload === 'object' && 'id' in payload)),
      detail: `${kind} loaded from Supabase.`
    }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: [], detail: `${kind} persistence unavailable. ${safeMessage(error)}` }
  }
}

export async function upsertAccountBetaRecords<K extends AccountBetaRecordKind>(kind: K, userId: string, records: AccountBetaPayloadByKind[K][]): Promise<AccountBetaStoreResult<AccountBetaPayloadByKind[K][]>> {
  const config = supabaseConfig()
  if (!config) return missingConfig([])
  if (!records.length) return { status: 'ready', storageMode: 'supabase', data: [], detail: `No ${kind} records to persist.` }
  try {
    const now = new Date().toISOString()
    const rows: AccountBetaRow<AccountBetaPayloadByKind[K]>[] = records.map((payload) => {
      const times = recordTime(payload)
      return {
        id: rowId(userId, payload.id),
        user_id: userId,
        payload,
        route: payloadRoute(payload),
        category: payloadCategory(payload),
        created_at: times.createdAt,
        updated_at: times.updatedAt || now
      }
    })
    const savedRows = await supabaseFetch(config, `${tableByKind[kind]}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows)
    }) as AccountBetaRow<AccountBetaPayloadByKind[K]>[]
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: savedRows.map((row) => row.payload).filter((payload): payload is AccountBetaPayloadByKind[K] => Boolean(payload && typeof payload === 'object' && 'id' in payload)),
      detail: `${kind} persisted to Supabase.`
    }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: [], detail: `${kind} persistence unavailable. ${safeMessage(error)}` }
  }
}

export async function deleteAccountBetaRecord(kind: AccountBetaRecordKind, userId: string, id: string): Promise<AccountBetaStoreResult<boolean>> {
  const config = supabaseConfig()
  if (!config) return missingConfig(false)
  try {
    await supabaseFetch(config, `${tableByKind[kind]}?id=eq.${encodeFilterValue(rowId(userId, id))}`, { method: 'DELETE' })
    return { status: 'ready', storageMode: 'supabase', data: true, detail: `${kind} record removed from Supabase.` }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: false, detail: `${kind} removal unavailable. ${safeMessage(error)}` }
  }
}

export async function clearAccountBetaRecords(kind: AccountBetaRecordKind, userId: string): Promise<AccountBetaStoreResult<boolean>> {
  const config = supabaseConfig()
  if (!config) return missingConfig(false)
  try {
    await supabaseFetch(config, `${tableByKind[kind]}?user_id=eq.${encodeFilterValue(userId)}`, { method: 'DELETE' })
    return { status: 'ready', storageMode: 'supabase', data: true, detail: `${kind} records cleared from Supabase.` }
  } catch (error) {
    return { status: 'unreachable', storageMode: 'local-fallback', data: false, detail: `${kind} clear unavailable. ${safeMessage(error)}` }
  }
}

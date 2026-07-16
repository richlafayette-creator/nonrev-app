import type { NormalizedScheduleResult } from './liveScheduleProviders'

export type ProviderResultRecord = {
  source_provider: string
  source_checked_at: string
  cached_at: string
  search_timestamp: string
  day_of_week: number
  month: number
  origin: string
  destination: string
  departure_time: string
  arrival_time: string
  flight_number: string
  carrier: string
  airline: string
  aircraft: string
  status: string
  provider_request_hash: string
  provider_request_scope: string
  result_fingerprint: string
  provenance_version: string
}

export type ProviderResultStoreResult = {
  enabled: boolean
  attempted: boolean
  stored: number
  status: 'disabled' | 'skipped' | 'stored' | 'fallback-noop' | 'local-fallback'
  detail: string
}

export type ProviderCacheLookupRequest = {
  origin?: string
  destination?: string
  date?: string
  carrier?: string
  maxAgeHours?: number
  limit?: number
  allowStaleOnMiss?: boolean
}

export type ProviderCacheLookupResult = {
  table: typeof providerResultTableName
  storageMode: 'supabase' | 'local-fallback' | 'disabled'
  status: 'hit' | 'miss' | 'unavailable'
  records: ProviderResultRecord[]
  detail: string
  freshness: 'current' | 'stale' | 'unavailable'
  staleRecordCount: number
  httpStatus?: number
  quotaHeaders?: Record<string, string>
  authenticationFailure?: boolean
}

export type ProviderResultRepository = {
  storeNormalizedResults: (results: NormalizedScheduleResult[]) => Promise<ProviderResultStoreResult>
  findCachedResults: (request: ProviderCacheLookupRequest) => Promise<ProviderCacheLookupResult>
}

type ProviderResultRepositoryEnv = Record<string, string | undefined>

export const providerResultTableName = 'provider_itinerary_results'
const defaultStoreTimeoutMs = 2500
const defaultLookupTimeoutMs = 2500
const defaultCacheMaxAgeHours = 72
const localProviderResultCache: ProviderResultRecord[] = []

const airportTimeZones: Record<string, string> = {
  ATL: 'America/New_York',
  BOS: 'America/New_York',
  DEN: 'America/Denver',
  DFW: 'America/Chicago',
  EWR: 'America/New_York',
  HNL: 'Pacific/Honolulu',
  IAD: 'America/New_York',
  IAH: 'America/Chicago',
  JFK: 'America/New_York',
  LAX: 'America/Los_Angeles',
  NRT: 'Asia/Tokyo',
  OGG: 'Pacific/Honolulu',
  ORD: 'America/Chicago',
  PDX: 'America/Los_Angeles',
  PHX: 'America/Phoenix',
  SAN: 'America/Los_Angeles',
  SBP: 'America/Los_Angeles',
  SEA: 'America/Los_Angeles',
  SFO: 'America/Los_Angeles'
}

function storeProviderResultsEnabled(env: ProviderResultRepositoryEnv) {
  return env.NONREVY_STORE_PROVIDER_RESULTS !== 'false'
}

function cleanValue(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed || 'Not provided'
}

function cacheTimestamp() {
  return new Date().toISOString()
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function provenanceScope(result: NormalizedScheduleResult) {
  return [cleanValue(result.source), cleanValue(result.origin), cleanValue(result.destination), result.departureTime ? isoDay(result.departureTime) || 'date-unknown' : 'date-unknown', cleanValue(result.carrier)].join('|')
}

function resultFingerprint(result: NormalizedScheduleResult) {
  return [cleanValue(result.source), cleanValue(result.flightNumber), cleanValue(result.origin), cleanValue(result.destination), cleanValue(result.departureTime), cleanValue(result.arrivalTime), cleanValue(result.operatingCarrier), cleanValue(result.operatingFlightNumber)].join('|')
}

function historicalDateParts(departureTime?: string, fallbackTimestamp = cacheTimestamp()) {
  const parsed = Date.parse(departureTime || '')
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date(fallbackTimestamp)
  return {
    search_timestamp: fallbackTimestamp,
    day_of_week: date.getUTCDay(),
    month: date.getUTCMonth() + 1
  }
}

export function normalizedResultToProviderResultRecord(result: NormalizedScheduleResult): ProviderResultRecord {
  const checkedAt = result.sourceCheckedAt || cacheTimestamp()
  const cachedAt = cacheTimestamp()
  const requestScope = provenanceScope(result)
  const fingerprint = resultFingerprint(result)
  return {
    source_provider: cleanValue(result.source),
    source_checked_at: checkedAt,
    cached_at: cachedAt,
    ...historicalDateParts(result.departureTime, cachedAt),
    origin: cleanValue(result.origin),
    destination: cleanValue(result.destination),
    departure_time: cleanValue(result.departureTime),
    arrival_time: cleanValue(result.arrivalTime),
    flight_number: cleanValue(result.flightNumber),
    carrier: cleanValue(result.carrier),
    airline: cleanValue(result.carrier),
    aircraft: cleanValue(result.aircraft),
    status: cleanValue(result.status),
    provider_request_hash: stableHash(requestScope),
    provider_request_scope: requestScope,
    result_fingerprint: stableHash(fingerprint),
    provenance_version: 'provider-result-provenance-v1'
  }
}

function legacyProviderResultRecord(record: ProviderResultRecord) {
  return {
    source_provider: record.source_provider,
    source_checked_at: record.source_checked_at,
    origin: record.origin,
    destination: record.destination,
    departure_time: record.departure_time,
    arrival_time: record.arrival_time,
    flight_number: record.flight_number,
    carrier: record.carrier,
    aircraft: record.aircraft,
    status: record.status
  }
}

function rememberLocal(records: ProviderResultRecord[]) {
  if (!records.length) return
  records.forEach((record) => localProviderResultCache.unshift(record))
  const seen = new Set<string>()
  const deduped = localProviderResultCache.filter((record, index) => {
    const key = [record.source_provider, record.flight_number, record.origin, record.destination, record.departure_time].join('|') || `record-${index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  localProviderResultCache.splice(0, localProviderResultCache.length, ...deduped.slice(0, 1000))
}

function isoDay(value?: string) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined
}

function localIsoDay(value?: string, airportCode?: string) {
  const parsed = Date.parse(value || '')
  if (!Number.isFinite(parsed)) return undefined
  return new Date(parsed).toLocaleDateString('en-CA', { timeZone: airportCode ? airportTimeZones[airportCode] : undefined })
}

function hoursOld(record: ProviderResultRecord, now = Date.now()) {
  const parsed = Date.parse(record.source_checked_at || record.cached_at || '')
  if (!Number.isFinite(parsed)) return Infinity
  return (now - parsed) / 3600000
}

function recordMatchesRequest(record: ProviderResultRecord, request: ProviderCacheLookupRequest) {
  if (request.origin && record.origin !== request.origin) return false
  if (request.destination && record.destination !== request.destination) return false
  if (request.date && (localIsoDay(record.departure_time, record.origin) || isoDay(record.departure_time)) !== request.date) return false
  if (request.carrier && request.carrier !== 'all') {
    const carrier = request.carrier.toUpperCase()
    if (![record.carrier, record.airline, record.flight_number].some((value) => value.toUpperCase().includes(carrier))) return false
  }
  return hoursOld(record) <= (request.maxAgeHours || defaultCacheMaxAgeHours)
}

function recordMatchesMarket(record: ProviderResultRecord, request: ProviderCacheLookupRequest) {
  if (request.origin && record.origin !== request.origin) return false
  if (request.destination && record.destination !== request.destination) return false
  if (request.date && (localIsoDay(record.departure_time, record.origin) || isoDay(record.departure_time)) !== request.date) return false
  if (request.carrier && request.carrier !== 'all') {
    const carrier = request.carrier.toUpperCase()
    if (![record.carrier, record.airline, record.flight_number].some((value) => value.toUpperCase().includes(carrier))) return false
  }
  return true
}

function localLookup(request: ProviderCacheLookupRequest, options: { stale?: boolean } = {}): ProviderResultRecord[] {
  const maxAgeHours = request.maxAgeHours || defaultCacheMaxAgeHours
  const ageLimit = options.stale ? Math.max(24 * 21, maxAgeHours * 14) : maxAgeHours
  return localProviderResultCache
    .filter((record) => recordMatchesMarket(record, request))
    .filter((record) => options.stale ? hoursOld(record) > maxAgeHours && hoursOld(record) <= ageLimit : hoursOld(record) <= maxAgeHours)
    .sort((a, b) => Date.parse(b.source_checked_at || b.cached_at) - Date.parse(a.source_checked_at || a.cached_at))
    .slice(0, request.limit || 100)
}

export function createNoopProviderResultRepository(detail = 'Provider result persistence is disabled.'): ProviderResultRepository {
  return {
    async storeNormalizedResults(results) {
      const records = results.map(normalizedResultToProviderResultRecord)
      rememberLocal(records)
      return {
        enabled: false,
        attempted: false,
        stored: records.length,
        status: records.length ? 'local-fallback' : 'disabled',
        detail: records.length ? `${records.length} normalized provider result${records.length === 1 ? '' : 's'} cached locally; ${detail}` : detail
      }
    },
    async findCachedResults(request) {
      const records = localLookup(request)
      const staleRecords = records.length ? [] : request.allowStaleOnMiss ? localLookup(request, { stale: true }) : []
      const selectedRecords = records.length ? records : staleRecords
      return {
        table: providerResultTableName,
        storageMode: selectedRecords.length ? 'local-fallback' : 'disabled',
        status: selectedRecords.length ? 'hit' : 'miss',
        records: selectedRecords,
        detail: records.length ? `${records.length} local provider cache result${records.length === 1 ? '' : 's'} found.` : staleRecords.length ? `${staleRecords.length} stale local provider cache result${staleRecords.length === 1 ? '' : 's'} retained as last-known-good fallback.` : detail,
        freshness: records.length ? 'current' : staleRecords.length ? 'stale' : 'unavailable',
        staleRecordCount: staleRecords.length
      }
    }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timeout)
  }
}

async function readJsonSafely(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function supabaseQueryUrl(supabaseUrl: string, request: ProviderCacheLookupRequest) {
  const params = new URLSearchParams({
    select: '*',
    order: 'source_checked_at.desc',
    limit: String(request.limit || 100)
  })
  if (request.origin) params.set('origin', `eq.${request.origin}`)
  if (request.destination) params.set('destination', `eq.${request.destination}`)
  if (request.date) {
    const start = `${request.date}T00:00:00.000Z`
    const next = new Date(start)
    if (Number.isFinite(next.getTime())) {
      next.setUTCDate(next.getUTCDate() + 1)
      params.append('departure_time', `gte.${request.date}`)
      params.append('departure_time', `lt.${next.toISOString().slice(0, 10)}`)
    }
  }
  const cutoff = new Date(Date.now() - (request.maxAgeHours || defaultCacheMaxAgeHours) * 3600000).toISOString()
  params.append('source_checked_at', `gte.${cutoff}`)
  return `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${providerResultTableName}?${params.toString()}`
}

function responseQuotaHeaders(response: Response) {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    if (/rate|quota|limit|remaining|reset|retry-after/i.test(key)) headers[key] = value
  })
  return headers
}

function normalizeSupabaseRecord(raw: Record<string, unknown>): ProviderResultRecord {
  const checkedAt = cleanValue(String(raw.source_checked_at || raw.cached_at || raw.created_at || cacheTimestamp()))
  return {
    source_provider: cleanValue(String(raw.source_provider || raw.provider || 'provider-cache')),
    source_checked_at: checkedAt,
    cached_at: cleanValue(String(raw.cached_at || raw.created_at || checkedAt)),
    search_timestamp: cleanValue(String(raw.search_timestamp || raw.cached_at || raw.created_at || checkedAt)),
    day_of_week: Number(raw.day_of_week ?? historicalDateParts(String(raw.departure_time || raw.departure_date || ''), checkedAt).day_of_week),
    month: Number(raw.month ?? historicalDateParts(String(raw.departure_time || raw.departure_date || ''), checkedAt).month),
    origin: cleanValue(String(raw.origin || '')),
    destination: cleanValue(String(raw.destination || '')),
    departure_time: cleanValue(String(raw.departure_time || raw.departure_date || '')),
    arrival_time: cleanValue(String(raw.arrival_time || raw.arrival_date || '')),
    flight_number: cleanValue(String(raw.flight_number || '')),
    carrier: cleanValue(String(raw.carrier || raw.airline || '')),
    airline: cleanValue(String(raw.airline || raw.carrier || '')),
    aircraft: cleanValue(String(raw.aircraft || '')),
    status: cleanValue(String(raw.status || 'Cached provider result')),
    provider_request_hash: cleanValue(String(raw.provider_request_hash || 'legacy-provider-request')),
    provider_request_scope: cleanValue(String(raw.provider_request_scope || [raw.source_provider || raw.provider || 'provider-cache', raw.origin || '', raw.destination || '', raw.departure_time || raw.departure_date || '', raw.carrier || raw.airline || ''].join('|'))),
    result_fingerprint: cleanValue(String(raw.result_fingerprint || 'legacy-result-fingerprint')),
    provenance_version: cleanValue(String(raw.provenance_version || 'legacy-provider-result'))
  }
}

export function createProviderResultRepository(env: ProviderResultRepositoryEnv = process.env): ProviderResultRepository {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const shouldStoreSupabase = storeProviderResultsEnabled(env)

  if (!supabaseUrl || !serviceRoleKey) {
    return createNoopProviderResultRepository('Supabase URL or service-role key unavailable; using local provider cache fallback.')
  }

  return {
    async storeNormalizedResults(results) {
      const records = results.map(normalizedResultToProviderResultRecord)
      rememberLocal(records)
      if (!records.length) {
        return {
          enabled: shouldStoreSupabase,
          attempted: false,
          stored: 0,
          status: 'skipped',
          detail: 'No normalized provider results to persist.'
        }
      }

      if (!shouldStoreSupabase) {
        return {
          enabled: false,
          attempted: false,
          stored: records.length,
          status: 'local-fallback',
          detail: `${records.length} normalized provider result${records.length === 1 ? '' : 's'} cached locally. Set NONREVY_STORE_PROVIDER_RESULTS=true to persist to Supabase.`
        }
      }

      const headers = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=merge-duplicates'
      }

      try {
        let response = await fetchWithTimeout(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${providerResultTableName}?on_conflict=result_fingerprint`, {
          method: 'POST',
          headers,
          body: JSON.stringify(records)
        }, defaultStoreTimeoutMs)

        if (!response.ok) {
          response = await fetchWithTimeout(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${providerResultTableName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(records.map(legacyProviderResultRecord))
          }, defaultStoreTimeoutMs)
        }

        if (!response.ok) {
          return {
            enabled: true,
            attempted: true,
            stored: records.length,
            status: 'local-fallback',
            detail: `Provider result persistence table unavailable or rejected insert (${response.status}); cached locally instead.`
          }
        }

        return {
          enabled: true,
          attempted: true,
          stored: records.length,
          status: 'stored',
          detail: `${records.length} normalized provider result${records.length === 1 ? '' : 's'} stored in ${providerResultTableName}.`
        }
      } catch {
        return {
          enabled: true,
          attempted: true,
          stored: records.length,
          status: 'local-fallback',
          detail: 'Provider result persistence failed or timed out; cached locally instead.'
        }
      }
    },

    async findCachedResults(request) {
      const localRecords = localLookup(request)
      const staleLocalRecords = localRecords.length ? [] : request.allowStaleOnMiss ? localLookup(request, { stale: true }) : []
      try {
        const response = await fetchWithTimeout(supabaseQueryUrl(supabaseUrl, request), {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
        }, defaultLookupTimeoutMs)
        if (!response.ok) {
          return {
            table: providerResultTableName,
            storageMode: localRecords.length || staleLocalRecords.length ? 'local-fallback' : 'supabase',
            status: localRecords.length || staleLocalRecords.length ? 'hit' : 'unavailable',
            records: localRecords.length ? localRecords : staleLocalRecords,
            detail: localRecords.length ? `Supabase cache lookup failed (${response.status}); using ${localRecords.length} local fallback result${localRecords.length === 1 ? '' : 's'}.` : staleLocalRecords.length ? `Supabase cache lookup failed (${response.status}); using ${staleLocalRecords.length} stale last-known-good local fallback result${staleLocalRecords.length === 1 ? '' : 's'}.` : `Supabase cache lookup failed (${response.status}); no local fallback cache matched.`,
            freshness: localRecords.length ? 'current' : staleLocalRecords.length ? 'stale' : 'unavailable',
            staleRecordCount: staleLocalRecords.length,
            httpStatus: response.status,
            quotaHeaders: responseQuotaHeaders(response),
            authenticationFailure: response.status === 401 || response.status === 403
          }
        }
        const data = await readJsonSafely(response)
        const records = Array.isArray(data) ? data.map((row) => normalizeSupabaseRecord(row as Record<string, unknown>)).filter((record) => recordMatchesRequest(record, request)) : []
        return {
          table: providerResultTableName,
          storageMode: 'supabase',
          status: records.length || localRecords.length || staleLocalRecords.length ? 'hit' : 'miss',
          records: records.length ? records : localRecords.length ? localRecords : staleLocalRecords,
          detail: records.length ? `${records.length} Supabase provider cache result${records.length === 1 ? '' : 's'} found.` : localRecords.length ? `${localRecords.length} local fallback provider cache result${localRecords.length === 1 ? '' : 's'} found.` : staleLocalRecords.length ? `${staleLocalRecords.length} stale last-known-good local fallback provider cache result${staleLocalRecords.length === 1 ? '' : 's'} found.` : 'No matching provider cache rows found.',
          freshness: records.length || localRecords.length ? 'current' : staleLocalRecords.length ? 'stale' : 'unavailable',
          staleRecordCount: staleLocalRecords.length,
          httpStatus: response.status,
          quotaHeaders: responseQuotaHeaders(response),
          authenticationFailure: false
        }
      } catch {
        return {
          table: providerResultTableName,
          storageMode: localRecords.length || staleLocalRecords.length ? 'local-fallback' : 'supabase',
          status: localRecords.length || staleLocalRecords.length ? 'hit' : 'unavailable',
          records: localRecords.length ? localRecords : staleLocalRecords,
          detail: localRecords.length ? `Supabase cache lookup failed; using ${localRecords.length} local fallback result${localRecords.length === 1 ? '' : 's'}.` : staleLocalRecords.length ? `Supabase cache lookup failed; using ${staleLocalRecords.length} stale last-known-good local fallback result${staleLocalRecords.length === 1 ? '' : 's'}.` : 'Supabase cache lookup failed; no local fallback cache matched.',
          freshness: localRecords.length ? 'current' : staleLocalRecords.length ? 'stale' : 'unavailable',
          staleRecordCount: staleLocalRecords.length
        }
      }
    }
  }
}

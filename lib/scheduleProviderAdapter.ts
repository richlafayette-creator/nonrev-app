import type { NormalizedScheduleResult } from './liveScheduleProviders'

export type ScheduleProviderCacheStatus = 'hit' | 'miss' | 'bypass' | 'unavailable'
export type ScheduleProviderStatus = 'success' | 'warning' | 'error' | 'skipped'

export type ScheduleProviderCapabilities = {
  futureSchedules: boolean
  currentFlightStatus: boolean
  routeSearch: boolean
  flightNumberEnrichment: boolean
  cacheRead?: boolean
  mockData?: boolean
}

export type ScheduleProviderCoverageStatus = 'covered' | 'partial' | 'empty' | 'unavailable'

export type ScheduleProviderCoverage = {
  provider: string
  status: ScheduleProviderCoverageStatus
  airports: string[]
  carriers: string[]
  flightCount: number
  routeCount: number
  missingDataReason?: string
}

export type ScheduleProviderDiagnostic = {
  providerUsed: string
  queryTimeMs: number
  cacheStatus: ScheduleProviderCacheStatus
  airportsSearched: string[]
  carriersSearched: string[]
  itineraryCount: number
  providerFailures: string[]
}

export type ProviderAgnosticScheduleRow = {
  id: string
  source_provider: string
  schedule_source: string
  schedule_sources: string[]
  providers: string[]
  source_checked_at: string
  airline: string
  flight_number: string
  carrier: string
  origin: string
  destination: string
  departure: string
  arrival: string
  departure_time: string
  arrival_time: string
  duration: string
  aircraft: string
  status: string
  score: number
  confidence: number
  coverage_status: ScheduleProviderCoverageStatus
  missing_data_reason?: string
  operating_carrier: string
  operating_flight_number: string
  marketing_carrier: string
  marketing_flight_numbers: string[]
  codeshare_relationships: string[]
  duplicate_count: number
  marketing_airline: string
  operating_airline: string
  marketing_flight_number: string
  departure_timezone?: string
  arrival_timezone?: string
  operating_date?: string
  arrival_operating_date?: string
  departure_terminal?: string
  arrival_terminal?: string
  codeshare_identity?: string
  provider_record_id?: string
  retrieval_timestamp: string
  data_freshness: string
  data_status: string
}

export type ScheduleProviderSearchRequest = {
  origin?: string
  destination?: string
  date?: string
  carrier?: string
  maxResults?: number
}

export type ScheduleProviderHealth = {
  provider: string
  status?: ScheduleProviderStatus
  responseTimeMs: number
  coverage: {
    flightCount: number
    airportCount: number
    airlineCount: number
    routeCount: number
  }
  freshness: {
    newestSourceCheckedAt?: string
    oldestSourceCheckedAt?: string
  }
  errors: string[]
}

export type ScheduleProviderAdapterResult = {
  provider: string
  rows: ProviderAgnosticScheduleRow[]
  warning?: string
  detail?: string
  requestCount?: number
  status?: ScheduleProviderStatus
  health: ScheduleProviderHealth
  coverage: ScheduleProviderCoverage
  capabilities: ScheduleProviderCapabilities
  diagnostics: ScheduleProviderDiagnostic
}

export type ScheduleProviderSearchResponse = {
  results: NormalizedScheduleResult[]
  warning?: string
  detail?: string
  requestCount?: number
  status?: ScheduleProviderStatus
  cacheStatus?: ScheduleProviderCacheStatus
}

export type ScheduleProviderAdapter = {
  key: string
  label: string
  priority: number
  searchSchedules: (request: ScheduleProviderSearchRequest) => Promise<ScheduleProviderSearchResponse>
  providerCoverage: (request?: ScheduleProviderSearchRequest, rows?: ProviderAgnosticScheduleRow[], status?: ScheduleProviderStatus, warning?: string) => Promise<ScheduleProviderCoverage> | ScheduleProviderCoverage
  health: (rows?: ProviderAgnosticScheduleRow[], status?: ScheduleProviderStatus, responseTimeMs?: number, errors?: string[]) => Promise<ScheduleProviderHealth> | ScheduleProviderHealth
  capabilities: () => ScheduleProviderCapabilities
}

function providerRowId(result: NormalizedScheduleResult) {
  return `${result.source}-${result.flightNumber}-${result.origin}-${result.destination}-${result.departureTime}`
}

function providerRowScore(result: NormalizedScheduleResult) {
  const status = result.status.toLowerCase()
  if (status.includes('cancel')) return 35
  if (status.includes('divert')) return 45
  if (status.includes('delay')) return 58
  return 68
}

function confidenceForResult(result: NormalizedScheduleResult) {
  const hasTimes = Number.isFinite(Date.parse(result.departureTime)) && Number.isFinite(Date.parse(result.arrivalTime))
  const liveProvider = /flightaware|aviationstack/i.test(result.source)
  const cached = /cache|supabase|stored/i.test(result.source)
  return Math.max(30, Math.min(98, 54 + (hasTimes ? 22 : 0) + (liveProvider ? 14 : 0) - (cached ? 6 : 0)))
}

export function validateNormalizedScheduleResult(result: NormalizedScheduleResult) {
  const missing = [
    !result.flightNumber || result.flightNumber === 'Flight TBD' ? 'flight number' : undefined,
    !result.origin || result.origin === 'TBD' ? 'origin' : undefined,
    !result.destination || result.destination === 'TBD' ? 'destination' : undefined,
    !Number.isFinite(Date.parse(result.departureTime)) ? 'departure time' : undefined,
    !Number.isFinite(Date.parse(result.arrivalTime)) ? 'arrival time' : undefined
  ].filter((value): value is string => Boolean(value))
  return { valid: missing.length === 0, missing }
}

function rowCoverageStatus(result: NormalizedScheduleResult): ScheduleProviderCoverageStatus {
  return validateNormalizedScheduleResult(result).valid ? 'covered' : 'partial'
}

function missingDataReason(result: NormalizedScheduleResult) {
  const missing = validateNormalizedScheduleResult(result).missing
  return missing.length ? `Provider row missing ${missing.join(', ')}.` : undefined
}

function airlineCode(value: string) {
  return value.replace(/[^A-Z0-9]/gi, '').match(/^[A-Z]{2,3}/i)?.[0]?.toUpperCase() || value
}

function codeshareRelationships(result: NormalizedScheduleResult) {
  const operating = result.operatingFlightNumber || result.flightNumber
  return uniqueStrings(result.marketingFlightNumbers || [])
    .filter((flightNumber) => flightNumber !== operating)
    .map((flightNumber) => `${flightNumber} marketed on ${operating}`)
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

export function providerScheduleRowFromResult(result: NormalizedScheduleResult, checkedAt = new Date().toISOString()): ProviderAgnosticScheduleRow {
  const coverageStatus = rowCoverageStatus(result)
  return {
    id: providerRowId(result),
    source_provider: result.source,
    schedule_source: result.source,
    schedule_sources: [result.source],
    providers: [result.source],
    source_checked_at: result.sourceCheckedAt || checkedAt,
    flight_number: result.flightNumber,
    carrier: result.carrier,
    airline: result.carrier,
    origin: result.origin,
    destination: result.destination,
    departure: result.departureTime,
    arrival: result.arrivalTime,
    departure_time: result.departureTime,
    arrival_time: result.arrivalTime,
    duration: result.duration || 'Not provided',
    aircraft: result.aircraft,
    status: result.status,
    score: providerRowScore(result),
    confidence: confidenceForResult(result),
    coverage_status: coverageStatus,
    missing_data_reason: missingDataReason(result),
    operating_carrier: result.operatingCarrier || result.carrier,
    operating_flight_number: result.operatingFlightNumber || result.flightNumber,
    marketing_carrier: airlineCode(result.marketingFlightNumber || result.flightNumber) || result.carrier,
    marketing_flight_numbers: result.marketingFlightNumbers || [],
    codeshare_relationships: codeshareRelationships(result),
    duplicate_count: result.duplicateCount || 0,
    marketing_airline: result.marketingAirline || result.carrier,
    operating_airline: result.operatingAirline || result.operatingCarrier || result.carrier,
    marketing_flight_number: result.marketingFlightNumber || result.flightNumber,
    departure_timezone: result.departureTimeZone,
    arrival_timezone: result.arrivalTimeZone,
    operating_date: result.operatingDate,
    arrival_operating_date: result.arrivalOperatingDate,
    departure_terminal: result.departureTerminal,
    arrival_terminal: result.arrivalTerminal,
    codeshare_identity: result.codeshareIdentity || codeshareRelationships(result)[0],
    provider_record_id: result.providerRecordId || providerRowId(result),
    retrieval_timestamp: result.retrievalTimestamp || result.sourceCheckedAt || checkedAt,
    data_freshness: result.dataFreshness || 'unavailable',
    data_status: result.dataStatus || (/flightaware|aviationstack/i.test(result.source) ? 'live' : /cache|supabase|stored/i.test(result.source) ? 'cached' : /mock|demo/i.test(result.source) ? 'demo' : 'scheduled')
  }
}

export function quarantineMalformedScheduleResults(results: NormalizedScheduleResult[]) {
  const valid: NormalizedScheduleResult[] = []
  const quarantined: Array<{ result: NormalizedScheduleResult; reason: string }> = []
  results.forEach((result) => {
    const validation = validateNormalizedScheduleResult(result)
    if (validation.valid) valid.push(result)
    else quarantined.push({ result, reason: `Provider row quarantined: missing ${validation.missing.join(', ')}.` })
  })
  return { valid, quarantined }
}

export function providerScheduleRowsFromResults(results: NormalizedScheduleResult[], checkedAt = new Date().toISOString()): ProviderAgnosticScheduleRow[] {
  return quarantineMalformedScheduleResults(results).valid.map((result) => providerScheduleRowFromResult(result, checkedAt))
}

export function defaultScheduleProviderCapabilities(overrides: Partial<ScheduleProviderCapabilities> = {}): ScheduleProviderCapabilities {
  return {
    futureSchedules: false,
    currentFlightStatus: false,
    routeSearch: false,
    flightNumberEnrichment: false,
    ...overrides
  }
}

export function defaultScheduleProviderCoverage(provider: string, request: ScheduleProviderSearchRequest = {}, rows: ProviderAgnosticScheduleRow[] = [], status: ScheduleProviderStatus = rows.length ? 'success' : 'skipped', warning?: string): ScheduleProviderCoverage {
  const airports = uniqueStrings([...rows.flatMap((row) => [row.origin, row.destination]), request.origin, request.destination])
  const carriers = uniqueStrings([...rows.map((row) => row.airline), request.carrier === 'all' ? undefined : request.carrier])
  const routeCount = new Set(rows.map((row) => `${row.origin}-${row.destination}`).filter((route) => !route.includes('TBD'))).size
  const missingDataReason = warning || (!rows.length ? 'Provider returned no usable schedule rows for this request.' : rows.map((row) => row.missing_data_reason).find(Boolean))
  return {
    provider,
    status: status === 'error' ? 'unavailable' : rows.length ? rows.some((row) => row.coverage_status !== 'covered') ? 'partial' : 'covered' : status === 'warning' ? 'partial' : 'empty',
    airports,
    carriers,
    flightCount: rows.length,
    routeCount,
    missingDataReason
  }
}

export function defaultScheduleProviderHealth(provider: string, rows: ProviderAgnosticScheduleRow[] = [], status: ScheduleProviderStatus = rows.length ? 'success' : 'skipped', responseTimeMs = 0, errors: string[] = []): ScheduleProviderHealth {
  const checkedAts = rows.map((row) => row.source_checked_at).filter(Boolean).sort()
  return {
    provider,
    status,
    responseTimeMs,
    coverage: {
      flightCount: rows.length,
      airportCount: new Set(rows.flatMap((row) => [row.origin, row.destination]).filter(Boolean)).size,
      airlineCount: new Set(rows.map((row) => row.airline).filter(Boolean)).size,
      routeCount: new Set(rows.map((row) => `${row.origin}-${row.destination}`)).size
    },
    freshness: {
      oldestSourceCheckedAt: checkedAts[0],
      newestSourceCheckedAt: checkedAts[checkedAts.length - 1]
    },
    errors
  }
}

function diagnosticsFor(provider: string, request: ScheduleProviderSearchRequest, queryTimeMs: number, cacheStatus: ScheduleProviderCacheStatus, itineraryCount: number, providerFailures: string[]): ScheduleProviderDiagnostic {
  return {
    providerUsed: provider,
    queryTimeMs,
    cacheStatus,
    airportsSearched: uniqueStrings([request.origin, request.destination]),
    carriersSearched: uniqueStrings([request.carrier === 'all' ? undefined : request.carrier]),
    itineraryCount,
    providerFailures
  }
}

export async function runScheduleProviderAdapter(adapter: ScheduleProviderAdapter, request: ScheduleProviderSearchRequest, checkedAt = new Date().toISOString()): Promise<ScheduleProviderAdapterResult> {
  const startedAt = Date.now()
  try {
    const response = await adapter.searchSchedules(request)
    const quarantine = quarantineMalformedScheduleResults(response.results)
    const rows = quarantine.valid.map((result) => providerScheduleRowFromResult(result, checkedAt))
    const quarantineWarnings = quarantine.quarantined.map((item) => item.reason)
    const status = response.status || (response.warning ? 'warning' : 'success')
    const errors = [...(response.warning ? [response.warning] : []), ...quarantineWarnings]
    const responseTimeMs = Date.now() - startedAt
    return {
      provider: adapter.key,
      rows,
      warning: uniqueStrings([response.warning, ...quarantineWarnings]).join(' · ') || undefined,
      detail: quarantineWarnings.length ? `${response.detail || ''} ${quarantineWarnings.length} malformed provider row${quarantineWarnings.length === 1 ? '' : 's'} quarantined.`.trim() : response.detail,
      requestCount: response.requestCount,
      status,
      health: await adapter.health(rows, status, responseTimeMs, errors),
      coverage: await adapter.providerCoverage(request, rows, status, response.warning),
      capabilities: adapter.capabilities(),
      diagnostics: diagnosticsFor(adapter.key, request, responseTimeMs, response.cacheStatus || 'bypass', rows.length, errors)
    }
  } catch (error) {
    const warning = error instanceof Error ? error.message : `${adapter.label} failed`
    const responseTimeMs = Date.now() - startedAt
    return {
      provider: adapter.key,
      rows: [],
      warning,
      requestCount: 1,
      status: 'error',
      health: await adapter.health([], 'error', responseTimeMs, [warning]),
      coverage: await adapter.providerCoverage(request, [], 'error', warning),
      capabilities: adapter.capabilities(),
      diagnostics: diagnosticsFor(adapter.key, request, responseTimeMs, 'unavailable', 0, [warning])
    }
  }
}

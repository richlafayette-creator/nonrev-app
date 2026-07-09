import type { NormalizedScheduleResult } from './liveScheduleProviders'

export type ProviderAgnosticScheduleRow = {
  id: string
  source_provider: string
  source_checked_at: string
  flight_number: string
  carrier: string
  airline: string
  origin: string
  destination: string
  departure_time: string
  arrival_time: string
  duration: string
  aircraft: string
  status: string
  score: number
  operating_carrier: string
  operating_flight_number: string
  marketing_flight_numbers: string[]
  duplicate_count: number
}

export type ScheduleProviderSearchRequest = {
  origin?: string
  destination?: string
  date?: string
  carrier?: string
  maxResults?: number
}

export type ScheduleProviderAdapterResult = {
  provider: string
  rows: ProviderAgnosticScheduleRow[]
  warning?: string
  detail?: string
  requestCount?: number
  status?: 'success' | 'warning' | 'error' | 'skipped'
}

export type ScheduleProviderAdapter = {
  key: string
  label: string
  searchSchedules: (request: ScheduleProviderSearchRequest) => Promise<{
    results: NormalizedScheduleResult[]
    warning?: string
    detail?: string
    requestCount?: number
    status?: ScheduleProviderAdapterResult['status']
  }>
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

export function providerScheduleRowFromResult(result: NormalizedScheduleResult, checkedAt = new Date().toISOString()): ProviderAgnosticScheduleRow {
  return {
    id: providerRowId(result),
    source_provider: result.source,
    source_checked_at: result.sourceCheckedAt || checkedAt,
    flight_number: result.flightNumber,
    carrier: result.carrier,
    airline: result.carrier,
    origin: result.origin,
    destination: result.destination,
    departure_time: result.departureTime,
    arrival_time: result.arrivalTime,
    duration: result.duration || 'Not provided',
    aircraft: result.aircraft,
    status: result.status,
    score: providerRowScore(result),
    operating_carrier: result.operatingCarrier || result.carrier,
    operating_flight_number: result.operatingFlightNumber || result.flightNumber,
    marketing_flight_numbers: result.marketingFlightNumbers || [],
    duplicate_count: result.duplicateCount || 0
  }
}

export function providerScheduleRowsFromResults(results: NormalizedScheduleResult[], checkedAt = new Date().toISOString()): ProviderAgnosticScheduleRow[] {
  return results.map((result) => providerScheduleRowFromResult(result, checkedAt))
}

export async function runScheduleProviderAdapter(adapter: ScheduleProviderAdapter, request: ScheduleProviderSearchRequest, checkedAt = new Date().toISOString()): Promise<ScheduleProviderAdapterResult> {
  try {
    const response = await adapter.searchSchedules(request)
    return {
      provider: adapter.key,
      rows: providerScheduleRowsFromResults(response.results, checkedAt),
      warning: response.warning,
      detail: response.detail,
      requestCount: response.requestCount,
      status: response.status || (response.warning ? 'warning' : 'success')
    }
  } catch (error) {
    return {
      provider: adapter.key,
      rows: [],
      warning: error instanceof Error ? error.message : `${adapter.label} failed`,
      requestCount: 1,
      status: 'error'
    }
  }
}

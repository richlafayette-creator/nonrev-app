import type { NormalizedScheduleResult } from './liveScheduleProviders'
import { createProviderResultRepository, type ProviderResultRepository, type ProviderResultStoreResult } from './providerResultRepository'
import { providerScheduleRowsFromResults, type ProviderAgnosticScheduleRow } from './scheduleProviderAdapter'
import { mergeDuplicateScheduleRows } from './scheduleProviderDiagnostics'
import { freshnessFromNormalizedSchedules, type ProviderFreshnessSnapshot } from './providerInfrastructure'

export type ProviderScheduleIngestionBatch = {
  provider: string
  receivedAt?: string
  schedules: unknown[]
  normalize: (schedule: unknown, receivedAt: string) => NormalizedScheduleResult | undefined
}

export type ProviderScheduleIngestionOptions = {
  repository?: ProviderResultRepository
  since?: string
  cache?: boolean
}

export type ProviderScheduleIngestionMetrics = {
  provider: string
  received: number
  normalized: number
  deduplicated: number
  cached: number
  incrementalSkipped: number
  failures: string[]
  coverage: {
    flights: number
    airports: string[]
    carriers: string[]
    routes: string[]
  }
  freshness: ProviderFreshnessSnapshot
  cacheHitRate: number
}

export type ProviderScheduleIngestionResult = {
  provider: string
  rows: ProviderAgnosticScheduleRow[]
  normalized: NormalizedScheduleResult[]
  cacheResult: ProviderResultStoreResult
  metrics: ProviderScheduleIngestionMetrics
  detail: string
}

function normalizedKey(result: NormalizedScheduleResult) {
  return [result.operatingFlightNumber || result.flightNumber, result.origin, result.destination, result.departureTime, result.arrivalTime].join('|')
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort()
}

function isAfterIncrementalCutoff(result: NormalizedScheduleResult, since?: string) {
  if (!since) return true
  const cutoff = Date.parse(since)
  if (!Number.isFinite(cutoff)) return true
  const checkedAt = Date.parse(result.sourceCheckedAt || result.departureTime || '')
  return Number.isFinite(checkedAt) ? checkedAt > cutoff : true
}

export function normalizeAndDeduplicateSchedules(results: NormalizedScheduleResult[]) {
  const merged = new Map<string, NormalizedScheduleResult>()
  results.forEach((result) => {
    const key = normalizedKey(result)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...result, duplicateCount: result.duplicateCount || 0 })
      return
    }
    merged.set(key, {
      ...existing,
      aircraft: existing.aircraft && existing.aircraft !== 'Unknown' ? existing.aircraft : result.aircraft,
      status: existing.status && existing.status !== 'Unknown' ? existing.status : result.status,
      marketingFlightNumbers: uniqueStrings([...(existing.marketingFlightNumbers || []), ...(result.marketingFlightNumbers || []), result.flightNumber]).filter((flightNumber) => flightNumber !== (existing.operatingFlightNumber || existing.flightNumber)),
      duplicateCount: (existing.duplicateCount || 0) + 1 + (result.duplicateCount || 0)
    })
  })
  return [...merged.values()]
}

export async function ingestNormalizedProviderSchedules(batch: ProviderScheduleIngestionBatch, options: ProviderScheduleIngestionOptions = {}): Promise<ProviderScheduleIngestionResult> {
  const receivedAt = batch.receivedAt || new Date().toISOString()
  const failures: string[] = []
  const normalized = batch.schedules.flatMap((schedule) => {
    try {
      const result = batch.normalize(schedule, receivedAt)
      return result ? [result] : []
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${batch.provider} schedule normalization failed`)
      return []
    }
  })
  const incremental = normalized.filter((result) => isAfterIncrementalCutoff(result, options.since))
  const deduplicated = normalizeAndDeduplicateSchedules(incremental)
  const rows = mergeDuplicateScheduleRows(providerScheduleRowsFromResults(deduplicated, receivedAt))
  const repository = options.repository || createProviderResultRepository()
  const cacheResult = options.cache === false
    ? { enabled: false, attempted: false, stored: 0, status: 'skipped' as const, detail: 'Provider schedule ingestion cache write skipped.' }
    : await repository.storeNormalizedResults(deduplicated)
  const airports = uniqueStrings(rows.flatMap((row) => [row.origin, row.destination]))
  const carriers = uniqueStrings(rows.map((row) => row.carrier || row.airline))
  const routes = uniqueStrings(rows.map((row) => `${row.origin}-${row.destination}`))
  const metrics: ProviderScheduleIngestionMetrics = {
    provider: batch.provider,
    received: batch.schedules.length,
    normalized: normalized.length,
    deduplicated: Math.max(0, incremental.length - deduplicated.length),
    cached: cacheResult.stored,
    incrementalSkipped: Math.max(0, normalized.length - incremental.length),
    failures,
    coverage: {
      flights: rows.length,
      airports,
      carriers,
      routes
    },
    freshness: freshnessFromNormalizedSchedules(deduplicated),
    cacheHitRate: deduplicated.length ? Math.round((cacheResult.stored / deduplicated.length) * 10000) / 100 : 0
  }
  return {
    provider: batch.provider,
    rows,
    normalized: deduplicated,
    cacheResult,
    metrics,
    detail: `${deduplicated.length} normalized ${batch.provider} schedule row${deduplicated.length === 1 ? '' : 's'} ingested; ${metrics.deduplicated} duplicate${metrics.deduplicated === 1 ? '' : 's'} merged; ${metrics.incrementalSkipped} stale row${metrics.incrementalSkipped === 1 ? '' : 's'} skipped.`
  }
}

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ingestNormalizedProviderSchedules, normalizeAndDeduplicateSchedules } from './providerScheduleIngestion'
import { createNoopProviderResultRepository } from './providerResultRepository'
import type { NormalizedScheduleResult } from './liveScheduleProviders'

const baseSchedule: NormalizedScheduleResult = {
  carrier: 'UA',
  flightNumber: 'UA100',
  origin: 'SBP',
  destination: 'SFO',
  departureTime: '2026-07-10T13:00:00.000Z',
  arrivalTime: '2026-07-10T14:00:00.000Z',
  aircraft: 'E75',
  status: 'Scheduled',
  source: 'community-provider',
  sourceCheckedAt: '2026-07-10T12:30:00.000Z'
}

describe('provider schedule ingestion', () => {
  it('normalizes and deduplicates equivalent provider schedules before cache write', () => {
    const deduped = normalizeAndDeduplicateSchedules([
      baseSchedule,
      { ...baseSchedule, flightNumber: 'UA100', marketingFlightNumbers: ['NH7000'] }
    ])

    assert.equal(deduped.length, 1)
    assert.equal(deduped[0].duplicateCount, 1)
    assert.deepEqual(deduped[0].marketingFlightNumbers, ['NH7000'])
  })

  it('ingests normalized schedules with incremental refresh, cache, coverage, freshness, and failure metrics', async () => {
    const stored: NormalizedScheduleResult[][] = []
    const result = await ingestNormalizedProviderSchedules({
      provider: 'community-provider',
      receivedAt: '2026-07-10T12:45:00.000Z',
      schedules: [
        baseSchedule,
        { ...baseSchedule, flightNumber: 'UA101', departureTime: '2026-07-09T13:00:00.000Z', arrivalTime: '2026-07-09T14:00:00.000Z', sourceCheckedAt: '2026-07-09T12:30:00.000Z' },
        { broken: true }
      ],
      normalize(schedule) {
        if ('broken' in (schedule as Record<string, unknown>)) throw new Error('bad provider row')
        return schedule as NormalizedScheduleResult
      }
    }, {
      since: '2026-07-10T00:00:00.000Z',
      repository: {
        async storeNormalizedResults(results) {
          stored.push(results)
          return { enabled: true, attempted: true, stored: results.length, status: 'stored', detail: 'stored' }
        },
        async findCachedResults() {
          return { table: 'provider_itinerary_results', storageMode: 'local-fallback', status: 'miss', records: [], detail: 'miss', freshness: 'unavailable', staleRecordCount: 0 }
        }
      }
    })

    assert.equal(result.rows.length, 1)
    assert.equal(result.metrics.received, 3)
    assert.equal(result.metrics.normalized, 2)
    assert.equal(result.metrics.incrementalSkipped, 1)
    assert.equal(result.metrics.cached, 1)
    assert.equal(result.metrics.cacheHitRate, 100)
    assert.deepEqual(result.metrics.coverage.airports, ['SBP', 'SFO'])
    assert.deepEqual(result.metrics.coverage.carriers, ['UA'])
    assert.equal(result.metrics.freshness.newestSourceCheckedAt, '2026-07-10T12:30:00.000Z')
    assert.deepEqual(result.metrics.failures, ['bad provider row'])
    assert.equal(stored[0].length, 1)
  })

  it('retains duplicate-safe last-known-good cache records for stale fallback', async () => {
    const repository = createNoopProviderResultRepository('test cache')
    await repository.storeNormalizedResults([
      { ...baseSchedule, sourceCheckedAt: '2026-07-01T12:30:00.000Z' },
      { ...baseSchedule, sourceCheckedAt: '2026-07-01T12:30:00.000Z' }
    ])

    const freshOnly = await repository.findCachedResults({ origin: 'SBP', destination: 'SFO', date: '2026-07-10', maxAgeHours: 1 })
    const staleFallback = await repository.findCachedResults({ origin: 'SBP', destination: 'SFO', date: '2026-07-10', maxAgeHours: 1, allowStaleOnMiss: true })

    assert.equal(freshOnly.status, 'miss')
    assert.equal(staleFallback.status, 'hit')
    assert.equal(staleFallback.freshness, 'stale')
    assert.equal(staleFallback.staleRecordCount, 1)
    assert.equal(staleFallback.records.length, 1)
    assert.match(staleFallback.detail, /last-known-good|stale/i)
  })
})

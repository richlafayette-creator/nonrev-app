import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { providerScheduleRowFromResult, providerScheduleRowsFromResults } from './scheduleProviderAdapter.ts'
import type { NormalizedScheduleResult } from './liveScheduleProviders'

const normalized: NormalizedScheduleResult = {
  carrier: 'United',
  flightNumber: 'UA100',
  origin: 'SBP',
  destination: 'LAX',
  departureTime: '2026-07-04T12:00:00Z',
  arrivalTime: '2026-07-04T13:00:00Z',
  aircraft: 'E75',
  status: 'Scheduled',
  source: 'flightaware',
  sourceCheckedAt: '2026-07-04T11:00:00Z',
  operatingCarrier: 'UA',
  operatingFlightNumber: 'UA100',
  marketingFlightNumbers: ['NH7000'],
  duplicateCount: 2
}

describe('schedule provider adapter', () => {
  it('converts normalized provider schedules into provider-agnostic flight rows', () => {
    const row = providerScheduleRowFromResult(normalized)

    assert.equal(row.source_provider, 'flightaware')
    assert.equal(row.flight_number, 'UA100')
    assert.equal(row.origin, 'SBP')
    assert.equal(row.destination, 'LAX')
    assert.deepEqual(row.marketing_flight_numbers, ['NH7000'])
    assert.equal(row.duplicate_count, 2)
  })

  it('keeps provider-specific response shapes out of downstream rows', () => {
    const row = providerScheduleRowFromResult({
      ...normalized,
      source: 'aviationstack',
      status: 'Cancelled',
      // Simulates an adapter boundary: unknown provider-native fields are not carried forward.
      nativePayload: { flight: { iata: 'UA100' } }
    } as NormalizedScheduleResult & { nativePayload: unknown })

    assert.equal('nativePayload' in row, false)
    assert.equal(row.source_provider, 'aviationstack')
    assert.equal(row.score, 35)
  })

  it('maps result arrays with one shared checked-at fallback', () => {
    const row = providerScheduleRowsFromResults([{ ...normalized, sourceCheckedAt: undefined }], '2026-07-04T11:30:00Z')[0]

    assert.equal(row.source_checked_at, '2026-07-04T11:30:00Z')
    assert.equal(row.operating_carrier, 'UA')
  })
})

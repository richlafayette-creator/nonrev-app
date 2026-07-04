import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizedResultToProviderResultRecord } from './providerResultRepository.ts'

const normalized = {
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
  duplicateCount: 0
}

describe('provider result provenance', () => {
  it('adds deterministic provenance fields to normalized provider records', () => {
    const first = normalizedResultToProviderResultRecord(normalized)
    const second = normalizedResultToProviderResultRecord({ ...normalized, status: 'On Time' })

    assert.equal(first.provider_request_scope, 'flightaware|SBP|LAX|2026-07-04|United')
    assert.equal(first.provider_request_hash, second.provider_request_hash)
    assert.equal(first.result_fingerprint, second.result_fingerprint)
    assert.equal(first.provenance_version, 'provider-result-provenance-v1')
  })

  it('changes result fingerprints when schedule identity changes', () => {
    const first = normalizedResultToProviderResultRecord(normalized)
    const changed = normalizedResultToProviderResultRecord({ ...normalized, departureTime: '2026-07-04T14:00:00Z' })

    assert.notEqual(first.result_fingerprint, changed.result_fingerprint)
  })
})

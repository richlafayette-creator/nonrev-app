import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  airportTimeZone,
  airportTimeZoneCoverage,
  providerDateTimeToUtcIso
} from './airportTimeZones.ts'

describe('airport timezone resolver', () => {
  it('resolves representative IATA airports to IANA time zones', () => {
    const expected = {
      LAX: 'America/Los_Angeles',
      JFK: 'America/New_York',
      HNL: 'Pacific/Honolulu',
      ANC: 'America/Anchorage',
      HND: 'Asia/Tokyo',
      NRT: 'Asia/Tokyo',
      LHR: 'Europe/London',
      CDG: 'Europe/Paris',
      DXB: 'Asia/Dubai',
      DEL: 'Asia/Kolkata',
      SIN: 'Asia/Singapore',
      SYD: 'Australia/Sydney',
      AKL: 'Pacific/Auckland',
      GRU: 'America/Sao_Paulo',
      JNB: 'Africa/Johannesburg'
    }

    Object.entries(expected).forEach(([airport, timeZone]) => {
      assert.equal(airportTimeZone(airport), timeZone)
      assert.equal(airportTimeZone(airport.toLowerCase()), timeZone)
    })
  })

  it('reports broad local coverage from the static source', () => {
    assert.ok(airportTimeZoneCoverage.supportedIataAirportCount > 10000)
    assert.ok(airportTimeZoneCoverage.mappedAirportCount > 10000)
    assert.equal(airportTimeZoneCoverage.unresolvedAirportCount, 0)
    assert.equal(airportTimeZoneCoverage.coveragePercentage, 100)
  })

  it('returns undefined for unknown or malformed airport codes', () => {
    assert.equal(airportTimeZone('QQQ'), undefined)
    assert.equal(airportTimeZone(''), undefined)
    assert.equal(airportTimeZone('LAXX'), undefined)
    assert.equal(airportTimeZone(null), undefined)
  })

  it('keeps DST-sensitive local timestamp conversion deterministic', () => {
    assert.equal(
      providerDateTimeToUtcIso('2026-08-20T10:40:00', airportTimeZone('LAX')),
      '2026-08-20T17:40:00.000Z'
    )
    assert.equal(
      providerDateTimeToUtcIso('2026-01-15T09:40:00', airportTimeZone('LAX')),
      '2026-01-15T17:40:00.000Z'
    )
    assert.equal(
      providerDateTimeToUtcIso('2026-08-21T14:00:00', airportTimeZone('HND')),
      '2026-08-21T05:00:00.000Z'
    )
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { airportMapScaffolds } from './airportMapScaffold.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { airportGroups, smallAirportHubMap } from './routeCoverageFallback.ts'

describe('airport coverage seed data', () => {
  it('has airport scaffolds for every reviewed airport-group code', () => {
    const groupCodes = airportGroups.flatMap((group) => group.codes)
    const missing = groupCodes.filter((code) => !airportMapScaffolds[code])

    assert.deepEqual(missing, [])
  })

  it('has airport scaffolds for reviewed small-airport hub-map origins and hubs', () => {
    const hubMapCodes = Object.entries(smallAirportHubMap).flatMap(([origin, hubs]) => [origin, ...hubs])
    const missing = [...new Set(hubMapCodes.filter((code) => !airportMapScaffolds[code]))].sort()

    assert.deepEqual(missing, [])
  })

  it('keeps seed coordinates in valid geographic bounds', () => {
    const invalid = Object.values(airportMapScaffolds)
      .filter((airport) => Math.abs(airport.latitude) > 90 || Math.abs(airport.longitude) > 180)
      .map((airport) => airport.code)

    assert.deepEqual(invalid, [])
  })
})

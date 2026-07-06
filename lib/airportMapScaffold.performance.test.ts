import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { airportCodesFromRoute, airportCodesFromRouteCacheLimit, airportCodesFromRouteCacheSize, clearAirportCodesFromRouteCacheForTest } from './airportMapScaffold.ts'

describe('airportCodesFromRoute performance cache', () => {
  it('preserves unique airport-code extraction order', () => {
    clearAirportCodesFromRouteCacheForTest()

    assert.deepEqual(airportCodesFromRoute('SFO → LAX → HNL → SFO'), ['SFO', 'LAX', 'HNL'])
    assert.deepEqual(airportCodesFromRoute('lowercase sfo → lax is intentionally ignored like before'), [])
  })

  it('returns defensive copies so cache hits cannot be mutated by callers', () => {
    clearAirportCodesFromRouteCacheForTest()

    const first = airportCodesFromRoute('MRY → SFO → OGG')
    first.push('BAD')
    const second = airportCodesFromRoute('MRY → SFO → OGG')

    assert.deepEqual(second, ['MRY', 'SFO', 'OGG'])
  })

  it('keeps the route-code cache bounded', () => {
    clearAirportCodesFromRouteCacheForTest()

    for (let index = 0; index < airportCodesFromRouteCacheLimit + 25; index += 1) {
      airportCodesFromRoute(`SFO → LAX → HNL option ${index}`)
    }

    assert.equal(airportCodesFromRouteCacheSize(), airportCodesFromRouteCacheLimit)
  })
})

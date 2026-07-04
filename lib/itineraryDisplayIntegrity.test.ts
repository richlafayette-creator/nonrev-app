import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { airportCodesFromDisplayRoute, airportPathFromDisplayLegs, itineraryDisplayIntegrityFor } from './itineraryDisplayIntegrity.ts'

describe('itinerary display integrity', () => {
  it('keeps card and details route text aligned to every generated leg', () => {
    const integrity = itineraryDisplayIntegrityFor({
      route: 'SBP → BOS',
      connections: 0,
      legs: [
        { origin: 'SBP', destination: 'LAX' },
        { origin: 'LAX', destination: 'BOS' }
      ]
    })

    assert.equal(integrity.displayRoute, 'SBP → LAX → BOS')
    assert.deepEqual(integrity.displayAirports, ['SBP', 'LAX', 'BOS'])
    assert.equal(integrity.displayConnectionCount, 1)
    assert.equal(integrity.routeMatchesLegs, false)
    assert.equal(integrity.rebuiltFromLegs, true)
    assert.match(integrity.warning || '', /rebuilt from generated legs/i)
  })

  it('preserves already-correct generated route frameworks', () => {
    const integrity = itineraryDisplayIntegrityFor({
      route: 'LAX → HNL → OGG',
      connections: 1,
      legs: [
        { origin: 'LAX', destination: 'HNL' },
        { origin: 'HNL', destination: 'OGG' }
      ]
    })

    assert.equal(integrity.displayRoute, 'LAX → HNL → OGG')
    assert.deepEqual(integrity.displayAirports, ['LAX', 'HNL', 'OGG'])
    assert.equal(integrity.displayConnectionCount, 1)
    assert.equal(integrity.routeMatchesLegs, true)
    assert.equal(integrity.rebuiltFromLegs, false)
  })

  it('falls back to route framework text when leg data is unavailable', () => {
    const integrity = itineraryDisplayIntegrityFor({ route: 'SBP → SFO → NRT', legs: [] })

    assert.equal(integrity.displayRoute, 'SBP → SFO → NRT')
    assert.deepEqual(integrity.displayAirports, ['SBP', 'SFO', 'NRT'])
    assert.equal(integrity.displayConnectionCount, 1)
    assert.equal(integrity.routeMatchesLegs, true)
  })

  it('normalizes airport paths consistently for display verification', () => {
    assert.deepEqual(airportCodesFromDisplayRoute('BOS → DEN → SBP'), ['BOS', 'DEN', 'SBP'])
    assert.deepEqual(airportPathFromDisplayLegs([{ origin: 'bos', destination: 'den' }, { origin: 'DEN', destination: 'SBP' }]), ['BOS', 'DEN', 'SBP'])
  })
})

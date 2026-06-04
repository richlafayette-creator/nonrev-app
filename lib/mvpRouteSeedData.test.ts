import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildItinerariesFromFlights, normalizeItineraryRequest } from './itinerarySearch.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { mvpRouteSeedDate, mvpRouteSeedFlights, mvpRouteSeedFlightsForRequest } from './mvpRouteSeedData.ts'

function request(origin: string, destination: string, params: Record<string, string> = {}) {
  return normalizeItineraryRequest(new URLSearchParams({ origin, destination, carrier: 'all', maxLegs: '2', ...params }))
}

describe('MVP route seed data', () => {
  it('covers required personal-testing routes with matched itinerary cards', () => {
    const requiredRoutes = [
      ['LAX', 'HNL'],
      ['SFO', 'HNL'],
      ['SEA', 'HNL'],
      ['LAX', 'OGG'],
      ['SFO', 'OGG']
    ] as const

    for (const [origin, destination] of requiredRoutes) {
      const seedFlights = mvpRouteSeedFlightsForRequest(request(origin, destination))
      const itineraries = buildItinerariesFromFlights(seedFlights, request(origin, destination))
      assert.ok(seedFlights.length > 0, `${origin}-${destination} should have seed flight rows`)
      assert.ok(itineraries.length > 0, `${origin}-${destination} should build matched itinerary cards`)
      assert.ok(itineraries.every((itinerary) => itinerary.route === `${origin} → ${destination}`), `${origin}-${destination} should stay on requested route`)
    }
  })

  it('includes United, Delta, Alaska, and Hawaiian examples', () => {
    const carriers = new Set(mvpRouteSeedFlights.map((flight) => String(flight.carrier)))
    assert.ok(carriers.has('United'))
    assert.ok(carriers.has('Delta'))
    assert.ok(carriers.has('Alaska'))
    assert.ok(carriers.has('Hawaiian'))
  })

  it('labels every row as static test data and respects date filtering', () => {
    assert.ok(mvpRouteSeedFlights.length > 0)
    assert.ok(mvpRouteSeedFlights.every((flight) => String(flight.status).includes('MVP test data')))
    assert.ok(mvpRouteSeedFlights.every((flight) => String(flight.source_provider).includes('test-data')))
    assert.equal(mvpRouteSeedFlightsForRequest(request('LAX', 'HNL', { date: mvpRouteSeedDate })).length, 3)
    assert.equal(mvpRouteSeedFlightsForRequest(request('LAX', 'HNL', { date: '2026-07-16' })).length, 0)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildAllItinerariesFromFlights, normalizeItineraryRequest } from './itinerarySearch.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { canonicalizeItinerary } from './canonicalItinerary.ts'

const fixedNow = new Date('2026-07-09T14:46:00.000Z')

function row(id: string, flight: string, origin: string, destination: string, departureTime: string, arrivalTime: string, sourceProvider = 'flightaware') {
  return {
    id,
    flight_number: flight,
    operating_flight_number: flight,
    operating_carrier: flight.slice(0, 2),
    carrier: flight.startsWith('UA') ? 'United' : flight.startsWith('AA') ? 'American' : 'Delta',
    origin,
    destination,
    departure_time: departureTime,
    arrival_time: arrivalTime,
    aircraft: 'Scheduled equipment unavailable',
    status: 'Scheduled',
    source_provider: sourceProvider,
    source_checked_at: '2026-07-09T14:46:00.000Z'
  }
}

const fixtureRows = [
  row('sbp-lax-1', 'UA5801', 'SBP', 'LAX', '2026-07-10T13:00:00.000Z', '2026-07-10T14:10:00.000Z'),
  row('lax-hnd-1', 'UA39', 'LAX', 'HND', '2026-07-10T16:00:00.000Z', '2026-07-11T03:00:00.000Z'),
  row('sbp-den-1', 'UA5890', 'SBP', 'DEN', '2026-07-10T12:00:00.000Z', '2026-07-10T15:30:00.000Z'),
  row('den-jfk-1', 'UA1708', 'DEN', 'JFK', '2026-07-10T17:00:00.000Z', '2026-07-10T20:45:00.000Z'),
  row('sfo-nrt-1', 'UA837', 'SFO', 'NRT', '2026-07-10T18:30:00.000Z', '2026-07-11T05:00:00.000Z'),
  row('lax-cdg-1', 'DL290', 'LAX', 'CDG', '2026-07-10T22:00:00.000Z', '2026-07-11T09:20:00.000Z'),
  row('sbp-lax-sat', 'UA5810', 'SBP', 'LAX', '2026-07-11T13:00:00.000Z', '2026-07-11T14:05:00.000Z'),
  row('lax-fco-sat', 'DL66', 'LAX', 'FCO', '2026-07-11T16:30:00.000Z', '2026-07-12T04:15:00.000Z'),
  row('fco-olb-sat', 'DL9201', 'FCO', 'OLB', '2026-07-12T06:00:00.000Z', '2026-07-12T07:00:00.000Z')
]

describe('core reliability route searches', () => {
  const cases = [
    { query: 'SBP to HND tomorrow', origin: 'SBP', destination: 'HND', date: '2026-07-10', minItineraries: 1 },
    { query: 'LAX to HND tomorrow', origin: 'LAX', destination: 'HND', date: '2026-07-10', minItineraries: 1 },
    { query: 'SBP to JFK tomorrow', origin: 'SBP', destination: 'JFK', date: '2026-07-10', minItineraries: 1 },
    { query: 'SFO to NRT tomorrow', origin: 'SFO', destination: 'NRT', date: '2026-07-10', minItineraries: 1 },
    { query: 'LAX to CDG tomorrow', origin: 'LAX', destination: 'CDG', date: '2026-07-10', minItineraries: 1 },
    { query: 'SBP to Sardinia Saturday', origin: 'SBP', destination: 'OLB', date: '2026-07-11', minItineraries: 1 }
  ]

  for (const scenario of cases) {
    it(`resolves and assembles provider behavior for ${scenario.query}`, () => {
      const request = normalizeItineraryRequest(new URLSearchParams({ q: scenario.query, carrier: 'all', maxLegs: '3' }), fixedNow)
      assert.equal(request.origin, scenario.origin)
      assert.equal(request.destination, scenario.destination)
      assert.equal(request.date, scenario.date)

      const itineraries = buildAllItinerariesFromFlights(fixtureRows, request)
      assert.ok(itineraries.length >= scenario.minItineraries)
      assert.ok(itineraries.every((itinerary) => itinerary.origin === scenario.origin))
      assert.ok(itineraries.every((itinerary) => itinerary.destination === scenario.destination))
      assert.ok(itineraries.every((itinerary) => itinerary.legs.every((leg, index, legs) => index === 0 || legs[index - 1].destination === leg.origin)))
    })
  }

  it('does not mark cached or stored schedule rows as live availability', () => {
    const request = normalizeItineraryRequest(new URLSearchParams({ q: 'LAX to HND tomorrow', carrier: 'all', maxLegs: '2' }), fixedNow)
    const stored = fixtureRows
      .filter((flight) => flight.origin === 'LAX' || flight.destination === 'HND')
      .map((flight) => ({ ...flight, source_provider: 'supabase' }))
    const itinerary = buildAllItinerariesFromFlights(stored, request)[0]
    const canonical = canonicalizeItinerary(itinerary)

    assert.equal(canonical.rowTrust, 'stored')
    assert.equal(canonical.rowIsLive, false)
    assert.equal(canonical.missingData.length, 0)
  })
})

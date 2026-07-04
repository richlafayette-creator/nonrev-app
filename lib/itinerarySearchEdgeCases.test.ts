import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildAllItinerariesFromFlights, flightMatchesRequest, normalizeItineraryRequest, summarizeRouteMatching, type ParsedItineraryRequest } from './itinerarySearch.ts'

function request(overrides: Partial<ParsedItineraryRequest> = {}): ParsedItineraryRequest {
  return {
    origin: 'SBP',
    destination: 'NRT',
    date: '2026-07-04',
    carrier: 'united',
    maxLegs: 3,
    parserConfidence: 99,
    parserExplanation: 'test request',
    parserFallbackApplied: false,
    ...overrides
  }
}

function flight(origin: string, destination: string, departureTime: string, arrivalTime: string, flightNumber: string, carrier = 'United') {
  return {
    id: flightNumber,
    origin,
    destination,
    departure_time: departureTime,
    arrival_time: arrivalTime,
    flight_number: flightNumber,
    carrier,
    aircraft: 'A320',
    status: 'Scheduled',
    score: 80,
    source_provider: 'supabase'
  }
}

describe('itinerary search edge cases', () => {
  it('clamps max legs and ignores malformed explicit airport input', () => {
    assert.equal(normalizeItineraryRequest(new URLSearchParams('origin=SBP&destination=NRT&maxLegs=99')).maxLegs, 3)
    assert.equal(normalizeItineraryRequest(new URLSearchParams('origin=SBP&destination=NRT&maxLegs=0')).maxLegs, 1)
    assert.equal(normalizeItineraryRequest(new URLSearchParams('origin=SBP&destination=NRT&maxLegs=abc')).maxLegs, 2)

    const malformed = normalizeItineraryRequest(new URLSearchParams('origin=12&destination=ABCDE'))
    assert.equal(malformed.origin, undefined)
    assert.equal(malformed.destination, undefined)
    assert.equal(malformed.parserFallbackApplied, true)
  })

  it('does not satisfy carrier filters with unknown carrier rows', () => {
    const filteredRequest = request({ origin: 'SBP', destination: 'LAX', carrier: 'united' })
    assert.equal(flightMatchesRequest(flight('SBP', 'LAX', '2026-07-04T12:00:00Z', '2026-07-04T13:00:00Z', 'UA100', 'United'), filteredRequest), true)
    assert.equal(flightMatchesRequest(flight('SBP', 'LAX', '2026-07-04T12:00:00Z', '2026-07-04T13:00:00Z', 'DL100', 'Delta'), filteredRequest), false)
    assert.equal(flightMatchesRequest({
      origin: 'SBP',
      destination: 'LAX',
      departure_time: '2026-07-04T12:00:00Z',
      arrival_time: '2026-07-04T13:00:00Z',
      source_provider: 'flightaware'
    }, filteredRequest), false)
  })

  it('respects max legs when building connection itineraries', () => {
    const flights = [
      flight('SBP', 'LAX', '2026-07-04T12:00:00Z', '2026-07-04T13:00:00Z', 'UA100'),
      flight('LAX', 'SFO', '2026-07-04T14:30:00Z', '2026-07-04T16:00:00Z', 'UA200'),
      flight('SFO', 'NRT', '2026-07-04T18:00:00Z', '2026-07-05T03:00:00Z', 'UA300')
    ]

    assert.equal(buildAllItinerariesFromFlights(flights, request({ maxLegs: 2 })).some((itinerary) => itinerary.route === 'SBP → LAX → SFO → NRT'), false)
    assert.equal(buildAllItinerariesFromFlights(flights, request({ maxLegs: 3 })).some((itinerary) => itinerary.route === 'SBP → LAX → SFO → NRT'), true)
  })

  it('summarizes empty provider responses without inventing candidates', () => {
    const summary = summarizeRouteMatching([], request())

    assert.equal(summary.totalCandidates, 0)
    assert.equal(summary.finalMatchedRows, 0)
    assert.deepEqual(summary.closestMatchingRoutes, [])
    assert.match(summary.matchExplanation, /No Supabase rows were available/)
  })
})

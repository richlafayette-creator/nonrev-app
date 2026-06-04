import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeItineraryRequest, summarizeRouteMatching } from './itinerarySearch.ts'

function request(origin: string, destination: string) {
  return normalizeItineraryRequest(new URLSearchParams({ origin, destination, carrier: 'all', maxLegs: '2' }))
}

const candidates = [
  { id: 'lax-hnl', flight_number: 'UA1158', origin: 'LAX', destination: 'HNL', departure_time: '2026-06-05T08:00:00Z', carrier: 'United' },
  { id: 'lax-ogg', flight_number: 'HA33', dep_iata: 'LAX', arr_iata: 'OGG', departure: { scheduled: '2026-06-05T09:00:00Z' }, airline: 'Hawaiian Airlines' },
  { id: 'sfo-hnl', ident: 'UA1175', departure_iata: 'SFO', arrival_iata: 'HNL', scheduled_departure: '2026-06-05T10:00:00Z' },
  { id: 'sea-hnl', flight_number: 'AS811', origin_airport_code: 'SEA', destination_airport_code: 'HNL', flight_date: '2026-06-05', carrier: 'Alaska Airlines' },
  { id: 'wrong-route', flight_number: 'DL100', origin: 'ATL', destination: 'JFK', departure_time: '2026-06-05T11:00:00Z', carrier: 'Delta' }
]

describe('route matching diagnostics', () => {
  it('matches LAX-HNL and reports rejected candidate reasons', () => {
    const summary = summarizeRouteMatching(candidates, request('LAX', 'HNL'))
    assert.equal(summary.finalMatchedRows, 1)
    assert.equal(summary.originMatches, 2)
    assert.equal(summary.destinationMatches, 3)
    assert.ok(summary.rejectedCandidates.length <= 5)
    assert.match(summary.rejectedCandidates[0].rejectionReasons.join(' '), /did not match/)
  })

  it('normalizes alternate route fields for LAX-OGG', () => {
    const summary = summarizeRouteMatching(candidates, request('LAX', 'OGG'))
    assert.equal(summary.finalMatchedRows, 1)
    assert.equal(summary.rejectedCandidates.find((candidate) => candidate.id === 'lax-ogg'), undefined)
  })

  it('normalizes alternate route fields for SFO-HNL', () => {
    const summary = summarizeRouteMatching(candidates, request('SFO', 'HNL'))
    assert.equal(summary.finalMatchedRows, 1)
    assert.equal(summary.rejectedCandidates.find((candidate) => candidate.id === 'sfo-hnl'), undefined)
  })

  it('normalizes airport-code route fields for SEA-HNL', () => {
    const summary = summarizeRouteMatching(candidates, request('SEA', 'HNL'))
    assert.equal(summary.finalMatchedRows, 1)
    assert.equal(summary.rejectedCandidates.find((candidate) => candidate.id === 'sea-hnl'), undefined)
  })
})

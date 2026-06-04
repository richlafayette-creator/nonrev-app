import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeItineraryRequest, summarizeRouteMatching } from './itinerarySearch.ts'

function request(origin: string, destination: string) {
  return normalizeItineraryRequest(new URLSearchParams({ origin, destination, carrier: 'all', maxLegs: '2' }))
}

function requestWith(params: Record<string, string>) {
  return normalizeItineraryRequest(new URLSearchParams({ carrier: 'all', maxLegs: '2', ...params }))
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
    assert.equal(summary.exactRouteMatches, 1)
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

  it('reports closest routes when no exact route exists in the dataset', () => {
    const withoutDirectOgg = candidates.filter((candidate) => candidate.id !== 'lax-ogg')
    const summary = summarizeRouteMatching(withoutDirectOgg, request('LAX', 'OGG'))
    assert.equal(summary.finalMatchedRows, 0)
    assert.equal(summary.exactRouteMatches, 0)
    assert.match(summary.matchExplanation, /no row normalized to exact route LAX → OGG/)
    assert.equal(summary.closestMatchingRoutes[0].route, 'LAX → HNL')
    assert.match(summary.closestMatchingRoutes[0].reason, /same origin/)
  })

  it('verifies carrier normalization for United and Alaska Group aliases', () => {
    const unitedSummary = summarizeRouteMatching(candidates, requestWith({ origin: 'LAX', destination: 'HNL', carrier: 'united' }))
    const alaskaGroupSummary = summarizeRouteMatching(candidates, requestWith({ origin: 'SEA', destination: 'HNL', carrier: 'alaska-group' }))
    assert.equal(unitedSummary.finalMatchedRows, 1)
    assert.equal(alaskaGroupSummary.finalMatchedRows, 1)
  })

  it('verifies date filtering is applied to normalized departure dates', () => {
    const matchingDate = summarizeRouteMatching(candidates, requestWith({ origin: 'LAX', destination: 'HNL', date: '2026-06-05' }))
    const missingDate = summarizeRouteMatching(candidates, requestWith({ origin: 'LAX', destination: 'HNL', date: '2026-06-06' }))
    assert.equal(matchingDate.finalMatchedRows, 1)
    assert.equal(missingDate.exactRouteMatches, 1)
    assert.equal(missingDate.finalMatchedRows, 0)
    assert.equal(missingDate.dateMatches, 0)
    assert.match(missingDate.matchExplanation, /1 exact normalized route row, but no rows matched date 2026-06-06/)
  })

  it('reports stale date coverage and nearest-date testing matches', () => {
    const nearestDateRequest = requestWith({ origin: 'LAX', destination: 'HNL', date: '2026-06-05' })
    const shiftedCandidates = JSON.parse(JSON.stringify(candidates).replaceAll('2026-06-05', '2026-05-24')) as Record<string, unknown>[]
    const strict = summarizeRouteMatching(shiftedCandidates, nearestDateRequest)
    const nearest = summarizeRouteMatching(shiftedCandidates, { ...nearestDateRequest, date: '2026-05-24' }, {
      requestedDate: '2026-06-05',
      effectiveMatchDate: '2026-05-24',
      nearestDateApplied: true,
      nearestDateToleranceDays: 14
    })

    assert.equal(strict.finalMatchedRows, 0)
    assert.equal(strict.dateCoverage.oldestFlightDate, '2026-05-24')
    assert.equal(strict.dateCoverage.newestFlightDate, '2026-05-24')
    assert.equal(strict.dateCoverage.requestedDateIsNewerThanAvailableData, true)
    assert.match(strict.dateCoverage.warning || '', /Requested search date 2026-06-05 is newer/)
    assert.equal(nearest.finalMatchedRows, 1)
    assert.equal(nearest.dateCoverage.nearestDateApplied, true)
    assert.equal(nearest.dateCoverage.effectiveMatchDate, '2026-05-24')
    assert.match(nearest.matchExplanation, /Personal Testing Mode nearest-date matching/)
  })

  it('produces a route coverage report for required Hawaii routes', () => {
    const routes = [
      ['LAX', 'HNL'],
      ['LAX', 'OGG'],
      ['SEA', 'HNL'],
      ['SFO', 'HNL']
    ] as const
    const coverageCandidates = candidates.filter((candidate) => candidate.id !== 'lax-ogg')
    const report = routes.map(([origin, destination]) => {
      const summary = summarizeRouteMatching(coverageCandidates, request(origin, destination))
      return {
        route: `${origin} → ${destination}`,
        exactRouteMatches: summary.exactRouteMatches,
        finalMatchedRows: summary.finalMatchedRows,
        closestRoute: summary.closestMatchingRoutes[0]?.route || 'none',
        explanation: summary.matchExplanation
      }
    })

    assert.deepEqual(report.map((entry) => [entry.route, entry.exactRouteMatches, entry.finalMatchedRows]), [
      ['LAX → HNL', 1, 1],
      ['LAX → OGG', 0, 0],
      ['SEA → HNL', 1, 1],
      ['SFO → HNL', 1, 1]
    ])
    assert.equal(report.find((entry) => entry.route === 'LAX → OGG')?.closestRoute, 'LAX → HNL')
  })
})

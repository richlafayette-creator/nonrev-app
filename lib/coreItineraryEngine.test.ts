import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildAllItinerariesFromFlights, buildCanonicalItineraryGraph, normalizeItineraryRequest, validateRoutingEngineCoverage } from './itinerarySearch.ts'

function request(params: Record<string, string>) {
  return normalizeItineraryRequest(new URLSearchParams({ carrier: 'all', maxLegs: '3', date: '2026-07-10', ...params }))
}

const flights = [
  { id: 'sbp-phx-dead-end', flight_number: 'AA700', origin: 'SBP', destination: 'PHX', departure_time: '2026-07-10T11:00:00Z', arrival_time: '2026-07-10T12:30:00Z', carrier: 'American', source_provider: 'flightaware' },
  { id: 'sbp-lax', flight_number: 'UA501', origin: 'SBP', destination: 'LAX', departure_time: '2026-07-10T13:00:00Z', arrival_time: '2026-07-10T14:05:00Z', carrier: 'United', source_provider: 'flightaware' },
  { id: 'lax-nrt', flight_number: 'NH5', origin: 'LAX', destination: 'NRT', departure_time: '2026-07-10T16:00:00Z', arrival_time: '2026-07-11T03:30:00Z', carrier: 'ANA', operating_carrier: 'NH', marketing_flight_numbers: ['UA7945'], source_provider: 'flightaware' },
  { id: 'nrt-hnd-bad', flight_number: 'JL900', origin: 'NRT', destination: 'HND', departure_time: '2026-07-11T03:45:00Z', arrival_time: '2026-07-11T04:30:00Z', carrier: 'Japan Airlines', source_provider: 'aviationstack' },
  { id: 'nrt-hnd', flight_number: 'JL901', origin: 'NRT', destination: 'HND', departure_time: '2026-07-11T05:00:00Z', arrival_time: '2026-07-11T05:55:00Z', carrier: 'Japan Airlines', source_provider: 'aviationstack' },
  { id: 'sbp-sfo', flight_number: 'AS2201', origin: 'SBP', destination: 'SFO', departure_time: '2026-07-10T13:30:00Z', arrival_time: '2026-07-10T14:40:00Z', carrier: 'Alaska Airlines', source_provider: 'provider-cache:alaska' },
  { id: 'sfo-hnd', flight_number: 'JL1', origin: 'SFO', destination: 'HND', departure_time: '2026-07-10T17:00:00Z', arrival_time: '2026-07-11T04:40:00Z', carrier: 'Japan Airlines', marketing_flight_numbers: ['AS6919'], source_provider: 'aviationstack' },
  { id: 'sbp-sea', flight_number: 'AS200', origin: 'SBP', destination: 'SEA', departure_time: '2026-07-10T12:00:00Z', arrival_time: '2026-07-10T14:00:00Z', carrier: 'Alaska Airlines', source_provider: 'supabase' },
  { id: 'sea-hnd', flight_number: 'DL167', origin: 'SEA', destination: 'HND', departure_time: '2026-07-10T17:20:00Z', arrival_time: '2026-07-11T05:10:00Z', carrier: 'Delta', source_provider: 'flightaware' }
]

describe('core itinerary engine exhaustive discovery', () => {
  it('builds a canonical graph with airports, legal connections, alliances, and codeshares', () => {
    const graph = buildCanonicalItineraryGraph(flights, request({ origin: 'SBP', destination: 'HND' }))

    assert.ok(graph.airports.includes('SBP'))
    assert.ok(graph.airports.includes('HND'))
    assert.ok(graph.codeshares.some((codeshare) => codeshare.marketingFlightNumbers.includes('UA7945')))
    assert.equal(graph.minimumConnectionTimes.domesticMinutes, 35)
    assert.equal(graph.minimumConnectionTimes.internationalMinutes, 60)
    assert.ok(graph.legalConnections.some((connection) => connection.fromFlightNumber === 'UA501' && connection.toFlightNumber === 'NH5' && connection.alliancePartner))
    assert.ok(graph.exclusionLog.some((entry) => entry.includes('JL900') && entry.includes('outside legal window')))
  })

  it('returns every legal assembled itinerary before scoring can rank them', () => {
    const itineraries = buildAllItinerariesFromFlights(flights, request({ origin: 'SBP', destination: 'HND' }))
    const routes = itineraries.map((itinerary) => itinerary.route).sort()

    assert.deepEqual(routes, [
      'SBP → LAX → NRT → HND',
      'SBP → SEA → HND',
      'SBP → SFO → HND'
    ])
    assert.ok(itineraries.every((itinerary) => itinerary.completeness?.hasAllScheduledLegs))
    assert.ok(itineraries.every((itinerary) => itinerary.providerCoverage?.providers.length))
    assert.ok(itineraries.every((itinerary) => itinerary.confidence?.score))
    assert.ok(itineraries.every((itinerary) => itinerary.whyIncluded?.length))
  })

  it('does not remove lower-scoring alliance or secondary-airport itineraries', () => {
    const itineraries = buildAllItinerariesFromFlights(flights, request({ origin: 'SBP', destination: 'HND' }))

    assert.ok(itineraries.some((itinerary) => itinerary.route === 'SBP → SEA → HND'))
    assert.ok(itineraries.some((itinerary) => itinerary.route === 'SBP → SFO → HND'))
    assert.ok(itineraries.some((itinerary) => itinerary.route === 'SBP → LAX → NRT → HND'))
  })

  it('reports expected, discovered, missing, duplicate, and excluded routes for validation mode', () => {
    const expectedItineraries = [
      'SBP → LAX → NRT → HND',
      'SBP → SEA → HND',
      'SBP → SFO → HND'
    ]
    const report = validateRoutingEngineCoverage(flights, request({ origin: 'SBP', destination: 'HND' }), { expectedItineraries })

    assert.equal(report.routingCoveragePercentage, 100)
    assert.deepEqual(report.expectedItineraries, expectedItineraries.sort())
    assert.deepEqual(report.missingItineraries, [])
    assert.deepEqual(report.duplicateItineraries, [])
    assert.ok(report.flightsExamined >= flights.length)
    assert.ok(report.legalConnectionsFound >= 3)
    assert.ok(report.airportsExplored.includes('SBP'))
    assert.ok(report.edgesExplored >= 3)
    assert.equal(report.completeItinerariesFound, 3)
    assert.ok(report.itinerariesFiltered >= 1)
    assert.ok(report.providerContribution.flightaware.flightLegs >= 1)
    assert.ok(report.searchDurationMs >= 0)
    assert.equal(report.safetyCapHit, false)
    assert.equal(report.safetyCapLimit, 50000)
    assert.ok(report.discardedConnections.some((entry) => entry.includes('JL900')))
    assert.ok(report.discardedItineraries.some((item) => item.route === 'SBP → PHX' && item.reason.includes('No legal onward connection')))
  })

  it('honors configurable connection windows, airline restrictions, alliance preference metadata, and airport blacklist', () => {
    const baseline = validateRoutingEngineCoverage(flights, request({ origin: 'SBP', destination: 'HND' }), {
      expectedItineraries: ['SBP → LAX → NRT → HND', 'SBP → SEA → HND', 'SBP → SFO → HND'],
      minimumConnectionMinutes: 35,
      maximumConnectionMinutes: 24 * 60,
      maxLegs: 3,
      alliancePreference: 'oneworld'
    })
    assert.equal(baseline.routingCoveragePercentage, 100)

    const noSea = validateRoutingEngineCoverage(flights, request({ origin: 'SBP', destination: 'HND' }), {
      expectedItineraries: ['SBP → LAX → NRT → HND', 'SBP → SFO → HND'],
      airportBlacklist: ['SEA']
    })
    assert.deepEqual(noSea.missingItineraries, [])
    assert.ok(!noSea.discoveredItineraries.includes('SBP → SEA → HND'))

    const alaskaOnly = buildAllItinerariesFromFlights(flights, request({ origin: 'SBP', destination: 'HND' }), {}, { airlineRestrictions: ['AS', 'Alaska', 'JL'] })
    assert.deepEqual(alaskaOnly.map((itinerary) => itinerary.route), ['SBP → SFO → HND'])
  })

  it('covers dense international, small regional, disconnected, mixed-carrier, circular-prevention, and duplicate-merge scenarios', () => {
    const denseFlights = [
      ...flights,
      { id: 'sbp-lax-dupe', flight_number: 'UA501', origin: 'SBP', destination: 'LAX', departure_time: '2026-07-10T13:00:00Z', arrival_time: '2026-07-10T14:05:00Z', carrier: 'United', source_provider: 'aviationstack' },
      { id: 'lax-cdg', flight_number: 'AF65', origin: 'LAX', destination: 'CDG', departure_time: '2026-07-10T17:30:00Z', arrival_time: '2026-07-11T06:30:00Z', carrier: 'Air France', source_provider: 'flightaware' },
      { id: 'cdg-hnd', flight_number: 'JL46', origin: 'CDG', destination: 'HND', departure_time: '2026-07-11T09:00:00Z', arrival_time: '2026-07-11T20:00:00Z', carrier: 'Japan Airlines', source_provider: 'aviationstack' },
      { id: 'lax-sbp-cycle', flight_number: 'UA502', origin: 'LAX', destination: 'SBP', departure_time: '2026-07-10T15:00:00Z', arrival_time: '2026-07-10T16:00:00Z', carrier: 'United', source_provider: 'flightaware' },
      { id: 'xyz-abc', flight_number: 'ZZ1', origin: 'XYZ', destination: 'ABC', departure_time: '2026-07-10T10:00:00Z', arrival_time: '2026-07-10T11:00:00Z', carrier: 'Disconnected Air', source_provider: 'supabase' }
    ]
    const report = validateRoutingEngineCoverage(denseFlights, request({ origin: 'SBP', destination: 'HND' }), {
      expectedItineraries: ['SBP → LAX → CDG → HND', 'SBP → LAX → NRT → HND', 'SBP → SEA → HND', 'SBP → SFO → HND']
    })
    const disconnected = validateRoutingEngineCoverage(denseFlights, request({ origin: 'SBP', destination: 'ABC' }), { expectedItineraries: [] })

    assert.equal(report.routingCoveragePercentage, 100)
    assert.ok(report.discoveredItineraries.includes('SBP → LAX → CDG → HND'))
    assert.ok(report.discoveredItineraries.includes('SBP → SEA → HND'))
    assert.ok(report.duplicateMerges >= 1)
    assert.ok(report.discardedItineraries.some((item) => item.reason.includes('Cycle prevented')))
    assert.equal(disconnected.completeItinerariesFound, 0)
    assert.ok(disconnected.itinerariesFiltered > 0)
  })

  it('discloses configurable computational safety caps instead of silently truncating graph exploration', () => {
    const report = validateRoutingEngineCoverage(flights, request({ origin: 'SBP', destination: 'HND' }), { maxGraphEdges: 1 })

    assert.equal(report.safetyCapHit, true)
    assert.equal(report.safetyCapLimit, 1)
    assert.ok(report.discardedItineraries.some((item) => item.reason.includes('Configurable graph edge safety cap 1')))
  })

  it('covers simple domestic, domestic plus international hub, 2-stop international, alliance, codeshare, secondary-airport, and multiple-routing searches', () => {
    const cases = [
      { name: 'simple domestic', origin: 'SBP', destination: 'LAX', expected: ['SBP → LAX'] },
      { name: 'domestic plus international hub', origin: 'SBP', destination: 'NRT', expected: ['SBP → LAX → NRT'] },
      { name: '2-stop international', origin: 'SBP', destination: 'HND', expected: ['SBP → LAX → NRT → HND', 'SBP → SEA → HND', 'SBP → SFO → HND'] },
      { name: 'alliance connections', origin: 'SBP', destination: 'NRT', expected: ['SBP → LAX → NRT'] },
      { name: 'codeshares', origin: 'LAX', destination: 'HND', expected: ['LAX → NRT → HND'] },
      { name: 'secondary airports', origin: 'SBP', destination: 'HND', expected: ['SBP → LAX → NRT → HND', 'SBP → SEA → HND', 'SBP → SFO → HND'] },
      { name: 'multiple valid routings', origin: 'SBP', destination: 'HND', expected: ['SBP → LAX → NRT → HND', 'SBP → SEA → HND', 'SBP → SFO → HND'] }
    ]

    for (const item of cases) {
      const report = validateRoutingEngineCoverage(flights, request({ origin: item.origin, destination: item.destination }), { expectedItineraries: item.expected })
      assert.equal(report.routingCoveragePercentage, 100, `${item.name} missing ${report.missingItineraries.join(', ')}`)
      assert.deepEqual(report.missingItineraries, [], item.name)
    }
  })
})

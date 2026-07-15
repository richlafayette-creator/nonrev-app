import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { loadAvailabilityDisclaimer, summarizeLoadAvailabilityForFlights, type LoadAvailabilityObservation } from './loadAvailability.ts'

describe('truthful load availability interfaces', () => {
  const now = new Date('2026-07-14T06:08:00Z')

  it('keeps valid schedules separate from unavailable standby/load data', () => {
    const summaries = summarizeLoadAvailabilityForFlights(['UA100'], [], { now })

    assert.equal(summaries[0].status, 'unavailable')
    assert.equal(summaries[0].label, 'Load data unavailable')
    assert.deepEqual(summaries[0].sources, [])
    assert.match(loadAvailabilityDisclaimer(summaries[0]), /valid schedule itinerary may be shown without standby\/load availability/)
  })

  it('labels live, community, stale, and unverified observations without inventing probabilities', () => {
    const observations: LoadAvailabilityObservation[] = [
      { id: 'live', kind: 'live-standby-provider', flightNumber: 'UA100', reportedAt: '2026-07-14T05:58:00Z', verifiedCarrier: true, availableSeats: 4, standbyCount: 2 },
      { id: 'community', kind: 'community-reported', flightNumber: 'NH7', reportedAt: '2026-07-14T05:30:00Z', contributorTrustScore: 65, availableSeats: 3, standbyCount: 1 },
      { id: 'stale', kind: 'employee-submitted', flightNumber: 'DL55', reportedAt: '2026-07-13T22:00:00Z', verifiedCarrier: true },
      { id: 'unverified', kind: 'employee-submitted', flightNumber: 'AA10', reportedAt: '2026-07-14T05:45:00Z', verifiedCarrier: false }
    ]

    const byFlight = Object.fromEntries(summarizeLoadAvailabilityForFlights(['UA100', 'NH7', 'DL55', 'AA10'], observations, { now }).map((summary) => [summary.flightNumber, summary]))

    assert.equal(byFlight.UA100.status, 'available')
    assert.equal(byFlight.NH7.status, 'community-reported')
    assert.equal(byFlight.DL55.status, 'stale')
    assert.equal(byFlight.AA10.status, 'unverified')
    assert.ok(!('successProbability' in byFlight.UA100))
    assert.ok(byFlight.NH7.warnings.some((warning) => warning.includes('Community-reported')))
    assert.ok(byFlight.DL55.warnings.some((warning) => warning.includes('stale')))
  })

  it('requires exact route and departure date identity when schedule flight details are known', () => {
    const observations: LoadAvailabilityObservation[] = [
      { id: 'wrong-date', kind: 'live-standby-provider', carrier: 'UA', flightNumber: 'UA100', origin: 'SFO', destination: 'HND', departureDate: '2026-07-13', reportedAt: '2026-07-14T05:58:00Z', verifiedCarrier: true },
      { id: 'wrong-market', kind: 'live-standby-provider', carrier: 'UA', flightNumber: 'UA100', origin: 'LAX', destination: 'HND', departureDate: '2026-07-14', reportedAt: '2026-07-14T05:58:00Z', verifiedCarrier: true },
      { id: 'exact', kind: 'live-standby-provider', carrier: 'UA', flightNumber: ' ua 100 ', origin: 'sfo', destination: 'hnd', departureDate: '2026-07-14', reportedAt: '2026-07-14T05:50:00Z', verifiedCarrier: true }
    ]

    const [summary] = summarizeLoadAvailabilityForFlights([
      { carrier: 'UA', flightNumber: 'UA 100', origin: 'SFO', destination: 'HND', departureDate: '2026-07-14' }
    ], observations, { now })

    assert.equal(summary.status, 'available')
    assert.deepEqual(summary.sources.map((source) => source.id), ['exact'])
    assert.equal(summary.origin, 'SFO')
    assert.equal(summary.destination, 'HND')
    assert.equal(summary.departureDate, '2026-07-14')
  })

  it('does not expose historical or expired observations as current load availability', () => {
    const observations: LoadAvailabilityObservation[] = [
      { id: 'historical', kind: 'historical-observation', flightNumber: 'UA100', reportedAt: '2026-07-14T05:58:00Z', verifiedCarrier: true, availableSeats: 6, standbyCount: 1 },
      { id: 'expired', kind: 'live-standby-provider', flightNumber: 'NH7', reportedAt: '2026-07-13T00:00:00Z', verifiedCarrier: true, availableSeats: 6, standbyCount: 1 }
    ]

    const byFlight = Object.fromEntries(summarizeLoadAvailabilityForFlights(['UA100', 'NH7'], observations, { now }).map((summary) => [summary.flightNumber, summary]))

    assert.equal(byFlight.UA100.status, 'unavailable')
    assert.deepEqual(byFlight.UA100.sources, [])
    assert.ok(byFlight.UA100.warnings.some((warning) => warning.includes('Historical load observations')))
    assert.equal(byFlight.NH7.status, 'unavailable')
    assert.deepEqual(byFlight.NH7.sources, [])
    assert.ok(byFlight.NH7.warnings.some((warning) => warning.includes('Expired load observations')))
  })
})

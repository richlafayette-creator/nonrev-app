import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  discoverGateways,
  filterGatewaysByRegion,
  gatewayAssumptions,
  rankGateways,
  type GatewayCandidate
} from './gatewayDiscovery.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createDefaultTripMission, parseMissionFromPrompt } from './tripMission.ts'

describe('gateway discovery engine', () => {
  it('filters European gateways for Europe missions', () => {
    const mission = parseMissionFromPrompt('Family of 5 leaving SBP July 27. Europe. Eventually Montenegro.')
    const gateways = discoverGateways(mission)

    assert.ok(gateways.length > 0)
    assert.deepEqual([...new Set(gateways.map((gateway) => gateway.region))], ['Europe'])
    assert.deepEqual(gateways.map((gateway) => gateway.airportCode), ['FRA', 'AMS', 'MUC', 'ZRH', 'CDG', 'LHR', 'VIE', 'MAD', 'FCO', 'BRU'])
    assert.ok(gateways[0].reasons.includes('Respects preferred departure airports'))
  })

  it('filters Asian gateways for Asia missions', () => {
    const mission = parseMissionFromPrompt('Flexible gateway from SFO or OAK to Asia, allow rail and ferry if needed')
    const gateways = discoverGateways(mission)

    assert.ok(gateways.length > 0)
    assert.deepEqual([...new Set(gateways.map((gateway) => gateway.region))], ['Asia'])
    assert.ok(gateways.some((gateway) => gateway.airportCode === 'ICN'))
    assert.ok(gateways.some((gateway) => gateway.airportCode === 'SIN'))
  })

  it('prefers HND and NRT for Japan missions', () => {
    const mission = parseMissionFromPrompt('ZED from SEA to Tokyo, best chance for one traveler')
    const gateways = discoverGateways(mission)

    assert.deepEqual(gateways.map((gateway) => gateway.airportCode), ['HND', 'NRT'])
  })

  it('ranks gateways by the weighted score model', () => {
    const ranked = rankGateways([
      candidate('AAA', 70, 70, 70),
      candidate('BBB', 90, 90, 90),
      candidate('CCC', 80, 95, 75)
    ])

    assert.deepEqual(ranked.map((gateway) => gateway.airportCode), ['BBB', 'CCC', 'AAA'])
    assert.equal(ranked[0].score, 90)
    assert.ok(ranked[0].reasons.includes('Excellent onward connectivity'))
    assert.ok(ranked[0].reasons.includes('Strong ZED coverage'))
  })

  it('keeps scores normalized between 0 and 100', () => {
    const ranked = rankGateways([
      candidate('LOW', -10, -20, -30),
      candidate('HIH', 130, 120, 110)
    ])

    assert.equal(ranked.find((gateway) => gateway.airportCode === 'LOW')?.score, 0)
    assert.equal(ranked.find((gateway) => gateway.airportCode === 'HIH')?.score, 100)
  })

  it('returns no gateways for an empty mission', () => {
    assert.deepEqual(discoverGateways(createDefaultTripMission()), [])
  })

  it('deduplicates gateways by airport code and keeps the strongest duplicate', () => {
    const ranked = rankGateways([
      candidate('fra', 40, 40, 40),
      candidate('FRA', 90, 95, 92),
      candidate('AMS', 80, 80, 80)
    ])

    assert.deepEqual(ranked.map((gateway) => gateway.airportCode), ['FRA', 'AMS'])
    assert.equal(ranked[0].score, 92)
  })

  it('returns deterministic output for repeated runs', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED and revenue backup')
    const first = discoverGateways(mission)
    const second = discoverGateways(mission)

    assert.deepEqual(second, first)
  })

  it('summarizes gateway assumptions without hidden data', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe')
    const assumptions = gatewayAssumptions(mission)

    assert.ok(assumptions.includes('Destination region: Europe'))
    assert.ok(assumptions.includes('Gateway flexibility: preferred departure airports respected'))
    assert.ok(assumptions.includes('Preferred departure airports: SFO'))
    assert.ok(assumptions.includes('Scoring weights: historical reliability 40%, onward connectivity 35%, ZED coverage 25%'))
  })

  it('filters the temporary catalog by explicit region helpers', () => {
    assert.deepEqual(filterGatewaysByRegion('South Pacific').map((gateway) => gateway.airportCode), ['SYD', 'AKL'])
    assert.deepEqual(filterGatewaysByRegion('Caribbean'), [])
  })
})

function candidate(
  airportCode: string,
  historicalReliabilityScore: number,
  onwardConnectivityScore: number,
  zedCoverageScore: number
): GatewayCandidate {
  return {
    airportCode,
    city: airportCode,
    country: 'Test',
    region: 'Test',
    score: 0,
    reasons: [],
    historicalReliabilityScore,
    onwardConnectivityScore,
    zedCoverageScore
  }
}

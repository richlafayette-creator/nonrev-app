import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type GatewayCandidate } from './gatewayDiscovery.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  generatePlanA,
  generatePlanB,
  generatePlanC,
  generateStrategies,
  scoreStrategy,
  sortStrategies,
  strategyAssumptions
} from './itineraryStrategy.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createDefaultTripMission, parseMissionFromPrompt } from './tripMission.ts'

describe('itinerary strategy engine', () => {
  it('generates Plan A, Plan B, and Plan C from distinct gateway choices', () => {
    const mission = parseMissionFromPrompt('Family of 5 leaving SBP July 27. Europe. Eventually Montenegro.')
    const plans = generateStrategies(mission)

    assert.equal(plans.length, 3)
    assert.deepEqual(new Set(plans.map((plan) => plan.gateway)).size, 3)
    assert.ok(plans.every((plan) => plan.legs.length >= 1))
    assert.ok(plans.every((plan) => plan.backupTriggers.includes('If first flight closes')))
    assert.ok(plans.every((plan) => plan.backupTriggers.includes('If gateway becomes unavailable')))
  })

  it('never generates duplicate plans for duplicate gateway candidates', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED')
    const gateways = [
      candidate('FRA', 94, 91, 97, 94),
      candidate('FRA', 90, 88, 94, 88),
      candidate('AMS', 90, 88, 94, 87)
    ]
    const plans = generateStrategies(mission, gateways)

    assert.deepEqual(plans.map((plan) => plan.gateway), ['FRA', 'AMS'])
  })

  it('sorts strategies by normalized score and stable tie-breakers', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED')
    const lower = generatePlanA(mission, [candidate('AAA', 70, 70, 70, 70)])
    const higher = generatePlanA(mission, [candidate('BBB', 92, 92, 92, 92)])
    const sorted = sortStrategies([lower, higher])

    assert.deepEqual(sorted.map((plan) => plan.gateway), ['BBB', 'AAA'])
  })

  it('normalizes strategy scores between 0 and 100', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED')
    const lowScore = scoreStrategy(mission, candidate('LOW', -20, -20, -20, -20))
    const highScore = scoreStrategy(mission, candidate('HIH', 130, 130, 130, 130))

    assert.ok(lowScore >= 0)
    assert.ok(lowScore <= 100)
    assert.equal(highScore, 100)
  })

  it('generates strategy reasons', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED')
    const plan = generatePlanA(mission, [candidate('FRA', 94, 91, 97, 94)])

    assert.ok(plan)
    assert.ok(plan.reasons.includes('Highest gateway score'))
    assert.ok(plan.reasons.includes('Multiple onward options'))
    assert.ok(plan.reasons.includes('Good ZED coverage'))
    assert.ok(plan.reasons.includes('Shortest overall route'))
  })

  it('returns no plans for an empty mission', () => {
    assert.deepEqual(generateStrategies(createDefaultTripMission()), [])
  })

  it('creates reasonable Europe mission plans', () => {
    const mission = parseMissionFromPrompt('Family of 5 leaving SBP July 27. Europe. Eventually Montenegro.')
    const [plan] = generateStrategies(mission)

    assert.equal(plan.gateway, 'FRA')
    assert.equal(plan.legs[0].origin, 'SBP')
    assert.equal(plan.legs[0].destination, 'FRA')
    assert.equal(plan.legs[1].destination, 'Montenegro')
    assert.equal(plan.legs[1].transportType, 'flight')
  })

  it('creates Asia mission plans from Asia gateways', () => {
    const mission = parseMissionFromPrompt('Flexible gateway from SFO or OAK to Asia, allow rail and ferry if needed')
    const plans = generateStrategies(mission)

    assert.equal(plans.length, 3)
    assert.ok(plans.every((plan) => ['SIN', 'ICN', 'HND'].includes(plan.gateway)))
    assert.ok(plans.every((plan) => plan.legs[0].origin === 'SFO'))
  })

  it('uses allowed surface travel for Plan C onward legs', () => {
    const mission = parseMissionFromPrompt('Flexible gateway from SFO or OAK to Asia, allow rail and ferry if needed')
    const planC = generatePlanC(mission)

    assert.ok(planC)
    assert.equal(planC.legs.at(-1)?.transportType, 'rail')
  })

  it('returns deterministic output for repeated runs', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED and revenue backup')
    const first = generateStrategies(mission)
    const second = generateStrategies(mission)

    assert.deepEqual(second, first)
  })

  it('summarizes strategy assumptions without claiming provider data', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED')
    const assumptions = strategyAssumptions(mission)

    assert.ok(assumptions.includes('Origin airports: SFO'))
    assert.ok(assumptions.includes('Destination: Europe'))
    assert.ok(assumptions.includes('Plan count: up to 3 distinct gateway choices'))
    assert.ok(assumptions.includes('Provider validation: not included yet'))
  })
})

function candidate(
  airportCode: string,
  score: number,
  historicalReliabilityScore: number,
  onwardConnectivityScore: number,
  zedCoverageScore: number
): GatewayCandidate {
  return {
    airportCode,
    city: airportCode,
    country: 'Test',
    region: 'Test',
    score,
    reasons: [],
    historicalReliabilityScore,
    onwardConnectivityScore,
    zedCoverageScore
  }
}

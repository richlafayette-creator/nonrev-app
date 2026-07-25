import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { discoverGateways, type GatewayCandidate } from './gatewayDiscovery.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { generateStrategies, type ItineraryPlan, type StrategyLeg } from './itineraryStrategy.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  buildRecommendationExplanation,
  evaluateStrategyRisks,
  generateRecommendations,
  recommendationDataQuality,
  recommendationResultAssumptions,
  scoreRecommendation
} from './recommendationEngine.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createDefaultTripMission, parseMissionFromPrompt, type TripMission } from './tripMission.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTravelerProfile, type TravelerProfileScaffold, type ZedAgreementRecord } from './travelerProfile.ts'

const now = new Date('2026-07-22T00:00:00Z')
const liveSignals = {
  liveLoadDataAvailable: true,
  operatingScheduleDataAvailable: true,
  weatherDataAvailable: true
}

describe('recommendation and risk engine', () => {
  it('assigns Plan A, Plan B, and Plan C labels after ranking', () => {
    const mission = europeMission()
    const gateways = discoverGateways(mission)
    const plans = withCarriers(generateStrategies(mission, gateways), ['LH', 'KL', 'AF'])
    const result = generateRecommendations(mission, plans, eligibleProfile('LH'), { gateways, signals: liveSignals, now })

    assert.equal(result.recommendations.length, 3)
    assert.deepEqual(result.recommendations.map((recommendation) => recommendation.rank), [1, 2, 3])
    assert.deepEqual(result.recommendations.map((recommendation) => recommendation.label), ['Plan A', 'Plan B', 'Plan C'])
  })

  it('applies a whole-party ZED eligibility bonus', () => {
    const mission = zedMission()
    const plan = planFixture({ carrier: 'LH', score: 70 })
    const eligible = scoreRecommendation(mission, plan, eligibleProfile('LH'), { now, signals: liveSignals }).finalScore
    const ineligible = scoreRecommendation(mission, plan, eligibleProfile('KL'), { now, signals: liveSignals }).finalScore

    assert.ok(eligible > ineligible)
    assert.ok(eligible - ineligible >= 8)
  })

  it('penalizes missing ZED coverage when ZED is requested', () => {
    const plan = planFixture({ carrier: 'ZZ', score: 70 })
    const zedRequested = scoreRecommendation(zedMission(), plan, eligibleProfile('LH'), { now, signals: liveSignals }).finalScore
    const zedNotRequested = scoreRecommendation({ ...zedMission(), allowZed: false }, plan, eligibleProfile('LH'), { now, signals: liveSignals }).finalScore

    assert.equal(zedNotRequested - zedRequested, 10)
  })

  it('penalizes stale ZED verification', () => {
    const mission = zedMission()
    const plan = planFixture({ carrier: 'LH', score: 70 })
    const fresh = scoreRecommendation(mission, plan, eligibleProfile('LH'), { now, signals: liveSignals }).finalScore
    const stale = scoreRecommendation(mission, plan, eligibleProfile('LH', { verifiedAt: '2025-12-01T00:00:00Z' }), { now, signals: liveSignals }).finalScore
    const risks = evaluateStrategyRisks(mission, plan, eligibleProfile('LH', { verifiedAt: '2025-12-01T00:00:00Z' }), { now, signals: liveSignals })

    assert.ok(fresh > stale)
    assert.ok(risks.some((risk) => risk.code === 'stale-zed-verification'))
  })

  it('ignores inactive agreements and reports the risk', () => {
    const mission = zedMission()
    const plan = planFixture({ carrier: 'LH', score: 70 })
    const profile = eligibleProfile('LH', { active: false })
    const result = generateRecommendations(mission, [plan], profile, { now, signals: liveSignals })
    const recommendation = result.recommendations[0]

    assert.equal(recommendation.wholePartyZedEligible, false)
    assert.deepEqual(recommendation.eligibleZedAirlines, [])
    assert.ok(recommendation.risks.some((risk) => risk.code === 'inactive-zed-agreement'))
  })

  it('detects party size risk', () => {
    const risks = evaluateStrategyRisks(europeMission(), planFixture({ carrier: 'LH' }), eligibleProfile('LH'), { now, signals: liveSignals })

    assert.ok(risks.some((risk) => risk.code === 'party-size-risk' && risk.severity === 'medium'))
  })

  it('penalizes excessive legs', () => {
    const mission = zedMission()
    const base = planFixture({ carrier: 'LH', score: 80 })
    const longPlan = { ...base, legs: [...base.legs, leg('AAA', 'BBB'), leg('BBB', 'CCC'), leg('CCC', 'DDD')] }
    const score = scoreRecommendation(mission, longPlan, eligibleProfile('LH'), { now, signals: liveSignals }).finalScore
    const baseScore = scoreRecommendation(mission, base, eligibleProfile('LH'), { now, signals: liveSignals }).finalScore
    const risks = evaluateStrategyRisks(mission, longPlan, eligibleProfile('LH'), { now, signals: liveSignals })

    assert.ok(baseScore - score >= 12)
    assert.ok(risks.some((risk) => risk.code === 'too-many-legs' && risk.scoreImpact === -12))
  })

  it('penalizes mixed transport complexity', () => {
    const mission = zedMission()
    const base = planFixture({ carrier: 'LH', score: 80 })
    const mixed = { ...base, legs: [...base.legs, { origin: 'FRA', destination: 'Montenegro', transportType: 'rail' as const }] }

    assert.equal(scoreRecommendation(mission, base, eligibleProfile('LH'), { now, signals: liveSignals }).finalScore - scoreRecommendation(mission, mixed, eligibleProfile('LH'), { now, signals: liveSignals }).finalScore, 4)
    assert.ok(evaluateStrategyRisks(mission, mixed, eligibleProfile('LH'), { now, signals: liveSignals }).some((risk) => risk.code === 'mixed-transportation-complexity'))
  })

  it('reduces confidence for missing live data without treating it as fatal', () => {
    const mission = zedMission()
    const plan = planFixture({ carrier: 'LH', score: 80 })
    const live = scoreRecommendation(mission, plan, eligibleProfile('LH'), { now, signals: liveSignals }).confidence
    const staticOnly = scoreRecommendation(mission, plan, eligibleProfile('LH'), { now }).confidence
    const risks = evaluateStrategyRisks(mission, plan, eligibleProfile('LH'), { now })

    assert.ok(live > staticOnly)
    assert.ok(risks.some((risk) => risk.code === 'unknown-live-load-data' && risk.scoreImpact === 0))
    assert.ok(risks.some((risk) => risk.code === 'unknown-operating-schedule-data' && risk.scoreImpact === 0))
  })

  it('assigns recommendation statuses at score thresholds', () => {
    assert.equal(singleStatus(82), 'recommended')
    assert.equal(singleStatus(70), 'viable')
    assert.equal(singleStatus(55), 'backup')
    assert.equal(singleStatus(30), 'avoid')
  })

  it('normalizes scores and confidence', () => {
    const mission = zedMission()
    const high = scoreRecommendation(mission, planFixture({ carrier: 'LH', score: 140, confidence: 140, estimatedSuccess: 140 }), eligibleProfile('LH'), { now, signals: liveSignals })
    const low = scoreRecommendation(mission, planFixture({ carrier: 'ZZ', score: -40, confidence: -40, estimatedSuccess: -40 }), eligibleProfile('LH'), { now })

    assert.deepEqual(high, { finalScore: 100, confidence: 100, estimatedSuccess: 100 })
    assert.equal(low.finalScore >= 0 && low.finalScore <= 100, true)
    assert.equal(low.confidence >= 0 && low.confidence <= 100, true)
    assert.equal(low.estimatedSuccess >= 0 && low.estimatedSuccess <= 100, true)
  })

  it('returns deterministic output with a fixed now', () => {
    const mission = europeMission()
    const gateways = discoverGateways(mission)
    const plans = withCarriers(generateStrategies(mission, gateways), ['LH', 'KL', 'AF'])
    const first = generateRecommendations(mission, plans, eligibleProfile('LH'), { gateways, now })
    const second = generateRecommendations(mission, plans, eligibleProfile('LH'), { gateways, now })

    assert.deepEqual(second, first)
  })

  it('avoids duplicate gateways when alternatives exist', () => {
    const mission = zedMission()
    const plans = [
      planFixture({ id: 'one', gateway: 'FRA', carrier: 'LH', score: 90 }),
      planFixture({ id: 'two', gateway: 'FRA', carrier: 'LH', score: 85 }),
      planFixture({ id: 'three', gateway: 'AMS', carrier: 'KL', score: 80 })
    ]
    const result = generateRecommendations(mission, plans, eligibleProfile('LH'), { now, signals: liveSignals })

    assert.deepEqual(result.recommendations.map((recommendation) => recommendation.plan.gateway), ['FRA', 'AMS'])
  })

  it('handles empty missions and incomplete profiles safely', () => {
    assert.deepEqual(generateRecommendations(createDefaultTripMission(), [], {}, { now }).recommendations, [])

    const result = generateRecommendations(zedMission(), [planFixture({ carrier: 'LH' })], { travelingParty: 'bad', zedAgreements: 'bad' } as any, { now })
    assert.equal(result.recommendations.length, 1)
    assert.equal(result.recommendations[0].wholePartyZedEligible, false)
  })

  it('does not fabricate carrier codes', () => {
    const mission = europeMission()
    const result = generateRecommendations(mission, [planFixture({ carrier: undefined })], eligibleProfile('LH'), { now })
    const recommendation = result.recommendations[0]

    assert.deepEqual(recommendation.eligibleZedAirlines, [])
    assert.equal(recommendation.wholePartyZedEligible, false)
    assert.ok(recommendation.dataWarnings.includes('Flight carrier codes unavailable; ZED eligibility cannot be carrier-confirmed.'))
  })

  it('classifies data quality honestly', () => {
    const mission = zedMission()
    const plan = planFixture({ carrier: 'LH' })
    const highResult = generateRecommendations(mission, [plan], eligibleProfile('LH'), { now, signals: liveSignals })
    const lowResult = generateRecommendations(mission, [planFixture({ carrier: undefined })], eligibleProfile('LH'), { now })

    assert.equal(recommendationDataQuality(mission, highResult.recommendations, { signals: liveSignals }), 'high')
    assert.equal(lowResult.dataQuality, 'low')
  })

  it('builds human-readable explanations', () => {
    const mission = zedMission()
    const result = generateRecommendations(mission, [planFixture({ carrier: 'LH' })], eligibleProfile('LH'), { now })
    const explanation = buildRecommendationExplanation(result.recommendations[0], mission)

    assert.ok(explanation.summary.includes('Plan A ranks 1'))
    assert.ok(explanation.summary.includes('planning score, not a statistical guarantee'))
    assert.ok(explanation.strengths.length > 0)
    assert.ok(explanation.weaknesses.length > 0)
    assert.ok(explanation.switchConditions.includes('switch if the connection becomes invalid'))
  })

  it('integrates mission, gateways, strategies, profile-specific ZED, and static data warnings', () => {
    const mission = {
      ...parseMissionFromPrompt('Family of 5 leaving SBP July 27. Anywhere in Europe. Eventually Montenegro. ZED and revenue.'),
      preferredDestinations: ['Montenegro', 'Albania', 'Greece'],
      allowZed: true,
      allowRevenue: true
    }
    const profile = normalizeTravelerProfile({
      travelingParty: [
        { id: 'employee', travelerType: 'employee' },
        { id: 'spouse', travelerType: 'spouse' },
        { id: 'child-1', travelerType: 'dependent_child' },
        { id: 'child-2', travelerType: 'dependent_child' },
        { id: 'child-3', travelerType: 'dependent_child' }
      ],
      zedAgreements: [
        agreement('LH', ['employee', 'spouse', 'dependent_child'], { verifiedAt: '2026-07-01T00:00:00Z' }),
        agreement('KL', ['employee', 'spouse'], { verifiedAt: '2025-12-01T00:00:00Z' }),
        agreement('AF', ['employee', 'spouse', 'dependent_child'], { verificationStatus: 'unverified', verifiedAt: '2026-07-01T00:00:00Z' })
      ]
    } as any)
    const gateways = discoverGateways(mission)
    const strategies = withCarriers(generateStrategies(mission, gateways), ['LH', 'KL', 'AF'])
    const result = generateRecommendations(mission, strategies, profile, { gateways, now })

    assert.equal(result.recommendations.length, 3)
    assert.ok(result.recommendations[0].explanation.summary)
    assert.ok(result.recommendations.every((recommendation) => recommendation.finalScore >= 0 && recommendation.finalScore <= 100))
    assert.equal(result.recommendations[0].wholePartyZedEligible, true)
    assert.deepEqual(result.recommendations[0].eligibleZedAirlines, ['LH'])
    assert.ok(result.recommendations.some((recommendation) => recommendation.risks.some((risk) => risk.code === 'stale-zed-verification' || risk.code === 'unverified-zed-agreement')))
    assert.ok(result.warnings.some((warning) => warning.includes('Live standby/load data is unavailable')))
    assert.equal(JSON.stringify(result).includes('5 seats'), false)
    assert.ok(recommendationResultAssumptions(result).includes('No live seat counts, clearance probabilities, or real-time availability are inferred.'))
  })

  it('weights recommendation confidence from normalized provider confidence', () => {
    const mission = zedMission()
    const plan = planFixture({ carrier: 'LH', score: 70, confidence: 70, estimatedSuccess: 70 })
    const weak = scoreRecommendation(mission, plan, eligibleProfile('LH'), {
      now,
      signals: { ...liveSignals, providerConfidence: 30 }
    })
    const strong = scoreRecommendation(mission, plan, eligibleProfile('LH'), {
      now,
      signals: { ...liveSignals, providerConfidence: 90 }
    })

    assert.ok(strong.confidence > weak.confidence)
    assert.ok(strong.finalScore > weak.finalScore)
    assert.ok(strong.estimatedSuccess > weak.estimatedSuccess)
  })
})

function zedMission(): TripMission {
  return {
    ...parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED and revenue backup'),
    departureDate: '2026-07-27',
    allowZed: true,
    allowRevenue: true
  }
}

function europeMission(): TripMission {
  return {
    ...parseMissionFromPrompt('Family of 5 leaving SBP July 27. Europe. Eventually Montenegro. ZED and revenue.'),
    departureDate: '2026-07-27',
    preferredDestinations: ['Montenegro', 'Albania', 'Greece'],
    flexibleGateway: true,
    allowZed: true,
    allowRevenue: true
  }
}

function leg(origin: string, destination: string, transportType: StrategyLeg['transportType'] = 'flight', carrier?: string): StrategyLeg {
  return { origin, destination, transportType, ...(transportType === 'flight' && carrier ? { carrier } : {}) }
}

function planFixture(options: { id?: string; gateway?: string; carrier?: string; score?: number; confidence?: number; estimatedSuccess?: number } = {}): ItineraryPlan {
  const gateway = options.gateway || 'FRA'
  return {
    id: options.id || `plan-${gateway}`,
    title: `${gateway} test plan`,
    gateway,
    score: options.score ?? 80,
    risk: 20,
    confidence: options.confidence ?? 80,
    estimatedSuccess: options.estimatedSuccess ?? 80,
    reasons: ['Highest gateway score', 'Multiple onward options'],
    backupTriggers: ['If first flight closes', 'If weather deteriorates', 'If gateway becomes unavailable'],
    legs: [
      leg('SFO', gateway, 'flight', options.carrier),
      leg(gateway, 'Europe', 'flight', options.carrier)
    ]
  }
}

function withCarriers(plans: ItineraryPlan[], carriers: string[]) {
  return plans.map((plan, index) => ({
    ...plan,
    legs: plan.legs.map((leg) => leg.transportType === 'flight' ? { ...leg, carrier: carriers[index] } : leg)
  }))
}

function agreement(airlineCode: string, eligibleTravelerTypes: ZedAgreementRecord['eligibleTravelerTypes'], overrides: Partial<ZedAgreementRecord> = {}): ZedAgreementRecord {
  return {
    id: `agreement-${airlineCode}`,
    airlineCode,
    airlineName: airlineCode,
    agreementType: 'ZED',
    bookingPlatform: 'myIDTravel',
    eligibleTravelerTypes,
    cabinAccess: ['Economy'],
    verificationStatus: 'employer_verified',
    verifiedAt: '2026-07-01T00:00:00Z',
    active: true,
    ...overrides
  }
}

function eligibleProfile(airlineCode: string, overrides: Partial<ZedAgreementRecord> = {}): TravelerProfileScaffold {
  return normalizeTravelerProfile({
    travelingParty: [
      { id: 'employee', travelerType: 'employee' },
      { id: 'spouse', travelerType: 'spouse' },
      { id: 'child', travelerType: 'dependent_child' }
    ],
    zedAgreements: [agreement(airlineCode, ['employee', 'spouse', 'dependent_child'], overrides)]
  } as any)
}

function singleStatus(score: number) {
  const result = generateRecommendations(
    { ...zedMission(), allowZed: false, allowRevenue: false },
    [planFixture({ carrier: undefined, score, confidence: 100, estimatedSuccess: 100 })],
    {},
    { now, signals: liveSignals }
  )
  return result.recommendations[0].status
}

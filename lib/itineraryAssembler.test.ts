import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type GatewayCandidate } from './gatewayDiscovery.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  assembleItineraries,
  itineraryAssemblyAssumptions,
  type BetaItinerary
} from './itineraryAssembler.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type ItineraryPlan, type StrategyLeg } from './itineraryStrategy.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { generateRecommendations } from './recommendationEngine.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { parseMissionFromPrompt, type TripMission } from './tripMission.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTravelerProfile, type TravelerProfileScaffold, type ZedAgreementRecord } from './travelerProfile.ts'

const now = new Date('2026-07-22T00:00:00Z')
const liveSignals = {
  liveLoadDataAvailable: true,
  operatingScheduleDataAvailable: true,
  weatherDataAvailable: true
}

describe('itinerary assembly engine', () => {
  it('assembles family-of-five itineraries without omitting segments', () => {
    const mission = familyMission()
    const plans = [
      planFixture({ gateway: 'FRA', carrier: 'LH' }),
      planFixture({ gateway: 'AMS', carrier: 'KL' }),
      planFixture({ gateway: 'CDG', carrier: 'AF' })
    ]
    const itineraries = assembleFromPlans(mission, plans, familyProfile(['LH', 'KL', 'AF']))

    assert.equal(itineraries.length, 3)
    assert.equal(itineraries[0].origin, 'SBP')
    assert.equal(itineraries[0].destination, 'Montenegro')
    assert.equal(itineraries[0].segments.length, plans[0].legs.length)
    assert.deepEqual(itineraries.map((itinerary) => itinerary.recommendationLabel), ['Plan A', 'Plan B', 'Plan C'])
  })

  it('assembles a solo traveler with a compact checkpoint set', () => {
    const itinerary = assembleFromPlans(soloMission(), [planFixture({ origin: 'SFO', gateway: 'NRT', destination: 'Tokyo', carrier: 'NH' })], profileWithAgreements(['NH']))[0]

    assert.equal(itinerary.origin, 'SFO')
    assert.equal(itinerary.destination, 'Tokyo')
    assert.ok(itinerary.recommendedCheckpoints.some((checkpoint) => checkpoint.includes('employee profile')))
  })

  it('uses employee profile context for ZED checkpoints', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH' })], profileWithAgreements(['LH'], 'Employee'))[0]

    assert.ok(itinerary.recommendedCheckpoints.some((checkpoint) => checkpoint.includes('employee profile')))
    assert.deepEqual(itinerary.requiredZedAirlines, ['LH'])
  })

  it('uses retiree profile context for ZED checkpoints', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH' })], profileWithAgreements(['LH'], 'Retiree'))[0]

    assert.ok(itinerary.recommendedCheckpoints.some((checkpoint) => checkpoint.includes('retiree profile')))
  })

  it('uses companion profile context for ZED checkpoints', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH' })], profileWithAgreements(['LH'], 'Companion'))[0]

    assert.ok(itinerary.recommendedCheckpoints.some((checkpoint) => checkpoint.includes('companion profile')))
  })

  it('supports mixed transport itineraries', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({
      carrier: 'LH',
      legs: [
        leg('SBP', 'FRA', 'flight', 'LH'),
        leg('FRA', 'Venice', 'rail'),
        leg('Venice', 'Montenegro', 'ferry')
      ]
    })])[0]

    assert.equal(itinerary.transportMode, 'mixed: flight + rail + ferry')
    assert.deepEqual(itinerary.transportModes, ['flight', 'rail', 'ferry'])
    assert.equal(itinerary.groundTransfers.length, 2)
  })

  it('marks overnight itineraries when the route framework carries overnight context', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({
      carrier: 'LH',
      legs: [
        leg('SBP', 'SFO', 'flight', 'UA'),
        leg('SFO', 'FRA', 'flight', 'LH', 'Overnight transatlantic framework; provider validation required')
      ]
    })], profileWithAgreements(['UA', 'LH']))[0]

    assert.equal(itinerary.overnight, true)
    assert.ok(itinerary.estimatedDuration.includes('possible overnight'))
  })

  it('carries multiple gateway recommendations forward', () => {
    const itineraries = assembleFromPlans(familyMission(), [
      planFixture({ gateway: 'FRA', carrier: 'LH' }),
      planFixture({ gateway: 'AMS', carrier: 'KL' }),
      planFixture({ gateway: 'CDG', carrier: 'AF' })
    ], profileWithAgreements(['LH', 'KL', 'AF']))

    assert.deepEqual([...itineraries.map((itinerary) => itinerary.gateway)].sort(), ['AMS', 'CDG', 'FRA'])
  })

  it('handles no gateway and no strategy without fabricating an itinerary', () => {
    const result = assembleItineraries({
      mission: familyMission(),
      travelerProfile: profileWithAgreements(['LH']),
      gateways: [],
      strategies: [],
      now
    })

    assert.deepEqual(result, [])
  })

  it('handles an empty strategy list without throwing', () => {
    assert.deepEqual(assembleItineraries({ mission: soloMission(), strategies: [], now }), [])
  })

  it('collapses duplicate equivalent routes', () => {
    const itineraries = assembleFromPlans(familyMission(), [
      planFixture({ id: 'one', gateway: 'FRA', carrier: 'LH', score: 90 }),
      planFixture({ id: 'two', gateway: 'FRA', carrier: 'LH', score: 84 })
    ], profileWithAgreements(['LH']))

    assert.equal(itineraries.length, 1)
    assert.equal(itineraries[0].gateway, 'FRA')
  })

  it('generates fallback options from alternate plans', () => {
    const itineraries = assembleFromPlans(familyMission(), [
      planFixture({ gateway: 'FRA', carrier: 'LH' }),
      planFixture({ gateway: 'AMS', carrier: 'KL' })
    ], profileWithAgreements(['LH', 'KL']))

    assert.equal(itineraries[0].fallbackOptions.length, 1)
    assert.ok(itineraries[0].fallbackOptions[0].summary.includes(itineraries[1].gateway))
  })

  it('generates fallback options from triggers when no alternate exists', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH' })], profileWithAgreements(['LH']))[0]

    assert.equal(itinerary.fallbackOptions[0].label, 'Fallback 1')
    assert.ok(itinerary.fallbackOptions[0].trigger.includes('If first flight closes'))
  })

  it('represents unknown schedule details honestly', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH' })], profileWithAgreements(['LH']))[0]
    const segment = itinerary.segments[0]

    assert.equal(segment.schedule.flightNumber, 'Unknown - not provided by route framework')
    assert.equal(segment.schedule.departureTime, 'Unknown - provider schedule validation required')
    assert.equal(segment.schedule.arrivalTime, 'Unknown - provider schedule validation required')
  })

  it('represents unknown loads honestly and never emits seat counts', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH' })], profileWithAgreements(['LH']))[0]

    assert.equal(itinerary.segments[0].schedule.seatCount, 'Unknown - live load data not attached')
    assert.equal(JSON.stringify(itinerary).includes('5 seats'), false)
  })

  it('calculates confidence from recommendation confidence and assembly uncertainty', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH', confidence: 90 })], profileWithAgreements(['LH']))[0]

    assert.equal(itinerary.confidence, 85)
  })

  it('generates a travel timeline for every segment', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({
      carrier: 'LH',
      legs: [
        leg('SBP', 'SFO', 'flight', 'UA'),
        leg('SFO', 'FRA', 'flight', 'LH'),
        leg('FRA', 'Montenegro', 'rail')
      ]
    })], profileWithAgreements(['UA', 'LH']))[0]

    assert.equal(itinerary.travelTimeline.length, 3)
    assert.deepEqual(itinerary.travelTimeline.map((item) => item.step), [1, 2, 3])
    assert.ok(itinerary.travelTimeline[2].scheduleStatus.includes('Surface schedule'))
  })

  it('generates short, detailed, and human-readable summaries', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH' })], profileWithAgreements(['LH']))[0]

    assert.ok(itinerary.shortSummary.includes('Plan A'))
    assert.ok(itinerary.detailedSummary.includes('Route framework'))
    assert.ok(itinerary.humanReadableSummary.includes(itinerary.shortSummary))
  })

  it('returns stable output for repeated runs', () => {
    const mission = familyMission()
    const plans = [planFixture({ carrier: 'LH' }), planFixture({ gateway: 'AMS', carrier: 'KL' })]
    const profile = profileWithAgreements(['LH', 'KL'])
    const first = assembleFromPlans(mission, plans, profile)
    const second = assembleFromPlans(mission, plans, profile)

    assert.deepEqual(second, first)
  })

  it('supports open-jaw and surface transfer gaps without hiding them', () => {
    const itinerary = assembleFromPlans(familyMission(), [planFixture({
      carrier: 'LH',
      legs: [
        leg('SBP', 'FRA', 'flight', 'LH'),
        leg('Dubrovnik', 'Montenegro', 'car')
      ]
    })], profileWithAgreements(['LH']))[0]

    assert.equal(itinerary.segments.length, 2)
    assert.ok(itinerary.groundTransfers.some((transfer) => transfer.from === 'FRA' && transfer.to === 'Dubrovnik'))
    assert.ok(itinerary.groundTransfers.some((transfer) => transfer.from === 'Dubrovnik' && transfer.to === 'Montenegro'))
  })

  it('summarizes assembly assumptions', () => {
    const assumptions = itineraryAssemblyAssumptions(assembleFromPlans(familyMission(), [planFixture({ carrier: 'LH' })], profileWithAgreements(['LH'])))

    assert.ok(assumptions.includes('Assembled itineraries: 1'))
    assert.ok(assumptions.some((assumption) => assumption.includes('Flight numbers')))
  })
})

function assembleFromPlans(
  mission: TripMission,
  plans: ItineraryPlan[],
  profile: Partial<TravelerProfileScaffold> = profileWithAgreements(['LH'])
): BetaItinerary[] {
  const result = generateRecommendations(mission, plans, profile, { gateways: gatewaysForPlans(plans), signals: liveSignals, now })
  return assembleItineraries({
    recommendationResult: result,
    mission,
    travelerProfile: profile,
    gateways: gatewaysForPlans(plans),
    now
  })
}

function familyMission(): TripMission {
  return {
    ...parseMissionFromPrompt('Family of 5 leaving SBP July 27. Europe. Eventually Montenegro. ZED and revenue.'),
    departureDate: '2026-07-27',
    preferredDestinations: ['Montenegro', 'Albania'],
    flexibleGateway: true,
    allowZed: true,
    allowRevenue: true
  }
}

function soloMission(): TripMission {
  return {
    ...parseMissionFromPrompt('Solo from SFO July 27 to Tokyo with ZED.'),
    departureDate: '2026-07-27',
    preferredDestinations: ['Tokyo'],
    allowZed: true,
    allowRevenue: false
  }
}

function leg(
  origin: string,
  destination: string,
  transportType: StrategyLeg['transportType'] = 'flight',
  carrier?: string,
  notes?: string
): StrategyLeg {
  return {
    origin,
    destination,
    transportType,
    ...(carrier ? { carrier } : {}),
    ...(notes ? { notes } : {})
  }
}

function planFixture(options: {
  id?: string
  origin?: string
  gateway?: string
  destination?: string
  carrier?: string
  score?: number
  confidence?: number
  estimatedSuccess?: number
  legs?: StrategyLeg[]
} = {}): ItineraryPlan {
  const gateway = options.gateway || 'FRA'
  const origin = options.origin || 'SBP'
  const destination = options.destination || 'Montenegro'
  const legs = options.legs || [
    leg(origin, gateway, 'flight', options.carrier),
    leg(gateway, destination, 'flight', options.carrier)
  ]
  return {
    id: options.id || `plan-${gateway}-${origin}-${destination}`,
    title: `${gateway} assembly test plan`,
    gateway,
    score: options.score ?? 82,
    risk: 18,
    confidence: options.confidence ?? 86,
    estimatedSuccess: options.estimatedSuccess ?? 84,
    reasons: ['Highest gateway score', 'Multiple onward options'],
    backupTriggers: ['If first flight closes', 'If weather deteriorates', 'If gateway becomes unavailable'],
    legs
  }
}

function gatewaysForPlans(plans: ItineraryPlan[]): GatewayCandidate[] {
  return plans.map((plan) => ({
    airportCode: plan.gateway,
    city: plan.gateway,
    country: 'Test',
    region: 'Test',
    score: 90,
    reasons: [],
    onwardConnectivityScore: 90,
    zedCoverageScore: 90,
    historicalReliabilityScore: 90
  }))
}

function agreement(airlineCode: string, eligibleTravelerTypes: ZedAgreementRecord['eligibleTravelerTypes']): ZedAgreementRecord {
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
    active: true
  }
}

function profileWithAgreements(airlineCodes: string[], travelerType: TravelerProfileScaffold['travelerType'] = 'Employee') {
  return normalizeTravelerProfile({
    travelerType,
    travelingParty: [{ id: 'employee', travelerType: 'employee' }],
    zedAgreements: airlineCodes.map((airlineCode) => agreement(airlineCode, ['employee', 'spouse', 'dependent_child', 'companion']))
  } as Partial<TravelerProfileScaffold>)
}

function familyProfile(airlineCodes: string[]) {
  return normalizeTravelerProfile({
    travelingParty: [
      { id: 'employee', travelerType: 'employee' },
      { id: 'spouse', travelerType: 'spouse' },
      { id: 'child-1', travelerType: 'dependent_child' },
      { id: 'child-2', travelerType: 'dependent_child' },
      { id: 'child-3', travelerType: 'dependent_child' }
    ],
    zedAgreements: airlineCodes.map((airlineCode) => agreement(airlineCode, ['employee', 'spouse', 'dependent_child']))
  } as Partial<TravelerProfileScaffold>)
}

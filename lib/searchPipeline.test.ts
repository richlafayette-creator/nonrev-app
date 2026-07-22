import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type GatewayCandidate } from './gatewayDiscovery.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type BetaItinerary } from './itineraryAssembler.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type ItineraryPlan, type StrategyLeg } from './itineraryStrategy.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  normalizeSearchMission,
  runSearchPipeline,
  type NaturalSearchObject,
  type SearchPipelineAdapters
} from './searchPipeline.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTravelerProfile, type TravelerProfileScaffold } from './travelerProfile.ts'

const now = new Date('2026-07-22T00:00:00Z')

describe('search pipeline orchestrator', () => {
  it('runs the full pipeline and returns ranked Plan A, Plan B, and Plan C recommendations', () => {
    const result = runSearchPipeline(europeRequest(), { now })

    assert.equal(result.itineraries.length, 3)
    assert.deepEqual(result.recommendations.ranked.map((recommendation) => recommendation.label), ['Plan A', 'Plan B', 'Plan C'])
    assert.equal(result.recommendations.planA?.rank, 1)
    assert.ok(result.summary.includes('ranked itinerary framework'))
  })

  it('continues with warnings when gateway discovery fails', () => {
    const result = runSearchPipeline(europeRequest(), {
      now,
      adapters: { discoverGateways: () => { throw new Error('gateway provider unavailable') } }
    })

    assert.deepEqual(result.gateways, [])
    assert.deepEqual(result.itineraries, [])
    assert.ok(result.warnings.some((warning) => warning.includes('gateway discovery failed: gateway provider unavailable')))
    assert.equal(result.pipelineTrace.find((item) => item.stage === 'gateway_discovery')?.status, 'failed')
  })

  it('continues with warnings when recommendation generation fails', () => {
    const result = runSearchPipeline(europeRequest(), {
      now,
      adapters: { generateRecommendations: () => { throw new Error('ranking offline') } }
    })

    assert.deepEqual(result.recommendations.ranked, [])
    assert.deepEqual(result.itineraries, [])
    assert.ok(result.warnings.some((warning) => warning.includes('recommendation engine failed: ranking offline')))
  })

  it('applies default profile assumptions when the profile is missing', () => {
    const result = runSearchPipeline({ ...europeRequest(), travelerProfile: undefined }, { now })

    assert.equal(result.travelerProfile.travelerType, 'Employee')
    assert.ok(result.warnings.includes('Traveler profile missing; default employee profile assumptions applied.'))
  })

  it('preserves supplied employee traveler profile context', () => {
    const result = runSearchPipeline({ ...europeRequest(), travelerProfile: profile('Employee') }, { now })

    assert.equal(result.travelerProfile.travelerType, 'Employee')
  })

  it('supports retiree traveler profiles', () => {
    const result = runSearchPipeline({ ...europeRequest(), travelerProfile: profile('Retiree') }, { now })

    assert.equal(result.travelerProfile.travelerType, 'Retiree')
    assert.ok(result.assumptions.includes('Traveler type: Retiree'))
  })

  it('supports buddy pass traveler profiles', () => {
    const result = runSearchPipeline({ ...europeRequest(), travelerProfile: profile('Buddy Pass') }, { now })

    assert.equal(result.travelerProfile.travelerType, 'Buddy Pass')
  })

  it('represents unknown schedules without fabricating flight numbers', () => {
    const result = runSearchPipeline(europeRequest(), { now })
    const segment = result.itineraries[0].segments[0]

    assert.equal(segment.schedule.flightNumber, 'Unknown - not provided by route framework')
    assert.equal(segment.schedule.departureTime, 'Unknown - provider schedule validation required')
    assert.ok(result.unknownScheduleIndicators.includes('Unknown - provider schedule validation required'))
    assert.equal(/\b[A-Z]{2}\d{2,4}\b/.test(JSON.stringify(result)), false)
  })

  it('represents unknown loads without fabricating seats', () => {
    const result = runSearchPipeline(europeRequest(), { now })

    assert.equal(result.itineraries[0].segments[0].schedule.seatCount, 'Unknown - live load data not attached')
    assert.ok(result.missingData.some((item) => item.includes('live loads')))
    assert.equal(JSON.stringify(result).includes('5 seats'), false)
  })

  it('deduplicates duplicate assembled itineraries', () => {
    const duplicate = betaItineraryFixture()
    const result = runSearchPipeline(europeRequest(), {
      now,
      adapters: {
        discoverGateways: () => [gateway('FRA')],
        generateStrategies: () => [plan('FRA')],
        generateRecommendations: (_mission, _strategies, _profile, options) => recommendationResultFixture(options.now || now),
        assembleItineraries: () => [duplicate, duplicate]
      }
    })

    assert.equal(result.itineraries.length, 1)
  })

  it('calculates deterministic confidence from recommendations, assembly uncertainty, and missing data', () => {
    const result = runSearchPipeline(europeRequest(), { now })

    assert.equal(result.confidence.score, 31)
    assert.equal(result.confidence.label, 'low')
    assert.ok(result.confidence.reason.includes('3 assembled itinerary frameworks'))
  })

  it('creates fallbacks from alternate recommendations', () => {
    const result = runSearchPipeline(europeRequest(), { now })

    assert.ok(result.fallbacks.length > 0)
    assert.ok(result.fallbacks[0].summary.includes('Plan'))
  })

  it('keeps ranking stable across repeated runs', () => {
    const first = runSearchPipeline(europeRequest(), { now })
    const second = runSearchPipeline(europeRequest(), { now })

    assert.deepEqual(second.recommendations.ranked.map((recommendation) => recommendation.gateway), first.recommendations.ranked.map((recommendation) => recommendation.gateway))
    assert.deepEqual(second.itineraries.map((itinerary) => itinerary.id), first.itineraries.map((itinerary) => itinerary.id))
  })

  it('supports large families and carries party-size risk', () => {
    const result = runSearchPipeline({ ...europeRequest(), travelerCount: 7 }, { now })

    assert.equal(result.mission.travelers, 7)
    assert.ok(result.recommendations.ranked.some((recommendation) => recommendation.risks.some((risk) => risk.includes('Large traveling party'))))
  })

  it('supports solo travel requests', () => {
    const result = runSearchPipeline({
      origin: 'SFO',
      destination: 'Tokyo',
      departureDate: '2026-07-27',
      travelerCount: 1,
      allowZed: true,
      travelerProfile: profile('Employee')
    }, { now })

    assert.equal(result.mission.travelers, 1)
    assert.equal(result.tripType, 'one_way')
    assert.ok(result.itineraries.length > 0)
  })

  it('supports round trips by exposing outbound and return journey frameworks', () => {
    const result = runSearchPipeline({ ...europeRequest(), tripType: 'round_trip', returnDate: '2026-08-04' }, { now })
    const itinerary = result.itineraries[0]

    assert.equal(result.tripType, 'round_trip')
    assert.equal(itinerary.journeys.length, 2)
    assert.equal(itinerary.journeys[1].direction, 'return')
    assert.equal(itinerary.journeys[1].date, '2026-08-04')
    assert.equal(itinerary.journeys[1].destination, 'SBP')
  })

  it('supports open-jaw return endpoints without hiding missing schedule data', () => {
    const result = runSearchPipeline({
      ...europeRequest(),
      tripType: 'open_jaw',
      returnDate: '2026-08-04',
      returnOrigin: 'DUB',
      returnDestination: 'SFO'
    }, { now })
    const returnJourney = result.itineraries[0].journeys[1]

    assert.equal(result.tripType, 'open_jaw')
    assert.equal(returnJourney.origin, 'DUB')
    assert.equal(returnJourney.destination, 'SFO')
    assert.ok(result.missingData.includes('return operating schedules'))
  })

  it('supports mixed transport frameworks', () => {
    const result = runSearchPipeline({ ...europeRequest(), allowRail: true }, { now })

    assert.ok(result.itineraries.some((itinerary) => itinerary.segments.some((segment) => segment.mode === 'rail')))
    assert.ok(result.recommendations.ranked.some((recommendation) => recommendation.risks.some((risk) => risk.includes('Mixed transportation complexity'))))
  })

  it('returns a useful partial result when no gateways are available', () => {
    const result = runSearchPipeline({
      origin: 'SFO',
      destinationRegion: 'Caribbean',
      preferredDestinations: ['Aruba'],
      departureDate: '2026-07-27',
      travelerProfile: profile('Employee')
    }, { now })

    assert.deepEqual(result.gateways, [])
    assert.deepEqual(result.itineraries, [])
    assert.ok(result.warnings.includes('No gateway candidates were discovered for the normalized mission.'))
    assert.ok(result.summary.includes('No complete itinerary framework assembled'))
  })

  it('reports provider unavailable signals as non-fatal uncertainty', () => {
    const result = runSearchPipeline(europeRequest(), { now })

    assert.ok(result.warnings.some((warning) => warning.includes('Live standby/load data is unavailable')))
    assert.ok(result.warnings.some((warning) => warning.includes('Live operating schedule data is unavailable')))
    assert.ok(result.warnings.some((warning) => warning.includes('Weather data is unavailable')))
  })

  it('generates a timeline for every displayed segment', () => {
    const itinerary = runSearchPipeline(europeRequest(), { now }).itineraries[0]

    assert.equal(itinerary.timeline.length, itinerary.segments.length)
    assert.deepEqual(itinerary.timeline.map((item) => item.step), [1, 2])
  })

  it('generates compact and detailed summaries', () => {
    const result = runSearchPipeline(europeRequest(), { now })
    const itinerary = result.itineraries[0]

    assert.ok(result.summary.includes('Best option'))
    assert.ok(itinerary.summary.includes('Plan A'))
    assert.ok(itinerary.detailedSummary.includes('Route framework'))
  })

  it('collects stage warnings instead of throwing exceptions', () => {
    const result = runSearchPipeline(europeRequest(), {
      now,
      adapters: { assembleItineraries: () => { throw new Error('assembler down') } }
    })

    assert.deepEqual(result.itineraries, [])
    assert.ok(result.warnings.some((warning) => warning.includes('itinerary assembly failed: assembler down')))
    assert.equal(result.pipelineTrace.find((item) => item.stage === 'itinerary_assembly')?.status, 'failed')
  })

  it('normalizes natural search objects into trip missions', () => {
    const mission = normalizeSearchMission({
      origin: ['sfo', 'oak'],
      destination: 'Europe',
      departureDate: '2026-07-27',
      travelerCount: 4,
      allowRevenue: true
    })

    assert.deepEqual(mission.originAirports, ['SFO', 'OAK'])
    assert.equal(mission.destinationRegion, 'Europe')
    assert.equal(mission.travelers, 4)
    assert.equal(mission.allowRevenue, true)
  })

  it('continues when strategy generation returns partial data', () => {
    const result = runSearchPipeline(europeRequest(), {
      now,
      adapters: {
        discoverGateways: () => [gateway('FRA'), gateway('AMS')],
        generateStrategies: () => [plan('FRA')]
      }
    })

    assert.equal(result.strategies.length, 1)
    assert.equal(result.recommendations.ranked.length, 1)
    assert.equal(result.itineraries.length, 1)
  })

  it('continues when recommendation generation returns no recommendations', () => {
    const result = runSearchPipeline(europeRequest(), {
      now,
      adapters: {
        generateRecommendations: (_mission, _strategies, _profile, options) => ({
          missionSummary: [],
          recommendations: [],
          generatedAt: (options.now || now).toISOString(),
          dataQuality: 'low',
          warnings: ['Recommendation provider returned no rows.']
        })
      }
    })

    assert.deepEqual(result.recommendations.ranked, [])
    assert.ok(result.warnings.includes('Recommendation provider returned no rows.'))
    assert.ok(result.warnings.includes('No recommendations were produced from the available strategy data.'))
  })

  it('does not omit generated route framework legs from displayed segments', () => {
    const result = runSearchPipeline(europeRequest(), {
      now,
      adapters: {
        discoverGateways: () => [gateway('FRA')],
        generateStrategies: () => [plan('FRA', [
          leg('SBP', 'SFO', 'flight'),
          leg('SFO', 'FRA', 'flight'),
          leg('FRA', 'Montenegro', 'rail')
        ])]
      }
    })

    assert.equal(result.strategies[0].legs.length, 3)
    assert.equal(result.itineraries[0].segments.length, 3)
    assert.deepEqual(result.itineraries[0].segments.map((segment) => `${segment.origin}-${segment.destination}`), ['SBP-SFO', 'SFO-FRA', 'FRA-Montenegro'])
  })

  it('regresses against stale live-availability claims', () => {
    const result = runSearchPipeline(europeRequest(), { now })
    const serialized = JSON.stringify(result).toLowerCase()

    assert.equal(serialized.includes('live availability confirmed'), false)
    assert.equal(serialized.includes('current live availability'), false)
    assert.ok(result.missingData.some((item) => item.includes('live loads')))
  })
})

function europeRequest(): NaturalSearchObject {
  return {
    origin: 'SBP',
    destination: 'Europe',
    preferredDestinations: ['Montenegro'],
    departureDate: '2026-07-27',
    travelerCount: 5,
    flexibleGateway: true,
    allowZed: true,
    allowRevenue: true,
    travelerProfile: profile('Employee')
  }
}

function profile(travelerType: TravelerProfileScaffold['travelerType']) {
  return normalizeTravelerProfile({
    travelerType,
    travelingParty: [
      { id: 'employee', travelerType: travelerType === 'Buddy Pass' ? 'buddy_pass' : 'employee' }
    ],
    zedAgreements: []
  } as Partial<TravelerProfileScaffold>)
}

function gateway(airportCode: string): GatewayCandidate {
  return {
    airportCode,
    city: airportCode,
    country: 'Test',
    region: 'Europe',
    score: airportCode === 'FRA' ? 92 : 88,
    reasons: ['Test gateway'],
    onwardConnectivityScore: 90,
    zedCoverageScore: 86,
    historicalReliabilityScore: 91
  }
}

function leg(origin: string, destination: string, transportType: StrategyLeg['transportType'] = 'flight'): StrategyLeg {
  return {
    origin,
    destination,
    transportType,
    notes: 'Provider validation required'
  }
}

function plan(gatewayCode: string, legs: StrategyLeg[] = [leg('SBP', gatewayCode), leg(gatewayCode, 'Montenegro')]): ItineraryPlan {
  return {
    id: `plan-${gatewayCode.toLowerCase()}`,
    title: `Plan via ${gatewayCode}`,
    gateway: gatewayCode,
    score: 82,
    risk: 18,
    confidence: 84,
    estimatedSuccess: 80,
    reasons: ['Highest gateway score'],
    backupTriggers: ['If first flight closes', 'If weather deteriorates'],
    legs
  }
}

function recommendationResultFixture(generatedAt: Date) {
  return {
    missionSummary: [],
    generatedAt: generatedAt.toISOString(),
    dataQuality: 'low' as const,
    warnings: ['Fixture recommendation warnings.'],
    recommendations: [{
      id: 'recommendation-1-fra',
      rank: 1,
      label: 'Plan A' as const,
      status: 'viable' as const,
      plan: plan('FRA'),
      finalScore: 80,
      confidence: 76,
      estimatedSuccess: 78,
      wholePartyZedEligible: false,
      eligibleZedAirlines: [],
      risks: [],
      explanation: {
        summary: 'Plan A fixture summary.',
        strengths: ['usable static strategy framework'],
        weaknesses: ['live provider signals are not attached'],
        switchConditions: ['switch if the connection becomes invalid']
      },
      dataWarnings: ['Live standby/load data is unavailable for this static recommendation.']
    }]
  }
}

function betaItineraryFixture(): BetaItinerary {
  const segment = {
    id: 'fixture-segment-1',
    origin: 'SBP',
    destination: 'FRA',
    mode: 'flight' as const,
    schedule: {
      flightNumber: 'Unknown - not provided by route framework' as const,
      departureTime: 'Unknown - provider schedule validation required' as const,
      arrivalTime: 'Unknown - provider schedule validation required' as const,
      seatCount: 'Unknown - live load data not attached' as const
    },
    estimatedDuration: 'Unknown - provider schedule validation required',
    notes: ['Flight number, departure time, arrival time, and live loads are not attached.']
  }

  return {
    id: 'itinerary-fixture',
    origin: 'SBP',
    gateway: 'FRA',
    destination: 'FRA',
    segments: [segment],
    transportMode: 'flight',
    transportModes: ['flight'],
    estimatedDuration: 'Unknown - provider schedule validation required across 1 segment',
    connectionCount: 0,
    overnight: false,
    groundTransfers: [],
    requiredZedAirlines: [],
    revenueAirlines: [],
    riskSummary: {
      severity: 'low',
      items: ['No high-specificity risks attached to this static framework.'],
      dataWarnings: ['Live standby/load data is unavailable for this static recommendation.']
    },
    weatherSummaryPlaceholder: 'Weather not evaluated yet; attach weather intelligence before travel decisions.',
    confidence: 70,
    recommendationRank: 1,
    recommendationLabel: 'Plan A',
    shortSummary: 'Plan A: SBP to FRA via FRA using flight.',
    detailedSummary: 'Route framework: SBP -> FRA. Schedule, loads, flight numbers, and weather require provider validation.',
    travelTimeline: [{
      step: 1,
      title: 'SBP to FRA',
      description: 'flight; exact schedule is unknown.',
      scheduleStatus: 'Flight number, departure time, arrival time, and load data unknown.'
    }],
    recommendedCheckpoints: ['Verify operating schedules.'],
    fallbackOptions: [{ label: 'Fallback 1', summary: 'If first flight closes', trigger: 'If first flight closes' }],
    humanReadableSummary: 'Plan A fixture.'
  }
}

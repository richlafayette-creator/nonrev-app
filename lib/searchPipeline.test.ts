import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type GatewayCandidate } from './gatewayDiscovery.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type BetaItinerary, type BetaItinerarySegment } from './itineraryAssembler.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type ItineraryPlan, type StrategyLeg } from './itineraryStrategy.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  normalizeSearchMission,
  runSearchPipeline,
  runSearchPipelineWithExecution,
  type NaturalSearchObject,
  type SearchPipelineAdapters
} from './searchPipeline.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type SearchExecutionProvider, type SearchExecutionResult, type SearchExecutionSegment } from './searchExecutionEngine.ts'
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

  it('composes a valid two-leg same-airport provider connection into the matching framework', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z'))
      ])
    })
    const framework = frameworkItinerary(result)

    assert.deepEqual(framework?.segments.map((segment) => segment.schedule.flightNumber), ['AA100', 'JL1'])
    assert.deepEqual(framework?.providerAttribution.map((item) => item.providerId), ['test-provider', 'nonrevy-itinerary-composer'])
  })

  it('rejects composed connections when the next segment departs before the first arrives', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T11:30:00Z', '2026-07-28T02:00:00Z'))
      ])
    })

    assert.equal(frameworkItinerary(result)?.segments[1].schedule.flightNumber, 'Unknown - not provided by route framework')
  })

  it('rejects composed connections below the conservative minimum connection threshold', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T12:45:00Z', '2026-07-28T02:00:00Z'))
      ])
    })

    assert.equal(frameworkItinerary(result)?.segments[1].schedule.departureTime, 'Unknown - provider schedule validation required')
  })

  it('keeps connection validation based on absolute UTC timestamps when airport time zones are present', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T12:30:00Z', '2026-07-28T02:00:00Z'))
      ])
    })

    assert.equal(frameworkItinerary(result)?.segments[1].schedule.flightNumber, 'Unknown - not provided by route framework')
  })


  it('allows overnight provider connections when timestamps are coherent', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T20:00:00Z', '2026-07-27T23:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-28T01:00:00Z', '2026-07-28T13:00:00Z'))
      ])
    })

    assert.equal(frameworkItinerary(result)?.segments[1].schedule.departureTime, '2026-07-28T01:00:00Z')
  })

  it('does not reuse the same provider segment twice in a composed itinerary', () => {
    const reusable = executionItinerary(executionSegment('SFO', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z'))
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('SFO', 'SFO'),
        frameworkSegment('SFO', 'SFO')
      ]),
      executionResult: executionResult([reusable])
    })

    assert.equal(frameworkItinerary(result)?.segments[0].schedule.flightNumber, 'Unknown - not provided by route framework')
  })

  it('leaves a framework unresolved when provider candidates cannot form the requested route', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z'))
      ])
    })

    assert.deepEqual(frameworkItinerary(result)?.segments.map((segment) => segment.schedule.flightNumber), [
      'Unknown - not provided by route framework',
      'Unknown - not provided by route framework'
    ])
  })

  it('preserves direct provider itinerary candidates while composing framework-shaped alternatives', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z')),
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z'))
      ])
    })

    assert.ok(result.itineraries.some((itinerary) => itinerary.segments.length === 1 && itinerary.segments[0].schedule.flightNumber === 'AA169'))
    assert.deepEqual(frameworkItinerary(result)?.segments.map((segment) => segment.schedule.flightNumber), ['AA100', 'JL1'])
  })

  it('retains provider-returned flight numbers and times on composed legs', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z'))
      ])
    })

    assert.deepEqual(frameworkItinerary(result)?.segments.map((segment) => ({
      flightNumber: segment.schedule.flightNumber,
      departureTime: segment.schedule.departureTime,
      arrivalTime: segment.schedule.arrivalTime
    })), [
      { flightNumber: 'AA100', departureTime: '2026-07-27T10:00:00Z', arrivalTime: '2026-07-27T12:00:00Z' },
      { flightNumber: 'JL1', departureTime: '2026-07-27T14:00:00Z', arrivalTime: '2026-07-28T02:00:00Z' }
    ])
  })

  it('keeps framework-only routes unresolved when no provider schedules validate them', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([])
    })

    assert.equal(frameworkItinerary(result)?.segments[0].schedule.flightNumber, 'Unknown - not provided by route framework')
  })

  it('does not silently treat airport-transfer gaps as same-airport connections', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'NRT'),
        frameworkSegment('HND', 'SFO')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'NRT', 'JL61', '2026-07-27T10:00:00Z', '2026-07-27T22:00:00Z')),
        executionItinerary(executionSegment('HND', 'SFO', 'JL2', '2026-07-28T01:00:00Z', '2026-07-28T12:00:00Z'))
      ])
    })

    assert.equal(frameworkItinerary(result)?.segments[1].schedule.flightNumber, 'Unknown - not provided by route framework')
  })

  it('searches the direct market first before bounded connection expansion', async () => {
    const calls: string[][] = []
    const result = await runSearchPipelineWithExecution(compositionRequest(), {
      now,
      adapters: connectionCoverageAdapters(['SFO']),
      executionProviders: [connectionExecutionProvider(calls, {
        'LAX-HND': [executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z')],
        'LAX-SFO': [executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')],
        'SFO-HND': [executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z')]
      })]
    })

    assert.deepEqual(calls, [['LAX-HND']])
    assert.ok(result.itineraries.some((itinerary) => itinerary.segments.length === 1 && itinerary.segments[0].schedule.flightNumber === 'AA169'))
  })

  it('expands to a valid same-airport connection market when direct coverage is insufficient', async () => {
    const calls: string[][] = []
    const result = await runSearchPipelineWithExecution(compositionRequest(), {
      now,
      adapters: connectionCoverageAdapters(['SFO']),
      executionProviders: [connectionExecutionProvider(calls, {
        'LAX-SFO': [executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')],
        'SFO-HND': [executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z')]
      })]
    })

    assert.deepEqual(calls, [['LAX-HND'], ['LAX-*'], ['LAX-SFO', 'SFO-HND']])
    assert.ok(result.itineraries.some((itinerary) =>
      itinerary.segments.map((segment) => segment.schedule.flightNumber).join('+') === 'AA100+JL1'
    ))
  })

  it('bounds connection hubs and provider route-pair fanout', async () => {
    const calls: string[][] = []
    await runSearchPipelineWithExecution(compositionRequest(), {
      now,
      adapters: connectionCoverageAdapters(['SFO', 'SEA', 'DFW', 'ORD']),
      executionProviders: [connectionExecutionProvider(calls, {})],
      maxConnectionHubsSearched: 2,
      maxProviderRoutePairs: 5
    })

    assert.deepEqual(calls, [['LAX-HND'], ['LAX-*'], ['LAX-SFO', 'SFO-HND', 'LAX-SEA', 'SEA-HND']])
  })

  it('does not exceed the configured provider route-pair cap during expansion', async () => {
    const calls: string[][] = []
    await runSearchPipelineWithExecution(compositionRequest(), {
      now,
      adapters: connectionCoverageAdapters(['SFO', 'SEA']),
      executionProviders: [connectionExecutionProvider(calls, {})],
      maxConnectionHubsSearched: 2,
      maxProviderRoutePairs: 3
    })

    assert.deepEqual(calls, [['LAX-HND'], ['LAX-*'], ['LAX-SFO', 'SFO-HND']])
  })

  it('keeps direct options visible when connection options are also recovered', async () => {
    const calls: string[][] = []
    const result = await runSearchPipelineWithExecution(compositionRequest(), {
      now,
      adapters: connectionCoverageAdapters(['SFO']),
      executionProviders: [connectionExecutionProvider(calls, {
        'LAX-HND': [executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z')],
        'LAX-SFO': [executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')],
        'SFO-HND': [executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z')]
      })],
      connectionSearchMinimumDirectItineraries: 2
    })

    assert.deepEqual(calls, [['LAX-HND'], ['LAX-*'], ['LAX-SFO', 'SFO-HND']])
    assert.ok(result.itineraries.some((itinerary) => itinerary.segments.length === 1 && itinerary.segments[0].schedule.flightNumber === 'AA169'))
    assert.ok(result.itineraries.some((itinerary) => itinerary.segments.map((segment) => segment.schedule.flightNumber).join('+') === 'AA100+JL1'))
  })

  it('uses origin-first departure discovery to compose a small-origin two-hop itinerary', async () => {
    const calls: string[][] = []
    const result = await runSearchPipelineWithExecution(airportPairRequest('SBP', 'FCO'), {
      now,
      adapters: airportConnectionCoverageAdapters('SBP', 'FCO', ['SFO']),
      executionProviders: [connectionExecutionProvider(calls, {
        'SBP-*': [executionSegment('SBP', 'SFO', 'UA500', '2026-07-27T14:00:00Z', '2026-07-27T15:20:00Z')],
        'SFO-FCO': [executionSegment('SFO', 'FCO', 'UA40', '2026-07-27T18:00:00Z', '2026-07-28T08:30:00Z')]
      })]
    })

    assert.deepEqual(calls, [['SBP-FCO'], ['SBP-*'], ['SBP-SFO', 'SFO-FCO']])
    assert.ok(result.itineraries.some((itinerary) =>
      itinerary.segments.map((segment) => `${segment.origin}-${segment.destination}-${segment.schedule.flightNumber}`).join('|') ===
      'SBP-SFO-UA500|SFO-FCO-UA40'
    ))
  })

  it('checks primary destinations across first-hop hubs before secondary airport candidates', async () => {
    const calls: string[][] = []
    const request = {
      ...airportPairRequest('SBP', 'FCO'),
      preferredDestinations: ['FCO', 'CIA']
    }
    const result = await runSearchPipelineWithExecution(request, {
      now,
      adapters: airportConnectionCoverageAdapters('SBP', 'FCO', ['FRA', 'AMS']),
      executionProviders: [connectionExecutionProvider(calls, {
        'SBP-*': [
          executionSegment('SBP', 'PHX', 'AA6400', '2026-07-27T12:00:00Z', '2026-07-27T13:40:00Z'),
          executionSegment('SBP', 'PHX', 'AA6402', '2026-07-27T14:00:00Z', '2026-07-27T15:40:00Z'),
          executionSegment('SBP', 'DEN', 'UA2329', '2026-07-27T12:30:00Z', '2026-07-27T15:20:00Z')
        ],
        'DEN-FCO': [executionSegment('DEN', 'FCO', 'UA177', '2026-07-27T23:45:00Z', '2026-07-28T10:00:00Z')]
      })],
      maxConnectionHubsSearched: 2,
      maxOriginFirstHubsSearched: 2,
      maxProviderRoutePairs: 9
    })

    assert.deepEqual(calls, [
      ['SBP-FCO', 'SBP-CIA'],
      ['SBP-*'],
      ['SBP-FRA', 'FRA-FCO', 'SBP-AMS', 'AMS-FCO'],
      ['PHX-FCO', 'DEN-FCO']
    ])
    assert.ok(result.itineraries.some((itinerary) =>
      itinerary.segments.map((segment) => `${segment.origin}-${segment.destination}-${segment.schedule.flightNumber}`).join('|') ===
      'SBP-DEN-UA2329|DEN-FCO-UA177'
    ))
  })

  it('uses the same origin-first discovery path for another regional origin', async () => {
    const calls: string[][] = []
    const result = await runSearchPipelineWithExecution(airportPairRequest('MRY', 'CDG'), {
      now,
      adapters: airportConnectionCoverageAdapters('MRY', 'CDG', ['SFO']),
      executionProviders: [connectionExecutionProvider(calls, {
        'MRY-*': [executionSegment('MRY', 'SFO', 'UA5678', '2026-07-27T13:30:00Z', '2026-07-27T14:20:00Z')],
        'SFO-CDG': [executionSegment('SFO', 'CDG', 'AF83', '2026-07-27T17:00:00Z', '2026-07-28T07:10:00Z')]
      })]
    })

    assert.deepEqual(calls, [['MRY-CDG'], ['MRY-*'], ['MRY-SFO', 'SFO-CDG']])
    assert.ok(result.itineraries.some((itinerary) =>
      itinerary.segments.map((segment) => `${segment.origin}-${segment.destination}`).join('>') === 'MRY-SFO>SFO-CDG'
    ))
  })

  it('composes a bounded three-leg origin-first itinerary through provider-supported hubs', async () => {
    const calls: string[][] = []
    const result = await runSearchPipelineWithExecution(airportPairRequest('SBP', 'FCO'), {
      now,
      adapters: airportConnectionCoverageAdapters('SBP', 'FCO', ['FRA']),
      executionProviders: [connectionExecutionProvider(calls, {
        'SBP-*': [executionSegment('SBP', 'SFO', 'UA523', '2026-07-27T14:00:00Z', '2026-07-27T15:20:00Z')],
        'SFO-FRA': [executionSegment('SFO', 'FRA', 'LH455', '2026-07-27T18:10:00Z', '2026-07-28T08:45:00Z')],
        'FRA-FCO': [executionSegment('FRA', 'FCO', 'LH232', '2026-07-28T11:00:00Z', '2026-07-28T12:45:00Z')]
      })]
    })

    assert.deepEqual(calls, [['SBP-FCO'], ['SBP-*'], ['SBP-FRA', 'FRA-FCO', 'SFO-FCO', 'SFO-FRA']])
    assert.ok(result.itineraries.some((itinerary) =>
      itinerary.segments.map((segment) => `${segment.origin}-${segment.destination}`).join('>') === 'SBP-SFO>SFO-FRA>FRA-FCO'
    ))
  })

  it('discovers a three-leg arbitrary route from provider-backed onward hub departures', async () => {
    const calls: string[][] = []
    const result = await runSearchPipelineWithExecution(airportPairRequest('GEG', 'NAP'), {
      now,
      adapters: {
        discoverGateways: () => [],
        generateStrategies: () => [],
        generateRecommendations: (_mission, _strategies, _profile, options) => ({
          missionSummary: [],
          generatedAt: (options.now || now).toISOString(),
          dataQuality: 'low' as const,
          warnings: [],
          recommendations: []
        }),
        assembleItineraries: () => []
      },
      executionProviders: [connectionExecutionProvider(calls, {
        'GEG-*': [executionSegment('GEG', 'SEA', 'AS710', '2026-07-27T12:12:00Z', '2026-07-27T13:30:00Z')],
        'SEA-*': [executionSegment('SEA', 'CDG', 'DL80', '2026-07-27T18:00:00Z', '2026-07-28T08:30:00Z')],
        'CDG-NAP': [executionSegment('CDG', 'NAP', 'AF1578', '2026-07-28T11:00:00Z', '2026-07-28T13:15:00Z')]
      })],
      maxProviderRoutePairs: 8
    })

    assert.deepEqual(calls, [['GEG-NAP'], ['GEG-*'], ['SEA-NAP'], ['SEA-*'], ['CDG-NAP', 'CDG-NAP']])
    assert.ok(result.itineraries.some((itinerary) =>
      itinerary.segments.map((segment) => `${segment.origin}-${segment.destination}-${segment.schedule.flightNumber}`).join('|') ===
      'GEG-SEA-AS710|SEA-CDG-DL80|CDG-NAP-AF1578'
    ))
  })

  it('caps airport-set direct provider fanout for metro searches', async () => {
    const calls: string[][] = []
    await runSearchPipelineWithExecution({
      ...airportPairRequest('JFK', 'CDG'),
      preferredDepartureAirports: ['JFK', 'EWR', 'LGA'],
      preferredDestinations: ['CDG', 'ORY']
    }, {
      now,
      executionProviders: [connectionExecutionProvider(calls, {})],
      maxProviderRoutePairs: 4
    })

    assert.deepEqual(calls[0], ['JFK-CDG', 'JFK-ORY', 'EWR-CDG', 'EWR-ORY'])
  })

  it('does not treat downstream-only provider records as complete requested journeys', async () => {
    const result = await runSearchPipelineWithExecution(airportPairRequest('SBP', 'FCO'), {
      now,
      adapters: airportConnectionCoverageAdapters('SBP', 'FCO', ['FRA']),
      executionProviders: [connectionExecutionProvider([], {
        'FRA-FCO': [executionSegment('FRA', 'FCO', 'LH232', '2026-07-28T11:00:00Z', '2026-07-28T12:45:00Z')]
      })]
    })

    assert.equal(result.itineraries.some((itinerary) =>
      itinerary.segments.length === 1 &&
      itinerary.segments[0].origin === 'FRA' &&
      itinerary.segments[0].destination === 'FCO' &&
      itinerary.segments[0].schedule.flightNumber === 'LH232'
    ), false)
  })

  it('rejects origin-first chains when timing is invalid', async () => {
    const result = await runSearchPipelineWithExecution(airportPairRequest('SBP', 'FCO'), {
      now,
      adapters: airportConnectionCoverageAdapters('SBP', 'FCO', ['SFO']),
      executionProviders: [connectionExecutionProvider([], {
        'SBP-*': [executionSegment('SBP', 'SFO', 'UA500', '2026-07-27T14:00:00Z', '2026-07-27T15:20:00Z')],
        'SFO-FCO': [executionSegment('SFO', 'FCO', 'UA40', '2026-07-27T15:45:00Z', '2026-07-28T08:30:00Z')]
      })]
    })

    assert.equal(result.itineraries.some((itinerary) =>
      itinerary.segments.map((segment) => segment.schedule.flightNumber).join('+') === 'UA500+UA40'
    ), false)
  })

  it('deduplicates duplicate provider segments during origin-first composition', async () => {
    const duplicate = executionSegment('SBP', 'SFO', 'UA500', '2026-07-27T14:00:00Z', '2026-07-27T15:20:00Z')
    const result = await runSearchPipelineWithExecution(airportPairRequest('SBP', 'FCO'), {
      now,
      adapters: airportConnectionCoverageAdapters('SBP', 'FCO', ['SFO']),
      executionProviders: [connectionExecutionProvider([], {
        'SBP-*': [duplicate, { ...duplicate }],
        'SFO-FCO': [executionSegment('SFO', 'FCO', 'UA40', '2026-07-27T18:00:00Z', '2026-07-28T08:30:00Z')]
      })]
    })

    assert.equal(result.itineraries.filter((itinerary) =>
      itinerary.segments.map((segment) => segment.schedule.flightNumber).join('+') === 'UA500+UA40'
    ).length, 1)
  })

  it('preserves fanout caps for origin-first connection discovery', async () => {
    const calls: string[][] = []
    await runSearchPipelineWithExecution(airportPairRequest('SBP', 'FCO'), {
      now,
      adapters: airportConnectionCoverageAdapters('SBP', 'FCO', ['FRA', 'MUC']),
      executionProviders: [connectionExecutionProvider(calls, {
        'SBP-*': [
          executionSegment('SBP', 'SFO', 'UA523', '2026-07-27T14:00:00Z', '2026-07-27T15:20:00Z'),
          executionSegment('SBP', 'LAX', 'UA600', '2026-07-27T14:30:00Z', '2026-07-27T15:40:00Z')
        ]
      })],
      maxConnectionHubsSearched: 2,
      maxOriginFirstHubsSearched: 1,
      maxProviderRoutePairs: 6
    })

    assert.deepEqual(calls, [['SBP-FCO'], ['SBP-*'], ['SBP-FRA', 'FRA-FCO', 'SBP-MUC', 'MUC-FCO']])
  })

  it('keeps framework routes secondary when real scheduled itineraries exist', async () => {
    const result = await runSearchPipelineWithExecution(compositionRequest(), {
      now,
      adapters: connectionCoverageAdapters(['SFO']),
      executionProviders: [connectionExecutionProvider([], {
        'LAX-HND': [executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z')]
      })]
    })

    const scheduled = result.itineraries.filter((itinerary) => itinerary.segments.every((segment) => !segment.schedule.flightNumber.startsWith('Unknown')))
    const framework = result.itineraries.filter((itinerary) => itinerary.segments.some((segment) => segment.schedule.flightNumber.startsWith('Unknown')))
    assert.ok(scheduled.length > 0)
    assert.ok(framework.length > 0)
    assert.ok(result.itineraries.indexOf(scheduled[0]) < result.itineraries.indexOf(framework[0]))
  })

  it('promotes a provider-supported same-airport hub over a hub with only one supported leg', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: multiConnectionAdapters(['SEA', 'SFO']),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SEA', 'AS200', '2026-07-27T07:00:00Z', '2026-07-27T10:00:00Z')),
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z'))
      ])
    })

    assert.deepEqual(result.itineraries[0].segments.map((segment) => segment.schedule.flightNumber), ['AA100', 'JL1'])
    assert.equal(result.itineraries[0].providerHubQuality?.hub, 'SFO')
    assert.equal(result.itineraries[0].providerHubQuality?.feasible, true)
  })

  it('does not promote a hub when provider leg timing is impossible', () => {
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: multiConnectionAdapters(['SFO']),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T11:00:00Z', '2026-07-28T02:00:00Z'))
      ])
    })

    assert.equal(result.itineraries.some((itinerary) =>
      itinerary.providerHubQuality?.hub === 'SFO' && itinerary.providerHubQuality.feasible
    ), false)
    assert.equal(frameworkItinerary(result)?.segments[1].schedule.flightNumber, 'Unknown - not provided by route framework')
  })

  it('does not inflate provider hub quality from duplicate overlapping provider records', () => {
    const firstLeg = executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z'))
    const duplicateFirstLeg = executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z'))
    duplicateFirstLeg.id = 'provider-aa100-duplicate'
    const secondLeg = executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z'))
    const duplicateSecondLeg = executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z'))
    duplicateSecondLeg.id = 'provider-jl1-duplicate'
    const result = runSearchPipeline(compositionRequest(), {
      now,
      adapters: multiConnectionAdapters(['SFO']),
      executionResult: executionResult([firstLeg, duplicateFirstLeg, secondLeg, duplicateSecondLeg])
    })
    const composed = result.itineraries.find((itinerary) => itinerary.providerHubQuality?.hub === 'SFO')

    assert.deepEqual(composed?.providerHubQuality?.legOptionCounts, [1, 1])
  })

  it('marks a fully eligible direct scheduled itinerary as ZED eligible', () => {
    const result = runSearchPipeline(zedRequest({ travelerProfile: zedProfile(['AA']) }), {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z'))
      ])
    })
    const direct = scheduledItinerary(result, 'AA169')

    assert.equal(direct?.zedEligibility?.status, 'eligible')
    assert.deepEqual(direct?.zedEligibility?.eligibleCarriers, ['AA'])
  })

  it('marks a confirmed unavailable carrier as ZED not eligible', () => {
    const result = runSearchPipeline(zedRequest({ travelerProfile: zedProfile(['UA']) }), {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z'))
      ])
    })
    const direct = scheduledItinerary(result, 'AA169')

    assert.equal(direct?.zedEligibility?.status, 'not_eligible')
    assert.deepEqual(direct?.zedEligibility?.ineligibleCarriers, ['AA'])
  })

  it('keeps ZED eligibility unknown when profile agreement data is missing', () => {
    const result = runSearchPipeline(zedRequest({ travelerProfile: profile('Employee') }), {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z'))
      ])
    })

    assert.equal(scheduledItinerary(result, 'AA169')?.zedEligibility?.status, 'unknown')
  })

  it('marks a mixed multi-leg itinerary as partially eligible when one carrier is unknown', () => {
    const unknownCarrierLeg = executionItinerary(executionSegment('SFO', 'HND', 'JL1', '2026-07-27T14:00:00Z', '2026-07-28T02:00:00Z'))
    unknownCarrierLeg.segments[0] = {
      ...unknownCarrierLeg.segments[0],
      carrier: undefined,
      airlineCode: undefined,
      airlineName: undefined
    }
    const result = runSearchPipeline(zedRequest({ travelerProfile: zedProfile(['AA']) }), {
      now,
      adapters: compositionAdapters([
        frameworkSegment('LAX', 'SFO'),
        frameworkSegment('SFO', 'HND')
      ]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'SFO', 'AA100', '2026-07-27T10:00:00Z', '2026-07-27T12:00:00Z')),
        unknownCarrierLeg
      ])
    })

    assert.equal(frameworkItinerary(result)?.zedEligibility?.status, 'partial')
    assert.deepEqual(frameworkItinerary(result)?.zedEligibility?.eligibleCarriers, ['AA'])
    assert.ok(frameworkItinerary(result)?.zedEligibility?.unknownCarriers.includes('carrier unknown'))
  })

  it('requires whole-party eligibility before labeling an itinerary ZED eligible', () => {
    const result = runSearchPipeline(zedRequest({
      travelerProfile: zedProfile(['AA'], ['Employee'], [
        { id: 'employee', travelerType: 'employee' },
        { id: 'spouse', travelerType: 'spouse' }
      ])
    }), {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z'))
      ])
    })

    assert.equal(scheduledItinerary(result, 'AA169')?.zedEligibility?.status, 'not_eligible')
  })

  it('does not infer ZED eligibility from a flight number when carrier is unknown', () => {
    const unknownCarrier = executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z'))
    unknownCarrier.segments[0] = {
      ...unknownCarrier.segments[0],
      carrier: undefined,
      airlineCode: undefined,
      airlineName: undefined
    }
    const result = runSearchPipeline(zedRequest({ travelerProfile: zedProfile(['AA']) }), {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([unknownCarrier])
    })

    assert.equal(scheduledItinerary(result, 'AA169')?.zedEligibility?.status, 'unknown')
  })

  it('ranks an eligible scheduled itinerary ahead of a comparable confirmed ineligible itinerary', () => {
    const result = runSearchPipeline(zedRequest({ travelerProfile: zedProfile(['AA']) }), {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'DL7', '2026-07-27T07:00:00Z', '2026-07-27T19:00:00Z')),
        executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z'))
      ])
    })
    const scheduled = result.itineraries.filter((itinerary) => itinerary.segments.every((segment) => !segment.schedule.flightNumber.startsWith('Unknown')))

    assert.equal(scheduled[0].segments[0].schedule.flightNumber, 'AA169')
    assert.equal(scheduled[0].zedEligibility?.status, 'eligible')
  })

  it('preserves confirmed ineligible revenue backups when revenue is allowed', () => {
    const result = runSearchPipeline(zedRequest({ travelerProfile: zedProfile(['AA']), allowRevenue: true }), {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'DL7', '2026-07-27T07:00:00Z', '2026-07-27T19:00:00Z'))
      ])
    })
    const backup = scheduledItinerary(result, 'DL7')

    assert.equal(backup?.zedEligibility?.status, 'not_eligible')
    assert.equal(backup?.zedEligibility?.revenueAlternative, true)
    assert.deepEqual(backup?.revenueAirlines, ['DL'])
  })

  it('does not empty the result set when no eligible itinerary exists', () => {
    const result = runSearchPipeline(zedRequest({ travelerProfile: zedProfile(['AA']) }), {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'DL7', '2026-07-27T07:00:00Z', '2026-07-27T19:00:00Z'))
      ])
    })

    assert.ok(result.itineraries.length > 0)
    assert.equal(scheduledItinerary(result, 'DL7')?.zedEligibility?.status, 'not_eligible')
  })

  it('does not crash and leaves eligibility unknown when the traveler profile is missing', () => {
    const result = runSearchPipeline({ ...zedRequest(), travelerProfile: undefined }, {
      now,
      adapters: connectionCoverageAdapters([]),
      executionResult: executionResult([
        executionItinerary(executionSegment('LAX', 'HND', 'AA169', '2026-07-27T08:00:00Z', '2026-07-27T20:00:00Z'))
      ])
    })

    assert.equal(scheduledItinerary(result, 'AA169')?.zedEligibility?.status, 'unknown')
  })
})

function compositionRequest(): NaturalSearchObject {
  return {
    origin: 'LAX',
    destination: 'HND',
    departureDate: '2026-07-27',
    travelerCount: 1,
    travelerProfile: profile('Employee')
  }
}

function airportPairRequest(origin: string, destination: string): NaturalSearchObject {
  return {
    ...compositionRequest(),
    origin,
    destination
  }
}

function compositionAdapters(segments: BetaItinerarySegment[]): SearchPipelineAdapters {
  return {
    discoverGateways: () => [gateway('HND')],
    generateStrategies: () => [],
    generateRecommendations: (_mission, _strategies, _profile, options) => ({
      missionSummary: [],
      generatedAt: (options.now || now).toISOString(),
      dataQuality: 'medium' as const,
      warnings: [],
      recommendations: [{
        id: 'recommendation-composition',
        rank: 1,
        label: 'Plan A' as const,
        status: 'viable' as const,
        plan: plan('HND', segments.map((segment) => ({
          origin: segment.origin,
          destination: segment.destination,
          transportType: segment.mode,
          carrier: segment.carrier,
          notes: 'Provider validation required'
        }))),
        finalScore: 80,
        confidence: 76,
        estimatedSuccess: 78,
        wholePartyZedEligible: false,
        eligibleZedAirlines: [],
        risks: [],
        explanation: {
          summary: 'Composition fixture summary.',
          strengths: ['provider candidates may attach'],
          weaknesses: ['live loads unavailable'],
          switchConditions: ['switch if schedule validation fails']
        },
        dataWarnings: []
      }]
    }),
    assembleItineraries: () => [betaItineraryWithSegments(segments)]
  }
}

function zedRequest(overrides: Partial<NaturalSearchObject> = {}): NaturalSearchObject {
  return {
    ...compositionRequest(),
    allowZed: true,
    ...overrides
  }
}

function zedProfile(
  airlineCodes: string[],
  eligibleTravelerTypes: Array<TravelerProfileScaffold['travelingParty'][number]['travelerType']> = ['employee'],
  travelingParty: TravelerProfileScaffold['travelingParty'] = [{ id: 'employee', travelerType: 'employee' }]
) {
  return normalizeTravelerProfile({
    travelerType: 'Employee',
    travelingParty,
    zedAgreements: airlineCodes.map((airlineCode) => ({
      id: `zed-${airlineCode.toLowerCase()}`,
      airlineCode,
      airlineName: airlineCode,
      agreementType: 'ZED' as const,
      bookingPlatform: 'myIDTravel' as const,
      eligibleTravelerTypes,
      cabinAccess: ['economy'],
      verificationStatus: 'employer_verified' as const,
      verifiedAt: now.toISOString(),
      active: true
    }))
  } as Partial<TravelerProfileScaffold>)
}

function scheduledItinerary(result: ReturnType<typeof runSearchPipeline>, flightNumber: string) {
  return result.itineraries.find((itinerary) =>
    itinerary.segments.some((segment) => segment.schedule.flightNumber === flightNumber)
  )
}

function connectionCoverageAdapters(hubCodes: string[]): SearchPipelineAdapters {
  const segments = hubCodes.length
    ? [frameworkSegment('LAX', hubCodes[0]), frameworkSegment(hubCodes[0], 'HND')]
    : [frameworkSegment('LAX', 'HND')]
  return {
    ...compositionAdapters(segments),
    discoverGateways: () => hubCodes.map((code, index) => ({
      ...gateway(code),
      score: 95 - index,
      onwardConnectivityScore: 95 - index,
      zedCoverageScore: 90 - index
    }))
  }
}

function airportConnectionCoverageAdapters(origin: string, destination: string, hubCodes: string[]): SearchPipelineAdapters {
  const segments = hubCodes.length
    ? [frameworkSegment(origin, hubCodes[0]), frameworkSegment(hubCodes[0], destination)]
    : [frameworkSegment(origin, destination)]
  return {
    ...compositionAdapters(segments),
    discoverGateways: () => hubCodes.map((code, index) => ({
      ...gateway(code),
      score: 95 - index,
      onwardConnectivityScore: 95 - index,
      zedCoverageScore: 90 - index
    }))
  }
}

function multiConnectionAdapters(hubCodes: string[]): SearchPipelineAdapters {
  return {
    ...compositionAdapters(hubCodes.length
      ? [frameworkSegment('LAX', hubCodes[0]), frameworkSegment(hubCodes[0], 'HND')]
      : [frameworkSegment('LAX', 'HND')]),
    assembleItineraries: () => hubCodes.map((hubCode, index) => ({
      ...betaItineraryWithSegments([frameworkSegment('LAX', hubCode), frameworkSegment(hubCode, 'HND')]),
      id: index === 0 ? 'composition-framework' : `composition-framework-${hubCode.toLowerCase()}`,
      gateway: hubCode,
      recommendationRank: index + 1,
      shortSummary: `Plan A: composition fixture framework via ${hubCode}.`,
      detailedSummary: `Route framework via ${hubCode} requires provider schedule validation.`
    }))
  }
}

function connectionExecutionProvider(
  calls: string[][],
  schedulesByPair: Record<string, SearchExecutionSegment[]>
): SearchExecutionProvider {
  return {
    id: 'connection-test-provider',
    name: 'Connection Test Provider',
    readiness: { enabled: true, status: 'ready' },
    capabilities: { schedules: true, routeSearch: true, loads: false },
    search: async (request) => {
      const pairs = (request.routeSegments || []).map((segment) => `${segment.origin}-${segment.destination}`)
      calls.push(pairs)
      return {
        itineraries: pairs.flatMap((pair) => (schedulesByPair[pair] || []).map(executionItinerary)),
        status: pairs.some((pair) => schedulesByPair[pair]?.length) ? 'success' : 'skipped',
        diagnostics: {
          recordsReceived: pairs.reduce((total, pair) => total + (schedulesByPair[pair]?.length || 0), 0),
          recordsNormalized: pairs.reduce((total, pair) => total + (schedulesByPair[pair]?.length || 0), 0),
          recordsMatched: pairs.reduce((total, pair) => total + (schedulesByPair[pair]?.length || 0), 0),
          recordsUnmatched: 0,
          requestCount: pairs.length,
          cached: false,
          retryUsed: false,
          fetchedAt: now.toISOString()
        }
      }
    }
  }
}

function frameworkItinerary(result: ReturnType<typeof runSearchPipeline>) {
  return result.itineraries.find((itinerary) => itinerary.id === 'composition-framework')
}

function frameworkSegment(origin: string, destination: string, carrier?: string): BetaItinerarySegment {
  return {
    id: `framework-${origin}-${destination}`.toLowerCase(),
    origin,
    destination,
    mode: 'flight',
    ...(carrier ? { carrier } : {}),
    schedule: {
      flightNumber: 'Unknown - not provided by route framework',
      departureTime: 'Unknown - provider schedule validation required',
      arrivalTime: 'Unknown - provider schedule validation required',
      seatCount: 'Unknown - live load data not attached'
    },
    estimatedDuration: 'Unknown - provider schedule validation required',
    notes: ['Flight number, departure time, arrival time, and live loads are not attached.']
  }
}

function betaItineraryWithSegments(segments: BetaItinerarySegment[]): BetaItinerary {
  return {
    ...betaItineraryFixture(),
    id: 'composition-framework',
    origin: segments[0]?.origin || 'LAX',
    gateway: segments.at(-1)?.destination || 'HND',
    destination: segments.at(-1)?.destination || 'HND',
    segments,
    connectionCount: Math.max(0, segments.length - 1),
    recommendationRank: 1,
    recommendationLabel: 'Plan A',
    shortSummary: 'Plan A: composition fixture framework.',
    detailedSummary: 'Route framework requires provider schedule validation.',
    travelTimeline: segments.map((segment, index) => ({
      step: index + 1,
      title: `${segment.origin} to ${segment.destination}`,
      description: 'flight; exact schedule is unknown.',
      scheduleStatus: 'Flight number, departure time, arrival time, and load data unknown.'
    }))
  }
}

function executionSegment(
  origin: string,
  destination: string,
  flightNumber: string,
  departureTime: string,
  arrivalTime: string
): SearchExecutionSegment {
  const carrier = flightNumber.match(/^[A-Z]+/)?.[0] || 'AA'
  return {
    origin,
    destination,
    transportType: 'flight',
    carrier,
    airlineCode: carrier,
    flightNumber,
    departureTime,
    arrivalTime,
    scheduledDeparture: departureTime,
    scheduledArrival: arrivalTime,
    scheduledDepartureUtc: departureTime,
    scheduledArrivalUtc: arrivalTime,
    departureTimeZone: origin === 'HND' || origin === 'NRT' ? 'Asia/Tokyo' : 'America/Los_Angeles',
    arrivalTimeZone: destination === 'HND' || destination === 'NRT' ? 'Asia/Tokyo' : 'America/Los_Angeles',
    departureAirportTimeZone: origin === 'HND' || origin === 'NRT' ? 'Asia/Tokyo' : 'America/Los_Angeles',
    arrivalAirportTimeZone: destination === 'HND' || destination === 'NRT' ? 'Asia/Tokyo' : 'America/Los_Angeles',
    scheduleStatus: 'Provider schedule candidate',
    providerId: 'test-provider',
    providerRecordId: `${flightNumber}-${origin}-${destination}-${departureTime}`,
    fetchedAt: now.toISOString(),
    sourceConfidence: 'provider_reported',
    providerSuppliedFields: ['flightNumber', 'scheduledDeparture', 'scheduledArrival']
  }
}

function executionItinerary(segment: SearchExecutionSegment): SearchExecutionResult['itineraries'][number] {
  return {
    id: `provider-${segment.flightNumber}`,
    dataQuality: 'high',
    providerAttribution: [{
      providerId: 'test-provider',
      providerName: 'Test provider',
      providerRecordIds: segment.providerRecordId ? [segment.providerRecordId] : [],
      fetchedAt: segment.fetchedAt,
      fields: segment.providerSuppliedFields
    }],
    segments: [segment],
    warnings: []
  }
}

function executionResult(itineraries: SearchExecutionResult['itineraries']): SearchExecutionResult {
  return {
    request: {
      mission: normalizeSearchMission(compositionRequest()),
      tripType: 'one_way',
      travelerCount: 1,
      travelerProfile: profile('Employee'),
      routeSegments: []
    },
    itineraries,
    providerRuns: [],
    providerHealth: [],
    warnings: [],
    dataQuality: itineraries.length ? 'high' : 'low'
  }
}

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
